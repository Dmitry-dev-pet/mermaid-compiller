import { sanitizeMermaidCode } from "./sanitize.js";
import {
  getState,
  updateCliproxyBaseUrl,
  setCliproxyApiModel,
  setSelectedDiagramType,
  setAllModels,
  setModelFilter,
  addIteration,
  setActiveIterationIndex,
  getActiveIteration,
  createIterationEntry,
  prepareUserPrompt,
} from "./state.js";
import {
  fetchDocsContext,
  fetchStyleDocsContext,
  callCliproxyApiStructure,
  callCliproxyApiStyle,
  callCliproxyApiFixStyle,
  buildPrompt,
  getCliproxyModelsUrl,
} from "./api.js";
import {
  setButtonState as setUIButtonState,
  displayStatus as displayStatusBox,
  setProxyStatus as setUIProxyStatus,
  openModal as openUIModal,
  closeModal as closeUIModal,
  renderMermaidDiagram as renderMermaidDiagramUI,
  updateModelSelectWidth as updateModelSelectWidthUI,
  renderIterationList as renderIterationListUI,
  formatPromptsModalContent,
  formatStageModalContent,
  formatContextModalContent,
} from "./ui.js";

const promptInput = document.getElementById("prompt-input");
const generateButton = document.getElementById("generate-button");
const renderArea = document.getElementById("mermaid-render-area");
const statusBox = document.getElementById("status-messages");
const modelSelect = document.getElementById("model-select");
const proxyInput = document.getElementById("proxy-url-input");
const proxyStatusIndicator = document.getElementById("proxy-status-indicator");
const vendorFilterButton = document.getElementById("vendor-filter");
const iterationList = document.getElementById("iteration-list");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");
const showCodeButton = document.getElementById("show-code-button");

const state = getState();
const iterations = state.iterations;

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });

const setButtonState = (isLoading, loadingLabel = "Работаю...") => {
  setUIButtonState(generateButton, isLoading, loadingLabel);
};

const displayStatus = (message, type = "info") => {
  displayStatusBox(statusBox, message, type);
};

const setProxyStatus = (status) => {
  setUIProxyStatus(proxyStatusIndicator, status);
};

const openModal = (title, body) => {
  openUIModal(modalOverlay, modalTitle, modalBody, title, body);
  if (modalClose) {
    modalClose.focus();
  }
};

const closeModal = () => {
  closeUIModal(modalOverlay);
};

const renderMermaidDiagram = async (code) => {
  await renderMermaidDiagramUI(renderArea, code);
};

const updateModelSelectWidth = () => {
  updateModelSelectWidthUI(modelSelect, state.allModels);
};

if (modalClose) {
  modalClose.addEventListener("click", () => closeModal());
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) {
      closeModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalOverlay.classList.contains("hidden")) {
    closeModal();
  }
});

const validateMermaidCode = async (code) => {
  try {
    const result = await mermaid.parse(code);
    return { isValid: Boolean(result), errors: [] };
  } catch (error) {
    const message = error?.message || String(error);
    return { isValid: false, errors: [message] };
  }
};

// prompt helpers provided by api.js

const getModelVendor = (model) => {
  const id = (model.id || "").toLowerCase();
  if (id.startsWith("gpt-")) return "gpt";
  if (id.startsWith("gemini-")) return "gemini";
  if (id.startsWith("glm-")) return "glm";
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
  const models = state.allModels;
  if (!modelSelect || !models.length) return;

  const filter = state.currentModelFilter;
  let candidates = models;

  if (filter === "gpt") {
    candidates = models.filter((m) => getModelVendor(m) === "gpt");
  } else if (filter === "gemini") {
    candidates = models.filter((m) => getModelVendor(m) === "gemini");
  } else if (filter === "glm") {
    candidates = models.filter((m) => getModelVendor(m) === "glm");
  }

  if (!candidates.length) {
    candidates = models;
  }

  const previousSelected = preferredModel || state.cliproxyApiModel;
  let targetId = null;
  if (previousSelected) {
    const match = candidates.find((m) => m.id === previousSelected);
    if (match) {
      targetId = match.id;
    }
  }

  if (!targetId) {
    if (filter === "gpt") {
      targetId = pickLatestGptHighModelId(models) || pickLatestModelId(models);
    } else if (filter === "gemini") {
      const geminiModels = models.filter((m) => getModelVendor(m) === "gemini");
      targetId = pickLatestModelId(geminiModels) || pickLatestModelId(models);
    } else if (filter === "glm") {
      const glmModels = models.filter((m) => getModelVendor(m) === "glm");
      targetId = pickLatestModelId(glmModels) || pickLatestModelId(models);
    } else {
      targetId = pickLatestGptHighModelId(models) || pickLatestModelId(models);
    }
  }

  if (!targetId) return;

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
  setCliproxyApiModel(targetId);
  updateModelSelectWidth();
};

