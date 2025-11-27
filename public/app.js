const promptInput = document.getElementById("prompt-input");
const generateButton = document.getElementById("generate-button");
const renderArea = document.getElementById("mermaid-render-area");
const statusBox = document.getElementById("status-messages");
const modelSelect = document.getElementById("model-select");
const proxyInput = document.getElementById("proxy-url-input");
const proxyStatusIndicator = document.getElementById("proxy-status-indicator");
const downloadButton = document.getElementById("download-button");
const undoButton = document.getElementById("undo-button");
const reasoningOutput = document.getElementById("model-reasoning-output");
const vendorFilterButton = document.getElementById("vendor-filter");

let currentDiagramCode = "";
let originalUserPrompt = "";
let retryCount = 0;
let previousDiagramCode = "";
const maxRetries = 5;
const cliproxyApiToken = "test";
const defaultCliproxyBaseUrl = "http://localhost:8317";
let cliproxyBaseUrl = defaultCliproxyBaseUrl;
let cliproxyApiModel = "";
const docsSearchUrl = "/docs/search";
let allModels = [];
let currentModelFilter = "all";

const getCliproxyChatUrl = () => `${cliproxyBaseUrl}/v1/chat/completions`;
const getCliproxyModelsUrl = () => `${cliproxyBaseUrl}/v1/models`;

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

