import { getState } from "./state.js";
import { sanitizeMermaidCode } from "./sanitize.js";
import { prompts } from "./prompts.js";

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

export const buildPrompt = (userPrompt, validationErrors, previousCode, docsContext) => {
  return prompts.compose(userPrompt, docsContext, validationErrors, previousCode);
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
  const systemPrompt = prompts.structure.system(state.selectedDiagramType);
  const userContent = prompts.structure.user(promptMessage, contextDiagramCode);

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

export const callCliproxyApiStyle = async (diagramCode, docsContext, userIntent = "", diagramType = "auto") => {
  const state = getState();
  const strategyInstruction = prompts.style.getStrategy(diagramType);
  const systemPrompt = prompts.style.system(strategyInstruction);
  const userContent = prompts.style.user(diagramCode, docsContext, userIntent);

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
  
  const syntaxRules = prompts.style.getStrategy(diagramTypeLabel);
  const systemPrompt = prompts.fix.system(syntaxRules);
  const userContent = prompts.fix.user(diagramTypeLabel, structureCode, sanitizedBadCode, errors);

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
