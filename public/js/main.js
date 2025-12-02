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
  subscribe,
} from "./state.js";
import {
  fetchDocsContext,
  getCliproxyModelsUrl,
} from "./api.js";
import {
  runStructureFlow,
  runStyleFlow,
} from "./workflows.js";
import {
  selectBestModel,
  getModelVendor,
} from "./modelManager.js";
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

// --- UI Helpers ---

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

// --- Event Listeners (Global UI) ---

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

// --- Model Selection Logic ---

const applyModelFilter = (preferredModel) => {
  const models = state.allModels;
  if (!modelSelect || !models.length) return;

  const filter = state.currentModelFilter;
  const targetId = selectBestModel(models, filter, preferredModel || state.cliproxyApiModel);

  if (!targetId) return;

  // Update UI options based on filter
  const candidates = filter === "all" ? models : models.filter(m => getModelVendor(m) === filter);
  const finalCandidates = candidates.length ? candidates : models;

  modelSelect.innerHTML = "";
  finalCandidates
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

    if (!response.ok) return;

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    if (!models.length) return;

    setAllModels(models.filter((m) => m && typeof m.id === "string"));
    
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
      headers: { Authorization: `Bearer ${state.cliproxyApiToken}` },
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

// --- Rendering & State Sync ---

const renderIterationPanel = () => {
  renderIterationListUI({
    container: iterationList,
    iterations: state.iterations,
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
  let code = iteration?.activeCode || "";
  if (showCodeButton) {
    showCodeButton.disabled = !code;
  }

  // Inject default theme if not present
  if (code) {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/m;
    const themeConfigRegex = /^\s*config:\s*\n[\s\S]*?^\s*theme:\s*['"].*?['"]/m;
    let modifiedCode = code;

    if (!themeConfigRegex.test(code)) { // If theme config is NOT present
        const match = code.match(frontmatterRegex);
        if (match) {
            // Frontmatter exists, but no theme config, inject theme into it
            const frontmatterContent = match[1];
            const newFrontmatterContent = frontmatterContent + "\nconfig:\n  theme: 'base'";
            modifiedCode = code.replace(frontmatterRegex, `---\n${newFrontmatterContent}\n---`);
        } else {
            // No frontmatter, prepend a new one with default theme
            modifiedCode = `---\nconfig:\n  theme: 'base'\n---\n` + code;
        }
    }
    code = modifiedCode;
  }

  try {
    await renderMermaidDiagram(code);
  } catch (error) {
    displayStatus(`Failed to render diagram: ${error.message || error}`, "error");
  }
};

const setActiveIteration = (index) => {
  const validIndex = (index < 0 || index >= state.iterations.length) ? -1 : index;
  setActiveIterationIndex(validIndex);
  // renderIterationPanel is triggered by subscription
  syncDiagramPreview();
};

// Subscribe to state changes to update UI
subscribe((newState) => {
  renderIterationPanel();
  // Optionally sync preview if active iteration changed?
  // For now, we call syncDiagramPreview manually when changing active iteration or finishing a flow.
});


// --- Workflow Handlers ---

const handleStyleRequest = async (iterationIndex, buttonEl) => {
  const parentIteration = state.iterations[iterationIndex];
  
  setButtonState(true, "Стилизуем...");
  if (buttonEl) buttonEl.disabled = true;

  const callbacks = {
    onStageAdded: (iter) => {
      // State update triggers render, but we might need to ensure preview sync
      syncDiagramPreview(); 
    },
    onStatusUpdate: (msg, type) => displayStatus(msg, type)
  };

  await runStyleFlow(parentIteration, callbacks);

  setButtonState(false);
  if (buttonEl) buttonEl.disabled = false;
  await syncDiagramPreview();
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

  const callbacks = {
    onStageAdded: () => {
       renderIterationPanel(); // Force immediate update or rely on sub? Sub handles it.
       syncDiagramPreview();
    },
    onStatusUpdate: (msg, type) => displayStatus(msg, type)
  };

  const result = await runStructureFlow(iteration, {
    prompt: docsQuery,
    previousCode,
    docsContextText,
  }, callbacks);

  if (result.success) {
    displayStatus("Структура готова. Можно запускать стилизацию.", "success");
  } else {
    displayStatus("Не удалось получить валидную структуру.", "error");
  }

  setButtonState(false);
};

// --- Controls Initialization ---

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
