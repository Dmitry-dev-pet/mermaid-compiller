const promptInput = document.getElementById("prompt-input");
const generateButton = document.getElementById("generate-button");
const renderArea = document.getElementById("mermaid-render-area");
const statusBox = document.getElementById("status-messages");
const modelSelect = document.getElementById("model-select");
const downloadButton = document.getElementById("download-button");
const undoButton = document.getElementById("undo-button");
const reasoningOutput = document.getElementById("model-reasoning-output");

let currentDiagramCode = "";
let originalUserPrompt = "";
let retryCount = 0;
let previousDiagramCode = "";
const maxRetries = 5;
const cliproxyApiUrl = "http://localhost:8317/v1/chat/completions";
const cliproxyApiToken = "test";
let cliproxyApiModel = "gpt-5.1-codex-mini";
const cliproxyModelsUrl = "http://localhost:8317/v1/models";
const docsSearchUrl = "/docs/search";

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });

const setButtonState = (isLoading) => {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? "Working..." : "Generate";
};

const displayStatus = (message, type = "info") => {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
};

const displayRawCode = (code) => {
  const codeOutput = document.getElementById("mermaid-code-output");
  if (!codeOutput) return;
  codeOutput.textContent = code || "";
};

const displayReasoning = (text) => {
  if (!reasoningOutput) return;
  reasoningOutput.textContent = text || "";
};

const updateDownloadButtonState = () => {
  if (!downloadButton) return;
  downloadButton.disabled = !currentDiagramCode;
};

const updateUndoButtonState = () => {
  if (!undoButton) return;
  undoButton.disabled = !previousDiagramCode;
};

const renderMermaidDiagram = async (code) => {
  try {
    const { svg, bindFunctions } = await mermaid.render("diagram", code);
    renderArea.innerHTML = svg;
    if (bindFunctions) {
      bindFunctions(renderArea);
    }
  } catch (error) {
    renderArea.innerHTML = "";
    throw error;
  }
};

const validateMermaidCode = async (code) => {
  try {
    const result = await mermaid.parse(code);
    return { isValid: Boolean(result), errors: [] };
  } catch (error) {
    const message = error?.message || String(error);
    return { isValid: false, errors: [message] };
  }
};

const buildPrompt = (userPrompt, validationErrors, previousCode, docsContext) => {
  const trimmedDocs = docsContext && typeof docsContext === "string" ? docsContext.trim() : "";
  if (previousCode && !validationErrors.length) {
    const docsBlock = trimmedDocs
      ? `\n\nRelevant Mermaid documentation (snippets):\n${trimmedDocs}`
      : "";
    return `${userPrompt}\n\nYou are updating an existing Mermaid diagram. Here is the current diagram:\n${previousCode}${docsBlock}\n\nPlease update this diagram according to the new instructions while keeping it syntactically valid.`;
  }
  if (!validationErrors.length || !previousCode) return userPrompt;
  const docsBlock = trimmedDocs
    ? `\n\nRelevant Mermaid documentation (snippets):\n${trimmedDocs}`
    : "";
  return `${userPrompt}\n\nThe previous Mermaid code was invalid.\nErrors: ${validationErrors.join("; ")}${docsBlock}\nPlease fix the diagram while keeping the intent.`;
};