const initModelSelection = async () => {
  if (!modelSelect) return;

  const fallbackModel = state.cliproxyApiModel;
  modelSelect.innerHTML = "";
  const fallbackOption = document.createElement("option");
  fallbackOption.value = fallbackModel;
  fallbackOption.textContent = fallbackModel;
  modelSelect.appendChild(fallbackOption);
  modelSelect.value = fallbackModel;

  try {
    const response = await fetch(getCliproxyModelsUrl(), {
      headers: {
        Authorization: `Bearer ${state.cliproxyApiToken}`,
      },
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    if (!models.length) return;

    setAllModels(models.filter((m) => m && typeof m.id === "string"));
    const normalizedModels = state.allModels;
    modelSelect.innerHTML = "";

    normalizedModels
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
    // keep fallback
  }
};

const checkProxyAvailability = async () => {
  setProxyStatus("unknown");
  try {
    const response = await fetch(getCliproxyModelsUrl(), {
      headers: {
        Authorization: `Bearer ${state.cliproxyApiToken}`,
      },
    });
    if (response.ok) {
      setProxyStatus("ok");
      displayStatus("Proxy connection OK", "success");
    } else {
      setProxyStatus("error");
      displayStatus(`Proxy error: ${response.status} ${response.statusText}`, "error");
    }
  } catch (error) {
    setProxyStatus("error");
    if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
      displayStatus("Proxy connection blocked. Check if cliproxyapi is running on port 8317.", "error");
    } else {
      displayStatus(`Proxy connection error: ${error.message}`, "error");
    }
  }
};



const renderIterationPanel = () => {
  renderIterationListUI({
    container: iterationList,
    iterations,
    activeIterationIndex: state.activeIterationIndex,
    onSelectIteration: (index) => setActiveIteration(index),
    onStyleIteration: (index, buttonEl) => handleStyleRequest(index, buttonEl),
    onShowPrompts: (iteration) => openModal("LLM промпты", formatPromptsModalContent(iteration)),
    onShowStage: (stage) => openModal("LLM промпт (стадия)", formatStageModalContent(stage)),
    onShowContext: (iteration) => openModal("Docs Context", formatContextModalContent(iteration)),
  });
};

const syncDiagramPreview = async () => {
  const iteration = getActiveIteration();
  const code = iteration?.activeCode || "";
  if (showCodeButton) {
    showCodeButton.disabled = !code;
  }
  try {
    await renderMermaidDiagram(code);
  } catch (error) {
    displayStatus(`Failed to render diagram: ${error.message || error}`, "error");
  }
};

const setActiveIteration = (index) => {
  if (index < 0 || index >= iterations.length) {
    setActiveIterationIndex(-1);
  } else {
    setActiveIterationIndex(index);
  }
  renderIterationPanel();
  syncDiagramPreview();
};

const runStructureFlow = async (iteration, { prompt, previousCode, docsContextText }) => {
  let workingCode = previousCode || "";
  let lastErrors = [];

  for (let attempt = 0; attempt < state.maxStructureRetries; attempt += 1) {
    const promptToSend = buildPrompt(prompt, lastErrors, workingCode, docsContextText);
    const stageInfo = await callCliproxyApiStructure(promptToSend, workingCode);
    const sanitizedCode = sanitizeMermaidCode(stageInfo.code);
    const validation = await validateMermaidCode(sanitizedCode);

    const stage = {
      id: `${iteration.id}-structure-${attempt + 1}`,
      type: attempt === 0 ? "structure" : "fix",
      scope: "structure",
      label: attempt === 0 ? "Structure" : `Fix ${attempt}`,
      status: validation.isValid ? "success" : "error",
      prompts: {
        system: stageInfo.systemPrompt,
        user: stageInfo.userPrompt,
      },
      assistantRaw: stageInfo.rawContent,
      rawCode: stageInfo.code,
      code: sanitizedCode,
      validation,
      reasoning: stageInfo.reasoning || "",
    };

    iteration.stages.push(stage);
    if (stageInfo.reasoning) {
      iteration.summary = stageInfo.reasoning;
    }

    renderIterationPanel();
    await syncDiagramPreview();

    if (validation.isValid) {
      iteration.activeCode = sanitizedCode;
      return { success: true };
    }

    lastErrors = validation.errors;
    workingCode = sanitizedCode;
    displayStatus(`Структура невалидна: ${validation.errors.join("; ")}`, "error");
  }

  return { success: false };
};

const handleStyleRequest = async (iterationIndex, buttonEl) => {
  const parentIteration = iterations[iterationIndex];
  if (!parentIteration || !parentIteration.activeCode) {
    displayStatus("Нет валидной структуры для стилизации.", "error");
    if (buttonEl) buttonEl.disabled = false;
    return;
  }

  const stylePrompt = `${parentIteration.prompt} (стиль)`;
  const styleIteration = createIterationEntry(
    stylePrompt,
    parentIteration.promptOriginal || parentIteration.prompt,
    parentIteration.promptPrepared || parentIteration.promptOriginal || parentIteration.prompt,
    parentIteration.docsMeta,
    parentIteration.docsContextText,
    parentIteration.diagramType,
  );
  styleIteration.originIterationId = parentIteration.id;
  styleIteration.activeCode = parentIteration.activeCode;
  styleIteration.baseStructureCode = parentIteration.activeCode;
  const styleIterationIndex = addIteration(styleIteration);
  setActiveIteration(styleIterationIndex);
  renderIterationPanel();

  setButtonState(true, "Стилизуем...");
  displayStatus("Запуск стилизации...", "info");
  if (buttonEl) buttonEl.disabled = true;

  try {
    const styleDocsResult = await fetchStyleDocsContext(parentIteration);
    const styleDocsMeta = styleDocsResult.meta || {
      rawQuery: "",
      searchQuery: "",
      stylePrefs: "",
      snippets: [],
    };
    const styleDocsText = styleDocsResult.text || "";
    const effectiveDocsContext = styleDocsText || parentIteration.docsContextText || "";
    styleIteration.styleDocsMeta = styleDocsMeta;
    styleIteration.styleDocsContextText = styleDocsText;

    let { code: styledCode, reasoning, rawContent, systemPrompt, userPrompt } = await callCliproxyApiStyle(
      parentIteration.activeCode,
      effectiveDocsContext,
      parentIteration.promptPrepared || parentIteration.promptOriginal || parentIteration.prompt,
      parentIteration.diagramType
    );

    const rawStyledCode = styledCode;
    styledCode = sanitizeMermaidCode(rawStyledCode);
    let validation = await validateMermaidCode(styledCode);
    styleIteration.stages.push({
      id: `${styleIteration.id}-style-${Date.now()}`,
      type: "style",
      scope: "style",
      label: "Style",
      status: validation.isValid ? "success" : "error",
      prompts: { system: systemPrompt, user: userPrompt },
      assistantRaw: rawContent,
      rawCode: rawStyledCode,
      code: styledCode,
      validation,
      reasoning: reasoning || "",
    });

    if (reasoning) {
      styleIteration.summary = reasoning;
    }

    let attempt = 0;
    while (!validation.isValid && attempt < state.maxStyleFixAttempts) {
      attempt += 1;
      displayStatus(`Стиль невалиден. Авто-фиксация (${attempt}/${state.maxStyleFixAttempts})...`, "error");

      try {
        const previousAttemptCode = styledCode;
        const diagramLabel = parentIteration.diagramType || "diagram";
        const fixResult = await callCliproxyApiFixStyle(
          styledCode,
          validation.errors,
          diagramLabel,
          styleIteration.baseStructureCode,
        );
        const rawFixCode = fixResult.code;
        styledCode = sanitizeMermaidCode(rawFixCode);
        const codeChanged = styledCode.trim() !== previousAttemptCode.trim();
        validation = await validateMermaidCode(styledCode);
        styleIteration.stages.push({
          id: `${styleIteration.id}-style-fix-${attempt}`,
          type: "fix",
          scope: "style",
          label: `Style Fix ${attempt}`,
          status: validation.isValid ? "success" : "error",
          prompts: { system: fixResult.systemPrompt, user: fixResult.userPrompt },
          assistantRaw: fixResult.rawContent,
          rawCode: rawFixCode,
          code: styledCode,
          validation,
          duplicate: !codeChanged,
        });

        if (!codeChanged) {
          displayStatus("Авто-фиксер вернул тот же код. Останавливаем цикл.", "error");
          break;
        }
      } catch (fixError) {
        displayStatus(`Style fix error: ${fixError.message || fixError}`, "error");
        break;
      }
    }

    if (validation.isValid) {
      styleIteration.activeCode = styledCode;
      displayStatus("Диаграмма стилизована.", "success");
    } else {
      displayStatus("Не удалось получить валидный стиль.", "error");
      if (buttonEl) buttonEl.disabled = false;
    }
  } catch (error) {
    displayStatus(`Ошибка стилизации: ${error.message || error}`, "error");
    if (buttonEl) buttonEl.disabled = false;
  } finally {
    renderIterationPanel();
    await syncDiagramPreview();
    setButtonState(false);
    if (buttonEl) buttonEl.disabled = false;
  }
};

const handleGenerate = async () => {
  const rawPrompt = promptInput?.value || "";
  const diagramType = state.selectedDiagramType;
  const { original: promptOriginal, prepared: promptPrepared } = prepareUserPrompt(rawPrompt, diagramType);
  if (!promptPrepared && !promptOriginal.trim()) {
    displayStatus("Введите описание диаграммы.", "error");
    return;
  }
  if (!state.cliproxyApiModel) {
    displayStatus("Модель не выбрана, будет использовано значение по умолчанию сервера.", "info");
  }

  const previousIteration = getActiveIteration();
  const previousCode = previousIteration?.activeCode || "";
  setButtonState(true, "Генерация...");
  displayStatus("Запуск генерации структуры...", "info");

  const docsQuery = promptPrepared || promptOriginal;
  const { text: docsContextText, meta } = await fetchDocsContext(diagramType, "structure");
  const iteration = createIterationEntry(
    promptOriginal,
    promptOriginal,
    docsQuery,
    meta,
    docsContextText,
    diagramType,
  );
  const iterationIndex = addIteration(iteration);
  setActiveIteration(iterationIndex);

  const result = await runStructureFlow(iteration, {
    prompt: docsQuery,
    previousCode,
    docsContextText,
  });

  if (result.success) {
    displayStatus("Структура готова. Можно запускать стилизацию.", "success");
  } else {
    displayStatus("Не удалось получить валидную структуру.", "error");
  }

  setButtonState(false);
  renderIterationPanel();
};

const diagramTypeButtons = document.querySelectorAll("#diagram-type-filters .filter-button");
if (diagramTypeButtons.length) {
  diagramTypeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      diagramTypeButtons.forEach((b) => b.classList.remove("filter-active"));
      btn.classList.add("filter-active");
      setSelectedDiagramType(btn.dataset.type || "auto");
    });
  });
}

