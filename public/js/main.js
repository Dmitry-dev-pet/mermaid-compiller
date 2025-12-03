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
  extractMermaidCode,
  analyzePrompt,
  callCliproxyApiFixStructure, // Import new fix structure API call
} from "./api.js";
import {
  runStructureFlow,
  runStyleFlow,
  runStructureFixFlow, // Import the new structure fix flow
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
import { docsManager } from "./docsManager.js"; // Import docsManager
import { detectDiagramType } from "./utils.js";
import { validateMermaidCode } from "./validation.js"; // Import validation logic

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
const docsVersionSelect = document.getElementById("docs-version-select");
const docsCacheBtn = document.getElementById("docs-cache-btn");

// New buttons
const newProjectButton = document.getElementById("new-project-button");
const fixDiagramButton = document.getElementById("fix-diagram-button");
const fixStyleButton = document.getElementById("fix-style-button");

const state = getState();
const iterations = state.iterations;

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });

// Initialize docsManager right after mermaid.initialize
await docsManager.init();

// --- Docs Cache UI ---
const updateCacheStatusUI = () => {
  if (!docsCacheBtn) return;
  const isCached = docsManager.isFullyCached();
  
  docsCacheBtn.classList.remove("cache-status-ok", "cache-status-missing", "cache-status-loading");
  
  if (isCached) {
    docsCacheBtn.classList.add("cache-status-ok");
    docsCacheBtn.title = "Docs fully cached";
    // Checkmark icon
    docsCacheBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else {
    docsCacheBtn.classList.add("cache-status-missing");
    docsCacheBtn.title = "Download all docs to cache";
    // Download icon
    docsCacheBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  }
};

if (docsCacheBtn) {
  docsCacheBtn.addEventListener("click", async () => {
    if (docsCacheBtn.classList.contains("cache-status-loading")) return;
    
    docsCacheBtn.classList.remove("cache-status-missing");
    docsCacheBtn.classList.add("cache-status-loading");
    
    try {
        await docsManager.downloadAll((loaded, total) => {
            // Optional: update title with progress
            docsCacheBtn.title = `Downloading... ${loaded}/${total}`;
        });
        displayStatus("Documentation downloaded to cache.", "success");
    } catch (e) {
        displayStatus(`Download failed: ${e.message}`, "error");
    } finally {
        updateCacheStatusUI();
    }
  });
}

// --- Docs Version Logic ---
const initDocsVersion = async () => {
  if (!docsVersionSelect) return;
  
  const versions = await docsManager.fetchVersions();
  docsVersionSelect.innerHTML = "";
  
  versions.forEach(version => {
    const option = document.createElement("option");
    option.value = version; 
    
    // Pretty print for UI
    let label = version;
    if (label.startsWith("mermaid@")) {
        label = label.replace("mermaid@", "v");
    }
    option.textContent = label;
    
    docsVersionSelect.appendChild(option);
  });

  // Set current value
  docsVersionSelect.value = docsManager.currentRef;
  updateCacheStatusUI(); // Check initial status

  docsVersionSelect.addEventListener("change", async () => {
    const newVersion = docsVersionSelect.value;
    setButtonState(true, "Updating docs...");
    await docsManager.setVersion(newVersion);
    updateCacheStatusUI(); // Reset status on version change
    setButtonState(false);
    displayStatus(`Documentation switched to ${newVersion}`, "success");
  });
};

await initDocsVersion();

// --- UI Helpers ---

const setButtonState = (isLoading, loadingLabel = "Работаю...") => {
  setUIButtonState(generateButton, isLoading, loadingLabel);
  // Also disable/enable other main action buttons when loading
  const isDisabled = isLoading;
  if (generateButton) generateButton.disabled = isDisabled;
  if (newProjectButton) newProjectButton.disabled = isDisabled;
  if (fixDiagramButton) fixDiagramButton.disabled = isDisabled;
  if (fixStyleButton) fixStyleButton.disabled = isDisabled;
  if (docsVersionSelect) docsVersionSelect.disabled = isDisabled;
  if (docsCacheBtn) docsCacheBtn.disabled = isDisabled;
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

const updateFixButtonsState = () => {
  const activeIteration = getActiveIteration();
  const hasCode = !!activeIteration?.activeCode;
  const hasInput = !!promptInput?.value.trim();
  
  // Enable if there's existing code to fix OR if the user provided input (which we assume is code to fix)
  const canFix = hasCode || hasInput;
  
  if (fixDiagramButton) fixDiagramButton.disabled = !canFix;
  if (fixStyleButton) fixStyleButton.disabled = !canFix;
};

let validationTimeout; // For debouncing

const validatePromptInput = async () => {
    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(async () => {
        const rawInput = promptInput?.value || "";
        if (!rawInput.trim()) {
            displayStatus("Готов к генерации.", "info");
            return;
        }

        const codeToValidate = forceCleanCode(rawInput); // Extract code for validation
        if (!codeToValidate.trim()) {
            displayStatus("Введите описание диаграммы или код.", "info");
            return;
        }

        const validation = await validateMermaidCode(codeToValidate);
        if (validation.isValid) {
            displayStatus("Диаграмма валидна.", "success");
            // Live preview for valid manual code
            await renderMermaidDiagram(codeToValidate);
        } else {
            const firstError = validation.errors[0];
            displayStatus(`Ошибка синтаксиса: ${firstError.message} (строка ${firstError.loc.start.line})`, "error");
        }
    }, 500); // Debounce for 500ms
};


if (promptInput) {
    promptInput.addEventListener("input", updateFixButtonsState);
    promptInput.addEventListener("input", validatePromptInput);
}

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
  updateFixButtonsState(); // Update button states when panel renders
};

const syncDiagramPreview = async () => {
  const iteration = getActiveIteration();
  let code = iteration?.activeCode || "";
  if (showCodeButton) {
    showCodeButton.disabled = !code;
  }
  updateFixButtonsState(); // Update button states when diagram preview syncs

  // Inject default theme if not present
  if (code) {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/m;
    // Loose regex: looks for "theme:" followed by optional quotes, word chars, optional quotes
    const themeConfigRegex = /^\s*theme:\s*['"]?[\w-]+['"]?/m;
    let modifiedCode = code;

    // Check if "theme:" is present inside the frontmatter block (if any)
    const match = code.match(frontmatterRegex);
    const hasFrontmatter = !!match;
    const frontmatterContent = match ? match[1] : "";
    const hasThemeInFrontmatter = hasFrontmatter && themeConfigRegex.test(frontmatterContent);

    if (!hasThemeInFrontmatter) { 
        if (hasFrontmatter) {
            // Frontmatter exists, but no theme config. 
            // Check if 'config:' key exists to append properly, but simplistic append is risky.
            // Safer: just append config block at the end of YAML. YAML allows duplicate keys at root? No.
            // If 'config:' exists, we should append to it. 
            // For simplicity: if config exists but no theme, we append.
            // If config doesn't exist, we append config.
            
            const configRegex = /^\s*config:\s*$/m;
            if (configRegex.test(frontmatterContent)) {
                 // config key exists, it's hard to append correctly without parsing indentation.
                 // Let's just leave it alone to avoid breaking. The user/LLM should have added it.
                 // Or we can try to append to the end of frontmatter.
                 const newFrontmatterContent = frontmatterContent + "\n  theme: 'base'";
                 modifiedCode = code.replace(frontmatterRegex, `---\n${newFrontmatterContent}\n---`);
            } else {
                 // No config key, safe to add
                 const newFrontmatterContent = frontmatterContent + "\nconfig:\n  theme: 'base'";
                 modifiedCode = code.replace(frontmatterRegex, `---\n${newFrontmatterContent}\n---`);
            }
        } else {
            // No frontmatter, prepend a new one with default theme
            modifiedCode = `---\nconfig:\n  theme: 'base'\n---\n` + code;
        }
    }
    code = modifiedCode;
  }

  try {
    console.log("[Main] Rendering code:", code); // Debug log
    await renderMermaidDiagram(code);
  } catch (error) {
    console.error("[Main] Render failed for code:", code);
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
  
  let codeFromPrompt = "";
  let textPrompt = rawPrompt;

  // 1. Extract code (fenced or raw)
  const codeMatch = rawPrompt.match(/```(?:\w+)?([\s\S]*?)```/i);
  
  if (codeMatch) { // Fenced code detected
      codeFromPrompt = forceCleanCode(codeMatch[0]);
      // Remove code from prompt to get the instruction
      textPrompt = rawPrompt.replace(codeMatch[0], "").trim();
      if (!textPrompt) {
          textPrompt = "Fix and visualize this diagram";
      }
  } else { // No fenced code, assume rawPrompt might be pure code
      codeFromPrompt = rawPrompt;
      textPrompt = "Visualize this diagram"; // Default for rendering unfenced code
  }

  // 2. Validate and Render Immediately if valid
  const validation = await validateMermaidCode(codeFromPrompt);
  if (validation.isValid) {
      displayStatus("Код валиден. Мгновенный рендер.", "success");
      
      let diagramType = state.selectedDiagramType;
      if (!diagramType || diagramType === 'auto') {
          diagramType = detectDiagramType(codeFromPrompt);
      }
      if (!diagramType || diagramType === 'auto') diagramType = "flowchart";

      const iteration = createIterationEntry(
        textPrompt === "Fix and visualize this diagram" ? "Visualize Code" : textPrompt,
        rawPrompt, 
        textPrompt, 
        { rawQuery: "manual", searchQuery: "manual", stylePrefs: "", snippets: [] }, 
        "", 
        diagramType
      );
      iteration.activeCode = codeFromPrompt;
      
      iteration.stages.push({
          id: `manual-${Date.now()}`,
          type: "structure",
          scope: "structure",
          label: "Manual Input",
          status: "success",
          code: codeFromPrompt,
          validation,
          prompts: { system: "Manual", user: "Manual" },
          assistantRaw: "User provided valid code"
      });

      const index = addIteration(iteration);
      setActiveIteration(index);
      
      // Ensure UI updates
      renderIterationPanel();
      syncDiagramPreview();
      return; // Skip LLM flow
  }

  // 3. If not valid, proceed with LLM generation/fix
  const contentToAnalyze = codeFromPrompt || textPrompt; // Use whatever code we found or text
  const diagramType = await determineDiagramTypeWithLLM(contentToAnalyze);

  const { original: promptOriginal, prepared: promptPrepared } = prepareUserPrompt(textPrompt, diagramType);
  
  if (!promptPrepared && !promptOriginal.trim() && !codeFromPrompt) {
    displayStatus("Введите описание диаграммы или код.", "error");
    return;
  }
  if (!state.cliproxyApiModel) {
    displayStatus("Модель не выбрана, будет использовано значение по умолчанию сервера.", "info");
  }

  const previousIteration = getActiveIteration();
  // Priority: Code from input > Active iteration code
  const previousCode = codeFromPrompt || previousIteration?.activeCode || "";
  
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

const handleNewProject = () => {
  if (confirm("Начать новый проект? Все несохраненные итерации будут удалены.")) {
    promptInput.value = "";
    // Reset state directly or via a new function in state.js
    state.iterations = [];
    setActiveIterationIndex(-1);
    renderIterationPanel(); // This will also call updateFixButtonsState
    syncDiagramPreview();
    displayStatus("Новый проект создан.", "info");
  }
};

// Helper to aggressively clean code fences and extract code
const forceCleanCode = (text) => {
  if (!text) return "";
  // 1. Try to find a code block anywhere in the text
  const match = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (match && match[1]) {
      return match[1].trim();
  }
  // 2. If no complete block found, assume the whole text is code
  // but clean up potential start/end fence artifacts
  return text.replace(/^```\w*\s*/, "").replace(/```$/, "").trim();
};

// Centralized type detection logic
const determineDiagramTypeWithLLM = async (textInput) => {
    // 1. Priority: Manual Selection
    const manualType = state.selectedDiagramType;
    if (manualType && manualType !== 'auto') {
        return manualType;
    }

    // 2. LLM Analysis
    if (textInput) {
        displayStatus("Анализ типа...", "info");
        try {
            const analysis = await analyzePrompt(textInput);
            console.log("[Main] Type Analysis:", analysis);
            if (analysis.diagramType) {
                let dt = analysis.diagramType.toLowerCase();
                
                // Normalization
                if (dt.includes("flow")) dt = "flowchart";
                if (dt.includes("sequence")) dt = "sequence";
                if (dt.includes("class")) dt = "class";
                if (dt.includes("state")) dt = "state";
                if (dt.includes("er")) dt = "er";
                if (dt === "graph") dt = "flowchart";

                // Validation
                const supported = Object.keys(state.diagramDocsTemplates);
                if (supported.includes(dt)) return dt;
                
                console.warn(`[Main] Unsupported type from LLM: ${dt}`);
            }
        } catch (e) {
            console.warn("[Main] LLM analysis error:", e);
        }
    }

    // 3. Regex Fallback
    const detected = detectDiagramType(textInput);
    if (detected && detected !== 'auto') {
        return detected;
    }

    // 4. Default
    return "flowchart";
};

const handleFixDiagram = async () => {
  const activeIteration = getActiveIteration();
  let targetCode = "";
  let iterationToUse = activeIteration;

  if (activeIteration && activeIteration.activeCode) {
      targetCode = activeIteration.activeCode;
  } else if (promptInput && promptInput.value.trim()) {
      const rawInput = promptInput.value.trim();
      targetCode = forceCleanCode(rawInput);

      let diagramType = state.selectedDiagramType;
      if (!diagramType || diagramType === 'auto') {
          diagramType = detectDiagramType(targetCode);
      }
      if (!diagramType || diagramType === 'auto') {
           diagramType = "flowchart"; // Default if type detection failed
      }
      
      const docsQuery = "fix syntax"; // Default for docs context
      const { text: docsContextText, meta } = await fetchDocsContext(diagramType, "structure");
      
      const newIteration = createIterationEntry(
        "Fix input code", // prompt
        "Fix input code", // original
        docsQuery,
        meta,
        docsContextText,
        diagramType
      );
      newIteration.activeCode = targetCode; // Set the input as the starting point
      
      const index = addIteration(newIteration);
      setActiveIteration(index);
      iterationToUse = newIteration;
  } else {
    displayStatus("Нет кода для исправления (введите код или выберите диаграмму).", "error");
    return { success: false };
  }

  setButtonState(true, "Исправляю диаграмму...");
  
  // Use centralized type detection
  let diagramType = await determineDiagramTypeWithLLM(targetCode);
  if (iterationToUse.diagramType === 'auto') {
      iterationToUse.diagramType = diagramType;
  }

  displayStatus("Запуск исправления структуры...", "info");
  
  const docsQuery = "fix syntax"; 
  const { text: docsContextText, meta } = await fetchDocsContext(diagramType, "structure");
  
  // If creating a new iteration, fill in details
  if (iterationToUse !== activeIteration) {
      // It's a new iteration from input
      // We need to set props that createIterationEntry usually handles, but here we have the object already?
      // No, in handleFixDiagram we created 'newIteration' above if needed.
      // Wait, the code structure in handleFixDiagram is:
      // if (active) ... else if (input) { ... create newIteration ... }
      // The newIteration is created with diagramType from state or detectDiagramType(targetCode)
      // We should move creation AFTER determination? Or update it.
      // Updating is easier.
      iterationToUse.diagramType = diagramType;
      iterationToUse.docsContextText = docsContextText;
      iterationToUse.docsMeta = meta;
  } else {
      // Existing iteration. We might want to update docs context if type changed or just refresh it.
      // But runStructureFixFlow accepts docsContextText.
      // Let's pass it directly.
  }

  const result = await runStructureFixFlow(iterationToUse, {
    prompt: "Fix syntax errors", 
    previousCode: targetCode,
    docsContextText, 
  }, {
    onStageAdded: () => {
       renderIterationPanel();
       syncDiagramPreview();
    },
    onStatusUpdate: (msg, type) => displayStatus(msg, type)
  });

  if (result.success) {
    displayStatus("Структура диаграммы исправлена.", "success");
  } else {
    displayStatus("Не удалось исправить структуру диаграммы.", "error");
  }

  setButtonState(false);
};

const handleFixStyle = async () => {
  const activeIteration = getActiveIteration();
  let targetCode = "";
  let iterationToUse = activeIteration;

  if (activeIteration && activeIteration.activeCode) {
      targetCode = activeIteration.activeCode;
  } else if (promptInput && promptInput.value.trim()) {
      // Similar logic for style fix from scratch
      const rawInput = promptInput.value.trim();
      const extracted = extractMermaidCode(rawInput);
      targetCode = forceCleanCode(rawInput);

      let diagramType = state.selectedDiagramType; // UI selection takes precedence

      if (!diagramType || diagramType === 'auto') {
          displayStatus("Анализ кода...", "info");
          try {
              const analysis = await analyzePrompt(targetCode);
              console.log("[Main] Analysis result (FixStyle):", analysis);
              if (analysis.diagramType) {
                  let dt = analysis.diagramType.toLowerCase();
                  if (dt.includes("flow")) dt = "flowchart";
                  if (dt.includes("sequence")) dt = "sequence";
                  if (dt.includes("class")) dt = "class";
                  if (dt.includes("state")) dt = "state";
                  if (dt.includes("er")) dt = "er";
                  if (dt === "graph") dt = "flowchart";
                  
                  const supportedTypes = Object.keys(state.diagramDocsTemplates);
                  if (supportedTypes.includes(dt)) {
                      diagramType = dt;
                  } else {
                      console.warn(`[Main] LLM returned unsupported type '${dt}'. Fallback to regex detection.`);
                      diagramType = detectDiagramType(targetCode);
                  }
              } else {
                  console.warn("[Main] LLM analysis failed to return a diagramType. Fallback to regex detection.");
                  diagramType = detectDiagramType(targetCode);
              }
          } catch(e) {
              console.warn("[Main] Analysis error during FixStyle, falling back to regex", e);
              diagramType = detectDiagramType(targetCode);
          }
      }

      if (!diagramType || diagramType === 'auto') {
           diagramType = "flowchart";
           console.warn("[Main] No diagram type determined for FixStyle, defaulting to flowchart.");
      }

      const { text: docsContextText, meta } = await fetchDocsContext(diagramType, "style");
      
      const newIteration = createIterationEntry(
        "Fix input style",
        "Fix input style",
        "fix style",
        meta,
        docsContextText,
        diagramType
      );
      newIteration.activeCode = targetCode;
      
      const index = addIteration(newIteration);
      setActiveIteration(index);
      iterationToUse = newIteration;
  } else {
    displayStatus("Нет кода для исправления стиля.", "error");
    return;
  }

  setButtonState(true, "Исправляю стиль...");
  
  // Use centralized type detection
  let diagramType = await determineDiagramTypeWithLLM(targetCode);
  if (iterationToUse.diagramType === 'auto') {
      iterationToUse.diagramType = diagramType;
  }

  displayStatus("Запуск исправления стиля...", "info");

  // Fetch docs for the determined type (style context)
  const { text: docsContextText, meta } = await fetchDocsContext(diagramType, "style");
  
  // Update iteration context if needed (mostly for new iterations)
  if (!iterationToUse.styleDocsContextText) {
      iterationToUse.styleDocsContextText = docsContextText;
      iterationToUse.styleDocsMeta = meta;
  }

  const callbacks = {
    onStageAdded: (iter) => {
      syncDiagramPreview(); 
    },
    onStatusUpdate: (msg, type) => displayStatus(msg, type)
  };

  const result = await runStyleFlow(iterationToUse, callbacks);

  if (result.success) {
    displayStatus("Стиль диаграммы исправлен.", "success");
  } else {
    displayStatus("Не удалось исправить стиль диаграммы.", "error");
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

if (newProjectButton) {
  newProjectButton.addEventListener("click", handleNewProject);
}

if (fixDiagramButton) {
  fixDiagramButton.addEventListener("click", handleFixDiagram);
  fixDiagramButton.disabled = true; // Disable initially
}

if (fixStyleButton) {
  fixStyleButton.addEventListener("click", handleFixStyle);
  fixStyleButton.disabled = true; // Disable initially
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
