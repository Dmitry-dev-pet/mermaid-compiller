import { getState } from "./state.js";
import { sanitizeMermaidCode } from "./sanitize.js";

export const getCliproxyChatUrl = () => `${getState().cliproxyBaseUrl}/v1/chat/completions`;
export const getCliproxyModelsUrl = () => `${getState().cliproxyBaseUrl}/v1/models`;

const resolveDocsTemplate = (diagramType, kind) => {
  const { diagramDocsTemplates } = getState();
  const preset = diagramDocsTemplates[diagramType] || diagramDocsTemplates.auto;
  return preset[kind] || diagramDocsTemplates.auto[kind];
};

export const fetchDocsContext = async (diagramType, kind = "structure") => {
  const meta = {
    rawQuery: "",
    searchQuery: "",
    stylePrefs: "",
    snippets: [],
  };

  try {
    const preparedQuery = resolveDocsTemplate(diagramType, kind);
    if (!preparedQuery) {
      return { text: "", meta };
    }

    const limitedQuery = preparedQuery.slice(0, 80);
    meta.rawQuery = limitedQuery;
    const { cliproxyApiModel, docsSearchUrl } = getState();
    const modelParam = cliproxyApiModel ? `&model=${encodeURIComponent(cliproxyApiModel)}` : "";
    const response = await fetch(`${docsSearchUrl}?q=${encodeURIComponent(limitedQuery)}${modelParam}`);
    if (!response.ok) {
      return { text: "", meta };
    }

    const data = await response.json();
    const items = Array.isArray(data?.results) ? data.results : [];

    meta.searchQuery =
      typeof data?.search_query === "string" && data.search_query.trim()
        ? data.search_query.trim()
        : limitedQuery;

    meta.stylePrefs =
      typeof data?.style_prefs === "string" && data.style_prefs.trim()
        ? data.style_prefs.trim()
        : "";

    meta.snippets = items.slice(0, 3);

    let docsText = items
      .map((item) => (item && typeof item.snippet === "string" ? item.snippet.trim() : ""))
      .filter(Boolean)
      .slice(0, 3)
      .join("\n---\n");

    if (meta.stylePrefs) {
      const styleBlock = `Diagram styling preferences:\n${meta.stylePrefs}`;
      docsText = docsText ? `${docsText}\n---\n${styleBlock}` : styleBlock;
    }

    return { text: docsText, meta };
  } catch {
    return { text: "", meta };
  }
};

export const fetchStyleDocsContext = (iteration) => fetchDocsContext(iteration.diagramType, "style");

export const composeFinalPrompt = (basePrompt, docsContext) => {
  const trimmedBase = basePrompt.trim();
  const trimmedDocs = docsContext && typeof docsContext === "string" ? docsContext.trim() : "";

  if (!trimmedDocs) {
    return trimmedBase;
  }

  return [trimmedBase, "", "Relevant Mermaid documentation:", trimmedDocs].join("\n");
};

export const buildPrompt = (userPrompt, validationErrors, previousCode, docsContext) => {
  const finalPrompt = composeFinalPrompt(userPrompt, docsContext);

  if (previousCode && !validationErrors.length) {
    return `${finalPrompt}\n\nYou are updating an existing Mermaid diagram. Here is the current diagram:\n${previousCode}\n\nPlease update this diagram according to the new instructions while keeping it syntactically valid.`;
  }

  if (validationErrors.length && previousCode) {
    return `${finalPrompt}\n\nThe previous Mermaid code was invalid.\nErrors: ${validationErrors.join("; ")}\nPlease fix the diagram while keeping the intent.`;
  }

  return finalPrompt;
};