const setProxyStatus = (status) => {
  if (!proxyStatusIndicator) return;
  let className = "proxy-indicator";
  if (status === "ok") {
    className += " proxy-indicator-ok";
  } else if (status === "error") {
    className += " proxy-indicator-error";
  } else {
    className += " proxy-indicator-unknown";
  }
  proxyStatusIndicator.className = className;
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

const extractRussianSummary = (text) => {
  if (!text || typeof text !== "string") return "";
  const marker = "RU_SUMMARY:";
  const index = text.indexOf(marker);
  if (index === -1) return "";
  return text.slice(index + marker.length).trim();
};

const updateModelSelectWidth = () => {
  if (!modelSelect || !allModels.length) return;
  const maxLen = allModels.reduce((max, m) => {
    const id = m.id || "";
    return id.length > max ? id.length : max;
  }, 0);

  const minCh = 12;
  const paddingCh = 4;
  const widthCh = Math.max(minCh, maxLen + paddingCh);
  modelSelect.style.minWidth = `${widthCh}ch`;
};

const getModelVendor = (model) => {
  const id = (model.id || "").toLowerCase();
  if (id.startsWith("gpt-")) return "gpt";
  if (id.startsWith("gemini-")) return "gemini";
  return "";
};

const pickLatestModelId = (models) => {
  if (!models.length) return null;
  let best = models[0];
  for (const m of models) {
    if (typeof m.created === "number" && typeof best.created === "number") {
      if (m.created > best.created) {
        best = m;
      }
    } else if ((m.id || "") > (best.id || "")) {
      best = m;
    }
  }
  return best.id || null;
};

const parseGptVersion = (id) => {
  if (!id) return 0;
  const match = id.match(/^gpt-(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) return 0;
  return value;
};

const pickLatestGptHighModelId = (models) => {
  const gptModels = models.filter((m) => getModelVendor(m) === "gpt");
  if (!gptModels.length) return null;

  let candidates = gptModels.filter((m) => (m.id || "").toLowerCase().includes("high"));
  if (!candidates.length) {
    candidates = gptModels;
  }

  let best = candidates[0];
  let bestVersion = parseGptVersion(best.id || "");

  for (const m of candidates) {
    const version = parseGptVersion(m.id || "");
    if (version > bestVersion) {
      best = m;
      bestVersion = version;
    } else if (version === bestVersion && (m.id || "") > (best.id || "")) {
      best = m;
    }
  }

  return best.id || null;
};

const applyModelFilter = (preferredModel) => {
  if (!modelSelect || !allModels.length) return;

  const filter = currentModelFilter;
  let candidates = allModels;

  if (filter === "gpt") {
    candidates = allModels.filter((m) => getModelVendor(m) === "gpt");
  } else if (filter === "gemini") {
    candidates = allModels.filter((m) => getModelVendor(m) === "gemini");
  }

  if (!candidates.length) {
    candidates = allModels;
  }

  const previousSelected = preferredModel || cliproxyApiModel;

  let targetId = null;
  if (previousSelected) {
    const match = candidates.find((m) => m.id === previousSelected);
    if (match) {
      targetId = match.id;
    }
  }

  if (!targetId) {
    if (filter === "gpt") {
      targetId = pickLatestGptHighModelId(allModels) || pickLatestModelId(allModels);
    } else if (filter === "gemini") {
      const geminiModels = allModels.filter((m) => getModelVendor(m) === "gemini");
      targetId = pickLatestModelId(geminiModels) || pickLatestModelId(allModels);
    } else {
      targetId = pickLatestGptHighModelId(allModels) || pickLatestModelId(allModels);
    }
  }

  if (!targetId) return;

  // rebuild options list to show only filtered models
  modelSelect.innerHTML = "";

  candidates
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.id;
      modelSelect.appendChild(option);
    });

  if (modelSelect.querySelector(`option[value="${targetId}"]`)) {
    modelSelect.value = targetId;
  }
  cliproxyApiModel = targetId;
  updateModelSelectWidth();
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
    const response = await fetch(getCliproxyModelsUrl(), {
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

    allModels = models.filter((m) => m && typeof m.id === "string");

    modelSelect.innerHTML = "";

    allModels
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.id;
        modelSelect.appendChild(option);
      });

    updateModelSelectWidth();
    applyModelFilter(fallbackModel);
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

const checkProxyAvailability = async () => {
  setProxyStatus("unknown");
  try {
    const response = await fetch(getCliproxyModelsUrl(), {
      headers: {
        Authorization: `Bearer ${cliproxyApiToken}`,
      },
    });
    if (response.ok) {
      setProxyStatus("ok");
    } else {
      setProxyStatus("error");
    }
  } catch {
    setProxyStatus("error");
  }
};

const callCliproxyApi = async (promptMessage, contextDiagramCode) => {
  const systemPrompt =
    "Ты помощник, который генерирует только валидный код диаграмм Mermaid. " +
    "Отвечай строго в таком формате: сначала блок ```mermaid ... ``` с кодом диаграммы, " +
    "затем на новой строке 'RU_SUMMARY:' и одну-две короткие фразы по-русски, " +
    "кратко описывающие, что изображает диаграмма.";

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

  const response = await fetch(getCliproxyChatUrl(), {
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
  const candidate = extractMermaidCode(rawContent);
  if (!candidate) {
    throw new Error("cliproxyapi response missing Mermaid code");
  }
  const summary = extractRussianSummary(rawContent);
  return { code: candidate.trim(), reasoning: summary };
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

if (proxyInput) {
  const initial = proxyInput.value.trim();
  if (initial) {
    cliproxyBaseUrl = initial;
  } else {
    proxyInput.value = cliproxyBaseUrl;
  }

  proxyInput.addEventListener("change", () => {
    const value = proxyInput.value.trim();
    cliproxyBaseUrl = value || defaultCliproxyBaseUrl;
    if (!proxyInput.value.trim()) {
      proxyInput.value = cliproxyBaseUrl;
    }
    initModelSelection();
    checkProxyAvailability();
  });

  checkProxyAvailability();
}

if (vendorFilterButton) {
  const order = ["all", "gpt", "gemini"];
  const labels = {
    all: "All",
    gpt: "gpt",
    gemini: "gemini",
  };

  vendorFilterButton.addEventListener("click", () => {
    const current = vendorFilterButton.dataset.modelFilter || "all";
    const index = order.indexOf(current);
    const next = index === -1 ? "all" : order[(index + 1) % order.length];

    vendorFilterButton.dataset.modelFilter = next;
    vendorFilterButton.textContent = labels[next] || next;
    currentModelFilter = next;

    applyModelFilter();
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
