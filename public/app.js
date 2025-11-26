const promptInput = document.getElementById("prompt-input");
const generateButton = document.getElementById("generate-button");
const renderArea = document.getElementById("mermaid-render-area");
const statusBox = document.getElementById("status-messages");

let currentDiagramCode = "";
let originalUserPrompt = "";
let retryCount = 0;
const maxRetries = 5;
const cliproxyApiUrl = "http://localhost:8317/v1/chat/completions";
const cliproxyApiToken = "test";
const cliproxyApiModel = "gpt-5.1-codex-mini";

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

const buildPrompt = (userPrompt, validationErrors, previousCode) => {
  if (!validationErrors.length || !previousCode) return userPrompt;
  return `${userPrompt}\n\nThe previous Mermaid code was invalid.\nErrors: ${validationErrors.join("; ")}\nPlease fix the diagram while keeping the intent.`;
};

const extractMermaidCode = (text) => {
  if (!text || typeof text !== "string") return "";
  const fenced = text.match(/```mermaid([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim();
  }
  return text.trim();
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
  const candidate = extractMermaidCode(rawContent);
  if (!candidate) {
    throw new Error("cliproxyapi response missing Mermaid code");
  }
  return candidate.trim();
};

const generateAndCorrectDiagram = async (userPrompt) => {
  originalUserPrompt = userPrompt.trim();
  if (!originalUserPrompt) {
    displayStatus("Enter a prompt to generate a diagram.", "error");
    return;
  }

  setButtonState(true);
  displayRawCode("");
  renderArea.innerHTML = "";

  currentDiagramCode = "";
  retryCount = 0;
  let lastErrors = [];

  while (retryCount < maxRetries) {
    try {
      const attemptNumber = retryCount + 1;
      if (attemptNumber === 1) {
        displayStatus(`Generating diagram (attempt ${attemptNumber} of ${maxRetries})...`, "info");
      } else {
        displayStatus(`Retrying generation (attempt ${attemptNumber} of ${maxRetries})...`, "info");
      }

      const promptToSend = buildPrompt(originalUserPrompt, lastErrors, currentDiagramCode);
      const candidateCode = await callCliproxyApi(promptToSend, currentDiagramCode);
      const validation = await validateMermaidCode(candidateCode);

      if (validation.isValid) {
        currentDiagramCode = candidateCode;
        await renderMermaidDiagram(currentDiagramCode);
        displayRawCode(currentDiagramCode);
        displayStatus("Diagram generated successfully.", "success");
        setButtonState(false);
        return;
      }

      lastErrors = validation.errors;
      currentDiagramCode = candidateCode;
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

displayStatus("Waiting for a prompt.", "info");