if (generateButton) {
  generateButton.addEventListener("click", () => {
    handleGenerate();
  });
}

if (proxyInput) {
  const initial = proxyInput.value.trim();
  if (initial) {
    updateCliproxyBaseUrl(initial);
  } else {
    proxyInput.value = state.cliproxyBaseUrl;
  }

  proxyInput.addEventListener("change", () => {
    const value = proxyInput.value.trim();
    updateCliproxyBaseUrl(value);
    proxyInput.value = state.cliproxyBaseUrl;
    initModelSelection();
    checkProxyAvailability();
  });

  checkProxyAvailability();
}

if (vendorFilterButton) {
  const order = ["all", "gpt", "gemini", "glm"];
  const labels = { all: "All", gpt: "gpt", gemini: "gemini", glm: "glm" };
  vendorFilterButton.addEventListener("click", () => {
    const current = vendorFilterButton.dataset.modelFilter || "all";
    const index = order.indexOf(current);
    const next = index === -1 ? "all" : order[(index + 1) % order.length];
    vendorFilterButton.dataset.modelFilter = next;
    vendorFilterButton.textContent = labels[next] || next;
    setModelFilter(next);
    applyModelFilter();
  });
}

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    setCliproxyApiModel(modelSelect.value);
  });
}

initModelSelection().then(() => {
  if (modelSelect) {
    setCliproxyApiModel(modelSelect.value || state.cliproxyApiModel);
  }
});

renderIterationPanel();
displayStatus("Готов к генерации.", "info");

if (showCodeButton) {
  showCodeButton.disabled = true;
  showCodeButton.addEventListener("click", () => {
    const iteration = getActiveIteration();
    const code = iteration?.activeCode || "";
    if (!code) {
      openModal("Код диаграммы", "Код ещё не доступен.");
      return;
    }
    openModal("Код диаграммы", code);
  });
}
