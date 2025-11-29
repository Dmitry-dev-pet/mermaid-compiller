const promptInput = document.getElementById("prompt-input");
const generateButton = document.getElementById("generate-button");
const renderArea = document.getElementById("mermaid-render-area");
const statusBox = document.getElementById("status-messages");
const modelSelect = document.getElementById("model-select");
const proxyInput = document.getElementById("proxy-url-input");
const proxyStatusIndicator = document.getElementById("proxy-status-indicator");
const newGenerateButton = document.getElementById("new-generate-button");
const reasoningOutput = document.getElementById("model-reasoning-output");
const vendorFilterButton = document.getElementById("vendor-filter");
const llmConversationOutput = document.getElementById("llm-conversation-output");
const docsDebugOutput = document.getElementById("docs-debug-output");
const diagramTabs = document.getElementById("diagram-tabs");
const viewStructureButton = document.getElementById("diagram-view-structure");
const viewStyledButton = document.getElementById("diagram-view-styled");
const styleButton = document.getElementById("style-button");

let currentDiagramCode = "";
let originalUserPrompt = "";
let retryCount = 0;
const maxRetries = 5;
const cliproxyApiToken = "test";
const defaultCliproxyBaseUrl = "http://localhost:8317";
let cliproxyBaseUrl = defaultCliproxyBaseUrl;
let cliproxyApiModel = "";
const docsSearchUrl = "/docs/search";
let allModels = [];
let currentModelFilter = "all";
let conversationLog = [];
let lastDocsDebug = null;
let diagramHistory = [];
let activeDiagramIndex = -1;
let diagramViewMode = "styled";
let selectedDiagramType = "auto";

const getCliproxyChatUrl = () => `${cliproxyBaseUrl}/v1/chat/completions`;
const getCliproxyModelsUrl = () => `${cliproxyBaseUrl}/v1/models`;

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });

const setButtonState = (isLoading) => {
  generateButton.disabled = isLoading;
  if (newGenerateButton) {
    newGenerateButton.disabled = isLoading;
  }
  if (styleButton) {
    styleButton.disabled = isLoading || activeDiagramIndex === -1;
  }
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

const updateReasoningHistoryView = () => {
  if (!reasoningOutput) return;
  reasoningOutput.textContent = "";

  diagramHistory.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "reasoning-item";
    item.textContent = entry.reasoning || `Diagram ${index + 1}`;
    if (index === activeDiagramIndex) {
      item.classList.add("reasoning-item-active");
    }
    item.addEventListener("click", () => {
      setActiveDiagramIndex(index);
    });
    reasoningOutput.appendChild(item);
  });
};

const makeCollapsibleSection = (forId) => {
  const label = document.querySelector(`label[for="${forId}"]`);
  const section = document.getElementById(forId);
  if (!label || !section) return;

  label.classList.add("collapsible-label");
  label.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });
};

const updateConversationView = () => {
  if (!llmConversationOutput) return;
  if (!conversationLog.length) {
    llmConversationOutput.textContent = "";
    return;
  }

  const sections = conversationLog.map((entry) => {
    const lines = [];
    lines.push(`Attempt ${entry.attempt}`);
    if (entry.system) {
      lines.push("--- system ---");
      lines.push(entry.system);
    }
    lines.push("--- user ---");
    lines.push(entry.user);
    lines.push("--- assistant ---");
    lines.push(entry.assistant);
    return lines.join("\n");
  });

  llmConversationOutput.textContent = sections.join(
    "\n\n========================================\n\n",
  );
};

const updateDocsDebugView = () => {
  if (!docsDebugOutput) return;
  if (!lastDocsDebug) {
    docsDebugOutput.textContent = "";
    return;
  }

  const { query, searchQuery, stylePrefs, results } = lastDocsDebug;
  const lines = [];
  if (searchQuery && searchQuery !== query) {
    lines.push(`Docs query: ${query}`);
    lines.push(`Search query (effective): ${searchQuery}`);
  } else {
    lines.push(`Docs query: ${query}`);
  }
  if (stylePrefs) {
    lines.push(`Style prefs: ${stylePrefs}`);
  }
  if (!Array.isArray(results) || !results.length) {
    lines.push("No documentation snippets returned.");
  } else {
    results.forEach((item, index) => {
      const source = item && item.source ? item.source : "unknown";
      const file = item && item.file ? item.file : "";
      const snippet = item && typeof item.snippet === "string" ? item.snippet : "";
      lines.push("");
      lines.push(`Result ${index + 1} [${source}] ${file}`);
      if (snippet) {
        lines.push(snippet);
      }
    });
  }

  docsDebugOutput.textContent = lines.join("\n");
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

const rebuildDiagramTabs = () => {
  if (!diagramTabs) return;
  diagramTabs.textContent = "";

  diagramHistory.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label || `D${index + 1}`;
    button.className = "diagram-tab";
    if (index === activeDiagramIndex) {
      button.classList.add("diagram-tab-active");
    }
    button.addEventListener("click", () => {
      setActiveDiagramIndex(index);
    });
    diagramTabs.appendChild(button);
  });
};