const extractMermaidCode = (text) => {
  if (!text || typeof text !== "string") return "";
  const fenced = text.match(/```mermaid([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim();
  }
  return text.trim();
};

const initModelSelection = async () => {
  if (!modelSelect) return;

  const fallbackModel = cliproxyApiModel;
  modelSelect.innerHTML = "";

  const fallbackOption = document.createElement("option");
  fallbackOption.value = fallbackModel;
  fallbackOption.textContent = fallbackModel;
  modelSelect.appendChild(fallbackOption);
  modelSelect.value = fallbackModel;

  try {
    const response = await fetch(cliproxyModelsUrl, {
      headers: {
        Authorization: `Bearer ${cliproxyApiToken}`,
      },
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    if (!models.length) return;

    modelSelect.innerHTML = "";

    models
      .filter((m) => m && typeof m.id === "string")
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.id;
        modelSelect.appendChild(option);
      });

    if (models.some((m) => m.id === fallbackModel)) {
      modelSelect.value = fallbackModel;
      cliproxyApiModel = fallbackModel;
    } else if (models[0]?.id) {
      modelSelect.value = models[0].id;
      cliproxyApiModel = models[0].id;
    }
  } catch {
    // Use fallback option silently
  }
};

const fetchDocsContext = async (query) => {
  try {
    const trimmed = (query || "").trim();
    if (!trimmed) return "";

    const limitedQuery = trimmed.slice(0, 80);
    const response = await fetch(`${docsSearchUrl}?q=${encodeURIComponent(limitedQuery)}`);
    if (!response.ok) return "";

    const data = await response.json();
    const items = Array.isArray(data?.results) ? data.results : [];
    if (!items.length) return "";

    return items
      .map((item) => item && typeof item.snippet === "string" ? item.snippet.trim() : "")
      .filter((snippet) => snippet)
      .slice(0, 3)
      .join("\n---\n");
  } catch {
    return "";
  }
};

const callCliproxyApi = async (promptMessage, contextDiagramCode) => {
  const systemPrompt =
    "You are an assistant that generates only valid Mermaid diagram code. " +
    "Return only the Mermaid code without markdown fences or explanations.";

  const userContent = contextDiagramCode
    ? `${promptMessage}\n\nCurrent Mermaid diagram:\n${contextDiagramCode}`
    : promptMessage;

  const payload = {
    model: cliproxyApiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(cliproxyApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cliproxyApiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`cliproxyapi error: ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  const reasoning =
    data?.choices?.[0]?.message?.reasoning_content || data?.choices?.[0]?.reasoning_content || "";
  const candidate = extractMermaidCode(rawContent);
  if (!candidate) {
    throw new Error("cliproxyapi response missing Mermaid code");
  }
  return { code: candidate.trim(), reasoning: reasoning || "" };
};

const generateAndCorrectDiagram = async (userPrompt) => {
  originalUserPrompt = userPrompt.trim();
  if (!originalUserPrompt) {
    displayStatus("Enter a prompt to generate a diagram.", "error");
    return;
  }

  const hasExistingDiagram = Boolean(currentDiagramCode);

  setButtonState(true);
  displayRawCode("");
  renderArea.innerHTML = "";

  retryCount = 0;
  let lastErrors = [];
  let workingDiagramCode = currentDiagramCode;

  const docsContext = await fetchDocsContext(originalUserPrompt);

  while (retryCount < maxRetries) {
    try {
      const attemptNumber = retryCount + 1;
      if (attemptNumber === 1) {
        if (hasExistingDiagram) {
          displayStatus(`Updating diagram (attempt ${attemptNumber} of ${maxRetries})...`, "info");
        } else {
          displayStatus(`Generating diagram (attempt ${attemptNumber} of ${maxRetries})...`, "info");
        }
      } else {
        if (hasExistingDiagram) {
          displayStatus(`Retrying update (attempt ${attemptNumber} of ${maxRetries})...`, "info");
        } else {
          displayStatus(`Retrying generation (attempt ${attemptNumber} of ${maxRetries})...`, "info");
        }
      }

      const promptToSend = buildPrompt(
        originalUserPrompt,
        lastErrors,
        workingDiagramCode,
        docsContext,
      );
      const { code: candidateCode, reasoning } = await callCliproxyApi(
        promptToSend,
        workingDiagramCode,
      );
      displayReasoning(reasoning);
      const validation = await validateMermaidCode(candidateCode);

      if (validation.isValid) {
        if (currentDiagramCode) {
          previousDiagramCode = currentDiagramCode;
        }
        currentDiagramCode = candidateCode;
        workingDiagramCode = candidateCode;
        await renderMermaidDiagram(currentDiagramCode);
        displayRawCode(currentDiagramCode);
        displayStatus("Diagram generated successfully.", "success");
        updateDownloadButtonState();
        updateUndoButtonState();
        setButtonState(false);
        return;
      }

      lastErrors = validation.errors;
      workingDiagramCode = candidateCode;
      retryCount += 1;
      displayStatus(`Validation failed (attempt ${retryCount} of ${maxRetries}): ${lastErrors.join("; ")}`, "error");
    } catch (error) {
      displayStatus(`Generation error: ${error?.message || error}`, "error");
      setButtonState(false);
      return;
    }
  }

  displayStatus("Failed to produce a valid diagram after retries.", "error");
  displayRawCode(currentDiagramCode);
  setButtonState(false);
};

generateButton.addEventListener("click", () => {
  generateAndCorrectDiagram(promptInput.value);
});

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    if (!currentDiagramCode) {
      displayStatus("No diagram available to download.", "error");
      return;
    }

    const blob = new Blob([currentDiagramCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "diagram.mmd";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

if (undoButton) {
  undoButton.addEventListener("click", async () => {
    if (!previousDiagramCode) return;

    const target = previousDiagramCode;
    currentDiagramCode = target;
    previousDiagramCode = "";

    try {
      await renderMermaidDiagram(currentDiagramCode);
      displayStatus("Reverted to previous diagram.", "info");
    } catch (error) {
      displayStatus(`Failed to render previous diagram: ${error?.message || error}`, "error");
    }

    updateDownloadButtonState();
    updateUndoButtonState();
  });
}

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    if (modelSelect.value) {
      cliproxyApiModel = modelSelect.value;
    }
  });
}

initModelSelection();

updateDownloadButtonState();
updateUndoButtonState();

displayStatus("Waiting for a prompt.", "info");