export const extractMermaidCode = (text) => {
  if (!text || typeof text !== "string") return "";

  let code = "";
  const fenced = text.match(/```mermaid([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    code = fenced[1].trim();
  } else {
    code = text.trim();
  }

  const summaryIndex = code.indexOf("RU_SUMMARY:");
  if (summaryIndex !== -1) {
    code = code.substring(0, summaryIndex).trim();
  }

  return code.replace(/^```mermaid/i, "").replace(/```$/, "").trim();
};

export const extractRussianSummary = (text) => {
  if (!text || typeof text !== "string") return "";
  const marker = "RU_SUMMARY:";
  const index = text.indexOf(marker);
  if (index === -1) return "";
  return text.slice(index + marker.length).trim();
};

export const callCliproxyApiStructure = async (promptMessage, contextDiagramCode) => {
  const state = getState();
  let systemPrompt =
    "Ты помощник, который генерирует только валидный код диаграмм Mermaid. " +
    "На этом шаге сосредоточься только на структуре (сущности, связи, кардинальности) и используй максимально простое оформление без тем, цветов и сложных стилей. " +
    "Отвечай строго в таком формате: сначала блок ```mermaid ... ``` с кодом диаграммы, " +
    "затем на новой строке 'RU_SUMMARY:' и одну-две короткие фразы по-русски, " +
    "кратко описывающие, что изображает диаграмма.";

  if (state.selectedDiagramType !== "auto") {
    systemPrompt += `\n\nВАЖНО: Пользователь явно запросил тип диаграммы: ${state.selectedDiagramType}. Ты ОБЯЗАН сгенерировать диаграмму именно этого типа.`;
  }

  const userContent = contextDiagramCode
    ? `${promptMessage}\n\nCurrent Mermaid diagram:\n${contextDiagramCode}`
    : promptMessage;

  const payload = {
    model: state.cliproxyApiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(getCliproxyChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.cliproxyApiToken}`,
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
  return {
    code: sanitizeMermaidCode(candidate.trim()),
    reasoning: summary,
    rawContent,
    systemPrompt,
    userPrompt: userContent,
  };
};

const getStyleStrategy = (diagramType) => {
  const type = (diagramType || "auto").toLowerCase();

  const commonStrategy =
    "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
    "1. Читаемость: Сделай диаграмму аккуратной и понятной.\n" +
    "2. Цвета: Используй гармоничную палитру.\n";

  const specificStrategies = {
    flowchart:
      "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
      "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
      "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
      "3. Формы: Используй разнообразные формы узлов (цилиндры [()], ромбы {}, круги ()) для семантики.\n\n" +
      "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Активно используй 'classDef' и оператор ':::' для цветового кодирования. Делай стили контрастными.\n",
    
    graph:
      "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
      "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
      "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
      "3. Формы: Используй разнообразные формы узлов (цилиндры [()], ромбы {}, круги ()) для семантики.\n\n" +
      "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Активно используй 'classDef' и оператор ':::' для цветового кодирования. Делай стили контрастными.\n",

    erdiagram:
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
      "- Используй ТОЛЬКО директиву инициализации: %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n" +
      "- Настраивай 'primaryColor', 'tertiaryColor', 'edgeLabelBackground'.\n",

    sequencediagram:
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
      "- Используй директиву инициализации: %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n" +
      "- Можно использовать 'actor', 'participant' и 'box' для группировки.\n",
      
    gantt:
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Используй директиву инициализации: %%{init: {'theme': 'base', 'gantt': { ... }}}%% для настройки цветов.\n",
      
    classdiagram:
      "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
      "1. Структура: Группируй классы по пакетам (namespace), если это уместно.\n\n" +
      "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Можно использовать 'classDef' и ':::', но аккуратно. Или используй themeVariables.\n",
      
    state:
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Можно использовать 'classDef' для состояний.\n",
      
    statediagram:
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Можно использовать 'classDef' для состояний.\n",
      
    "statediagram-v2":
      commonStrategy +
      "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
      "- Можно использовать 'classDef' для состояний.\n",
  };

  // Fallback / Auto strategy
  const autoStrategy =
    "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
    "1. Группировка: Если диаграмма (flowchart) позволяет, используй `subgraph`.\n" +
    "2. Макет: Подбери `direction TB` или `LR`.\n\n" +
    "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
    "- Для 'graph'/'flowchart': Используй 'classDef' и ':::'.\n" +
    "- Для остальных (erDiagram, sequence, gantt): ЗАПРЕЩЕНО использовать 'classDef' внутри узлов. Используй %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n";

  return specificStrategies[type] || autoStrategy;
};

export const callCliproxyApiStyle = async (diagramCode, docsContext, userIntent = "", diagramType = "auto") => {
  const state = getState();
  const strategyInstruction = getStyleStrategy(diagramType);
  
  const systemPrompt =
    "Ты помощник, который улучшает только визуальное оформление уже валидной диаграммы Mermaid. " +
    "Не меняй сущности, связи и кардинальности. " +
    "Твоя задача - сделать диаграмму красивой, профессиональной и максимально читаемой.\n\n" +
    strategyInstruction +
    "\nОтвечай в том же формате: блок ```mermaid ... ``` и затем строка 'RU_SUMMARY:'.";

  const intentBlock = userIntent && userIntent.trim() ? `User intent:\n${userIntent.trim()}\n\n` : "";

  let userContent =
    intentBlock +
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
    model: state.cliproxyApiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(getCliproxyChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.cliproxyApiToken}`,
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
  return {
    code: sanitizeMermaidCode(candidate.trim()),
    reasoning: summary,
    rawContent,
    systemPrompt,
    userPrompt: userContent,
  };
};

export const callCliproxyApiFixStyle = async (badCode, errors, diagramTypeLabel = "diagram", structureCode = "") => {
  const state = getState();
  const sanitizedBadCode = sanitizeMermaidCode(badCode || "");
  
  // Retrieve the specific syntax rules for this diagram type
  const syntaxRules = getStyleStrategy(diagramTypeLabel);

  const systemPrompt = 
    "Ты эксперт по отладке Mermaid.js (Syntax Repair Agent).\n" +
    "Твоя ЕДИНСТВЕННАЯ цель: сделать код валидным, сохранив структуру.\n\n" +
    "ПРАВИЛА ИСПРАВЛЕНИЯ:\n" +
    "1. СТРУКТУРА: Не меняй узлы, связи и тексты. Используй 'Reference structure' как эталон логики.\n" +
    "2. СТИЛИ: Попробуй исправить синтаксис стиля (кавычки, скобки).\n" +
    "3. КРИТИЧЕСКИЙ ОТКАТ: Если стиль использует недопустимый для этого типа диаграммы синтаксис (например, `classDef` в ER/Sequence/Gantt) — УДАЛИ ЭТИ СТРОКИ СТИЛЕЙ ПОЛНОСТЬЮ.\n" +
    "4. КОНТЕКСТ ТИПА: Учитывай специфичные правила ниже.\n\n" +
    syntaxRules + "\n\n" +
    "Отвечай строго блоком ```mermaid ... ```. Никаких объяснений.";

  const referenceBlock = structureCode
    ? [
        "Reference structure (LOGIC MUST MATCH THIS):",
        "",
        "```mermaid",
        structureCode,
        "```",
        "",
      ].join("\n")
    : "";

  const userContent =
    `Diagram type: ${diagramTypeLabel}.\nFix styling syntax errors.\n\n` +
    referenceBlock +
    "Invalid Mermaid code (BROKEN STYLES): \n\n" +
    "```mermaid\n" +
    sanitizedBadCode +
    "\n```\n\n" +
    "Parser Errors:\n" +
    errors.join("\n") +
    "\n\nACTION: Fix the syntax. If styles are illegal/unfixable, DELETE THEM to make the diagram render.";

  const payload = {
    model: state.cliproxyApiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch(getCliproxyChatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.cliproxyApiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`cliproxyapi error (fix style): ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  const candidate = extractMermaidCode(rawContent);
  return {
    code: sanitizeMermaidCode(candidate?.trim() || ""),
    rawContent,
    systemPrompt: systemPrompt,
    userPrompt: userContent,
  };
};

export const fetchModels = async () => {
  const state = getState();
  const response = await fetch(getCliproxyModelsUrl(), {
    headers: {
      Authorization: `Bearer ${state.cliproxyApiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`cliproxyapi error: ${response.status}`);
  }

  return response.json();
};