const getActiveHistoryEntry = () => {
  if (activeDiagramIndex < 0 || activeDiagramIndex >= diagramHistory.length) {
    return null;
  }
  return diagramHistory[activeDiagramIndex];
};

const updateViewToggleButtons = () => {
  if (viewStructureButton) {
    if (diagramViewMode === "structure") {
      viewStructureButton.classList.add("filter-active");
    } else {
      viewStructureButton.classList.remove("filter-active");
    }
  }
  if (viewStyledButton) {
    if (diagramViewMode === "styled") {
      viewStyledButton.classList.add("filter-active");
    } else {
      viewStyledButton.classList.remove("filter-active");
    }
  }
};

const syncUiWithActiveDiagram = async () => {
  const entry = getActiveHistoryEntry();
  if (!entry) {
    currentDiagramCode = "";
    renderArea.innerHTML = "";
    displayRawCode("");
    if (reasoningOutput) reasoningOutput.textContent = "";
    conversationLog = [];
    lastDocsDebug = null;
    updateConversationView();
    updateDocsDebugView();
    rebuildDiagramTabs();
    updateViewToggleButtons();
    updateReasoningHistoryView();
    return;
  }

  const structural = entry.structuralCode || "";
  const final = entry.finalCode || entry.structuralCode || "";

  console.log(
    `Syncing UI. Mode: ${diagramViewMode}. Structural len: ${structural.length}, Final len: ${final.length}`,
  );

  const baseCode = diagramViewMode === "structure" ? structural : final;

  currentDiagramCode = baseCode;
  try {
    if (currentDiagramCode) {
      await renderMermaidDiagram(currentDiagramCode);
    } else {
      renderArea.innerHTML = "";
    }
  } catch (error) {
    displayStatus(`Failed to render diagram: ${error.message || error}`, "error");
  }

  displayRawCode(currentDiagramCode);

  conversationLog = Array.isArray(entry.conversationLog)
    ? entry.conversationLog.slice()
    : [];
  lastDocsDebug = entry.docsDebug || null;
  updateConversationView();
  updateDocsDebugView();
  rebuildDiagramTabs();
  updateViewToggleButtons();
  updateReasoningHistoryView();
};

const setActiveDiagramIndex = (index) => {
  if (index < 0 || index >= diagramHistory.length) {
    activeDiagramIndex = -1;
  } else {
    activeDiagramIndex = index;
  }
  syncUiWithActiveDiagram();
};

const setDiagramViewMode = (mode) => {
  console.log(`Setting diagram view mode to: ${mode}`);
  diagramViewMode = mode === "structure" ? "structure" : "styled";
  syncUiWithActiveDiagram();
};

const renderMermaidDiagram = async (code) => {
  try {
    const id = `mermaid-diagram-${Date.now()}`;
    const { svg, bindFunctions } = await mermaid.render(id, code);
    renderArea.innerHTML = svg;
    if (bindFunctions) {
      bindFunctions(renderArea);
    }
  } catch (error) {
    console.error("Mermaid render error:", error);
    renderArea.innerHTML = `<div style="color: #ef4444; padding: 1rem; border: 1px dashed #ef4444;">Failed to render diagram:<br>${error.message}</div>`;
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
  const docsBlock = trimmedDocs
    ? `\n\nRelevant Mermaid documentation (snippets):\n${trimmedDocs}`
    : "";

  if (previousCode && !validationErrors.length) {
    return `${userPrompt}\n\nYou are updating an existing Mermaid diagram. Here is the current diagram:\n${previousCode}${docsBlock}\n\nPlease update this diagram according to the new instructions while keeping it syntactically valid.`;
  }

  if (validationErrors.length && previousCode) {
    return `${userPrompt}\n\nThe previous Mermaid code was invalid.\nErrors: ${validationErrors.join("; ")}${docsBlock}\nPlease fix the diagram while keeping the intent.`;
  }

  // Initial generation case
  return `${userPrompt}${docsBlock}`;
};

const extractMermaidCode = (text) => {
  if (!text || typeof text !== "string") return "";

  let code = "";
  const fenced = text.match(/```mermaid([\s\S]*?)```/i);
  
  if (fenced && fenced[1].trim()) {
    code = fenced[1].trim();
  } else {
    code = text.trim();
  }

  // Safety: remove RU_SUMMARY if present (case-insensitive just in case, though we prompt for RU_SUMMARY)
  const summaryIndex = code.indexOf("RU_SUMMARY:");
  if (summaryIndex !== -1) {
    code = code.substring(0, summaryIndex).trim();
  }

  // Clean up accidental remaining fences if regex failed or didn't match perfectly
  code = code.replace(/^```mermaid/i, "").replace(/```$/, "").trim();

  return code;
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
  if (!modelSelect || !allModels.length) return;

  const filter = currentModelFilter;
  let candidates = allModels;

  if (filter === "gpt") {
    candidates = allModels.filter((m) => getModelVendor(m) === "gpt");
  } else if (filter === "gemini") {
    candidates = allModels.filter((m) => getModelVendor(m) === "gemini");
  } else if (filter === "glm") {
    candidates = allModels.filter((m) => getModelVendor(m) === "glm");
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
    } else if (filter === "glm") {
      const glmModels = allModels.filter((m) => getModelVendor(m) === "glm");
      targetId = pickLatestModelId(glmModels) || pickLatestModelId(allModels);
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
    let trimmed = (query || "").trim();
    if (!trimmed) {
      lastDocsDebug = null;
      updateDocsDebugView();
      return "";
    }

    // Enhance query with diagram type if selected
    if (selectedDiagramType !== "auto") {
      trimmed = `${selectedDiagramType} syntax ${trimmed}`;
    }

    const limitedQuery = trimmed.slice(0, 80);
    const modelParam = cliproxyApiModel ? `&model=${encodeURIComponent(cliproxyApiModel)}` : "";
    const response = await fetch(`${docsSearchUrl}?q=${encodeURIComponent(limitedQuery)}${modelParam}`);
    if (!response.ok) {
      lastDocsDebug = { query: limitedQuery, results: [] };
      updateDocsDebugView();
      return "";
    }

    const data = await response.json();
    const items = Array.isArray(data?.results) ? data.results : [];

    const effectiveQuery = 
      typeof data?.search_query === "string" && data.search_query.trim()
        ? data.search_query.trim()
        : limitedQuery;

    const stylePrefs = 
      typeof data?.style_prefs === "string" && data.style_prefs.trim()
        ? data.style_prefs.trim()
        : "";

    lastDocsDebug = {
      query: limitedQuery,
      searchQuery: effectiveQuery,
      stylePrefs,
      results: items.slice(0, 3),
    };
    updateDocsDebugView();

    let docsText = items
      .map((item) => (item && typeof item.snippet === "string" ? item.snippet.trim() : ""))
      .filter((snippet) => snippet)
      .slice(0, 3)
      .join("\n---\n");

    if (stylePrefs) {
      const styleBlock = `Diagram styling preferences:\n${stylePrefs}`;
      docsText = docsText ? `${docsText}\n---\n${styleBlock}` : styleBlock;
    }

    return docsText;
  } catch {
    // On error we keep docs debug as-is; context just empty.
    return "";
  }
};

const checkProxyAvailability = async () => {
  setProxyStatus("unknown");
  try {
    console.log("Checking proxy availability at:", getCliproxyModelsUrl());
    const response = await fetch(getCliproxyModelsUrl(), {
      headers: {
        Authorization: `Bearer ${cliproxyApiToken}`,
      },
    });
    console.log("Proxy response status:", response.status);
    if (response.ok) {
      setProxyStatus("ok");
      displayStatus("Proxy connection OK", "success");
    } else {
      console.log("Proxy response not OK:", response.status, response.statusText);
      setProxyStatus("error");
      displayStatus(`Proxy error: ${response.status} ${response.statusText}`, "error");
    }
  } catch (error) {
    console.log("Proxy check error:", error);
    setProxyStatus("error");
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      displayStatus("Proxy connection blocked. Check if cliproxyapi is running on port 8317.", "error");
    } else {
      displayStatus(`Proxy connection error: ${error.message}`, "error");
    }
  }
};

const callCliproxyApiStructure = async (promptMessage, contextDiagramCode) => {
  let systemPrompt =
    "Ты помощник, который генерирует только валидный код диаграмм Mermaid. " +
    "На этом шаге сосредоточься только на структуре (сущности, связи, кардинальности) и используй максимально простое оформление без тем, цветов и сложных стилей. " +
    "Отвечай строго в таком формате: сначала блок ```mermaid ... ``` с кодом диаграммы, " +
    "затем на новой строке 'RU_SUMMARY:' и одну-две короткие фразы по-русски, " +
    "кратко описывающие, что изображает диаграмма.";

  if (selectedDiagramType !== "auto") {
    systemPrompt += `\n\nВАЖНО: Пользователь явно запросил тип диаграммы: ${selectedDiagramType}. Ты ОБЯЗАН сгенерировать диаграмму именно этого типа.`;
  }

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
  return { code: candidate.trim(), reasoning: summary, rawContent, systemPrompt };
};

const callCliproxyApiStyle = async (diagramCode, docsContext) => {
  const systemPrompt =
    "Ты помощник, который улучшает только визуальное оформление уже валидной диаграммы Mermaid. " +
    "Не меняй сущности, связи и кардинальности. " +
    "Твоя задача - сделать диаграмму красивой, профессиональной и максимально читаемой.\n\n" +
    "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
    "1. Группировка: Если диаграмма позволяет (например, flowchart), обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
    "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`), чтобы схема выглядела компактно и последовательно.\n" +
    "3. Формы: Используй разнообразные формы узлов (цилиндры для БД `[()`, ромбы для условий `{}`, округлые для старта/финиша `()`) для семантической ясности.\n\n" +
    "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
    "- Для 'graph' или 'flowchart': Активно используй 'classDef' и оператор ':::' для цветового кодирования типов узлов. Делай стили контрастными и приятными.\n" +
    "- Для 'erDiagram', 'sequenceDiagram', 'gantt', 'journey': ЗАПРЕЩЕНО использовать 'classDef' или стили внутри узлов (это ломает рендер). " +
    "Используй ТОЛЬКО директиву инициализации в первой строке: %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%. " +
    "Настраивай цвета через 'primaryColor', 'tertiaryColor', 'edgeLabelBackground' и другие переменные темы.\n\n" +
    "Отвечай в том же формате: блок ```mermaid ... ``` и затем строка 'RU_SUMMARY:'.";

  let userContent =
    "Here is an existing valid Mermaid diagram that describes the structure (entities and relations).\n" +
    "Do not change the logical structure, only improve visual styling using Mermaid features (themes, classDef, layout, directions, etc.).\n\n" +
    "```mermaid\n" +
    diagramCode +
    "\n```\n";

  if (docsContext && typeof docsContext === "string" && docsContext.trim()) {
    userContent +=
      "\nHere is documentation and styling preferences context (including possible Mermaid features and desired style):\n" +
      docsContext.trim() +
      "\n";
  }

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
    throw new Error(`cliproxyapi error (style): ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  const candidate = extractMermaidCode(rawContent);
  if (!candidate) {
    throw new Error("cliproxyapi style response missing Mermaid code");
  }
  const summary = extractRussianSummary(rawContent);
  return { code: candidate.trim(), reasoning: summary, rawContent, systemPrompt };
};

const callCliproxyApiFixStyle = async (badCode, errors) => {
  const systemPrompt =
    "Ты технический специалист по Mermaid.js. " +
    "Твоя задача - исправить синтаксические ошибки в коде диаграммы, который пытались стилизовать. " +
    "Оставь структуру без изменений. Исправь только синтаксис стилей (themeVariables, init directives). " +
    "Если какие-то стили невозможно применить валидно (например classDef в erDiagram) - удали их, но верни валидный код. " +
    "Отвечай только блоком ```mermaid ... ```.";

  const userContent =
    "The following Mermaid code is invalid:\n\n" +
    "```mermaid\n" + badCode + "\n```\n\n" +
    "Error message:\n" + errors.join("\n") + "\n\n" +
    "Please fix the syntax errors.";

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
    throw new Error(`cliproxyapi error (fix style): ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  const candidate = extractMermaidCode(rawContent);
  return { code: candidate.trim(), rawContent };
};


// Add diagram type buttons listeners
const diagramTypeButtons = document.querySelectorAll("#diagram-type-filters .filter-button");
diagramTypeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    // Remove active class from all
    diagramTypeButtons.forEach(b => b.classList.remove("filter-active"));
    // Add active to clicked
    btn.classList.add("filter-active");
    selectedDiagramType = btn.dataset.type;
    console.log("Selected diagram type:", selectedDiagramType);
  });
});

const styleCurrentDiagram = async () => {
  if (activeDiagramIndex === -1 || !diagramHistory[activeDiagramIndex]) {
    displayStatus("No diagram to style.", "error");
    return;
  }

  const entry = diagramHistory[activeDiagramIndex];
  const structuralCode = entry.structuralCode;
  if (!structuralCode) {
    displayStatus("Current diagram has no structure code.", "error");
    return;
  }

  setButtonState(true);
  displayStatus("Applying styles...", "info");
  styleButton.textContent = "Styling...";

  const docsContext = lastDocsDebug ? lastDocsDebug.stylePrefs || "" : ""; 

  try {
    let { 
      code: styledCode,
      reasoning: styleReasoning,
      rawContent: styleRawContent,
      systemPrompt: styleSystemPrompt,
    } = await callCliproxyApiStyle(structuralCode, docsContext);

    console.log(`Structural code length: ${structuralCode.length}`);
    console.log(`Styled code received. Length: ${styledCode.length}`);

    // Append to conversation log of the entry
    entry.conversationLog.push({
      attempt: "style",
      system: styleSystemPrompt,
      user: "Apply visual styling to existing diagram based on docs/styling context.",
      assistant:
        typeof styleRawContent === "string"
          ? styleRawContent
          : JSON.stringify(styleRawContent, null, 2),
    });
    // Update global log for view
    conversationLog = entry.conversationLog; 
    updateConversationView();

    let styleValidation = await validateMermaidCode(styledCode);
    
    let styleFixAttempts = 0;
    const maxStyleFixAttempts = 5;

    while (!styleValidation.isValid && styleFixAttempts < maxStyleFixAttempts) {
      styleFixAttempts++;
      console.warn(`Style validation failed (attempt ${styleFixAttempts}/${maxStyleFixAttempts}):`, styleValidation.errors);
      displayStatus(`Style invalid. Auto-fixing (attempt ${styleFixAttempts}/${maxStyleFixAttempts})...`, "info");

      try {
          const fixResult = await callCliproxyApiFixStyle(styledCode, styleValidation.errors);
          entry.conversationLog.push({
              attempt: `style-fix-${styleFixAttempts}`,
              system: "Fix invalid Mermaid syntax. Keep structure, fix styles only.",
              user: "Fix errors in:\n```mermaid\n" + styledCode + "\n```\n\nErrors:\n" + styleValidation.errors.join("\n"),
              assistant: fixResult.rawContent
          });
          conversationLog = entry.conversationLog;
          updateConversationView();
          
          styledCode = fixResult.code;
          styleValidation = await validateMermaidCode(styledCode);
          
          if (styleValidation.isValid) {
              console.log("Style auto-fix successful.");
          } else {
              console.warn("Style auto-fix result still invalid:", styleValidation.errors);
          }
      } catch (fixErr) {
          console.warn("Style fix API call failed:", fixErr);
          break; 
      }
    }

    if (styleValidation.isValid) {
      if (styledCode.trim() !== structuralCode.trim()) {
          entry.finalCode = styledCode;
          entry.reasoning = styleReasoning || entry.reasoning; // Update reasoning if provided
          console.log("Styled code applied.");
          displayStatus("Diagram styled successfully.", "success");
      } else {
          console.log("Styled code is identical.");
          displayStatus("Styling yielded identical code.", "warning");
      }
    } else {
      displayStatus("Styling failed to produce valid code. Reverted to structure.", "error");
    }

    // Refresh UI
    syncUiWithActiveDiagram();

  } catch (err) {
    console.warn("Style process failed:", err);
    displayStatus(`Styling error: ${err.message || err}`, "error");
  } finally {
    styleButton.textContent = "Style";
    setButtonState(false);
    // Enable style button again because we have a valid structure
    if (styleButton) styleButton.disabled = false; 
  }
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
  conversationLog = [];
  updateConversationView();

  const docsContext = await fetchDocsContext(originalUserPrompt);

  while (retryCount < maxRetries) {
    let promptToSend = "";
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

      promptToSend = buildPrompt(
        originalUserPrompt,
        lastErrors,
        workingDiagramCode,
        docsContext,
      );
      const {
        code: structuralCode,
        reasoning: structuralReasoning,
        rawContent: structuralRawContent,
        systemPrompt: structuralSystemPrompt,
      } = await callCliproxyApiStructure(promptToSend, workingDiagramCode);

      conversationLog.push({
        attempt: `${attemptNumber} (structure)`,
        system: structuralSystemPrompt,
        user: promptToSend,
        assistant:
          typeof structuralRawContent === "string"
            ? structuralRawContent
            : JSON.stringify(structuralRawContent, null, 2),
      });
      updateConversationView();
      const structuralValidation = await validateMermaidCode(structuralCode);

      if (structuralValidation.isValid) {
        workingDiagramCode = structuralCode;

        // Create history entry
        const entry = {
          id: diagramHistory.length + 1,
          label: `D${diagramHistory.length + 1}`,
          structuralCode,
          finalCode: structuralCode, // Initially final is same as structure
          createdAt: Date.now(),
          reasoning: structuralReasoning,
          conversationLog: conversationLog.slice(),
          docsDebug: lastDocsDebug ? { ...lastDocsDebug } : null,
          docsContext: docsContext // Store context for later styling
        };
        diagramHistory.push(entry);
        setActiveDiagramIndex(diagramHistory.length - 1);
        
        displayStatus("Structure generated. Click 'Style' to apply visuals.", "success");
        
        setButtonState(false);
        if (styleButton) styleButton.disabled = false;
        
        return;
      }

      lastErrors = structuralValidation.errors;
      workingDiagramCode = structuralCode;
      retryCount += 1;
      displayStatus(`Validation failed (attempt ${retryCount} of ${maxRetries}): ${lastErrors.join("; ")}`, "error");
    } catch (error) {
      conversationLog.push({
        attempt: retryCount + 1,
        system: "",
        user: originalUserPrompt,
        assistant: `Error: ${error?.message || error}`,
      });
      updateConversationView();
      displayStatus(`Generation error: ${error?.message || error}`, "error");
      setButtonState(false);
      return;
    }
  }

  displayStatus("Failed to produce a valid diagram after retries.", "error");
  displayRawCode(currentDiagramCode);
  setButtonState(false);
};

if (styleButton) {
  styleButton.addEventListener("click", () => {
    styleCurrentDiagram();
  });
}

generateButton.addEventListener("click", () => {
  generateAndCorrectDiagram(promptInput.value);
});

if (newGenerateButton) {
  newGenerateButton.addEventListener("click", () => {
    // Start a completely new project: clear history and UI state
    diagramHistory = [];
    activeDiagramIndex = -1;
    currentDiagramCode = "";
    conversationLog = [];
    lastDocsDebug = null;
    renderArea.innerHTML = "";
    displayRawCode("");
    updateConversationView();
    updateDocsDebugView();
    rebuildDiagramTabs();
    updateViewToggleButtons();
    displayStatus("New project started. Enter a prompt and click Generate.", "info");
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
  const order = ["all", "gpt", "gemini", "glm"];
  const labels = {
    all: "All",
    gpt: "gpt",
    gemini: "gemini",
    glm: "glm",
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

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    if (modelSelect.value) {
      cliproxyApiModel = modelSelect.value;
    }
  });
}

initModelSelection();

if (viewStructureButton) {
  viewStructureButton.addEventListener("click", () => {
    console.log("View Structure clicked");
    setDiagramViewMode("structure");
  });
}

if (viewStyledButton) {
  viewStyledButton.addEventListener("click", () => {
    console.log("View Styled clicked");
    setDiagramViewMode("styled");
  });
}

// Make verbose debug sections collapsible
makeCollapsibleSection("prompt-input");
makeCollapsibleSection("model-reasoning-output");
makeCollapsibleSection("llm-conversation-output");
makeCollapsibleSection("docs-debug-output");

displayStatus("Waiting for a prompt.", "info");