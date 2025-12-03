import { getState } from "./state.js";
import { sanitizeMermaidCode } from "./sanitize.js";
import { prompts } from "./prompts.js";
import { docsManager } from "./docsManager.js"; // Import docsManager

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

    // --- Start: Replaced backend call with docsManager ---
    // Initialize docsManager if not already initialized
    await docsManager.init();
    const items = await docsManager.searchDocs(limitedQuery);
    // --- End: Replaced backend call with docsManager ---

    meta.searchQuery = limitedQuery; // No LLM normalization on client, so just use limitedQuery
    meta.stylePrefs = ""; // No LLM normalization on client

    meta.snippets = items.slice(0, 3); // Take top 3 snippets

    let docsText = items
      .map((item) => (item && typeof item.snippet === "string" ? item.snippet.trim() : ""))
      .filter(Boolean)
      .slice(0, 3)
      .join("\n---\n");

    // The stylePrefs logic is removed because client-side docsManager doesn't generate stylePrefs
    // if (meta.stylePrefs) {
    //   const styleBlock = `Diagram styling preferences:\n${meta.stylePrefs}`;
    //   docsText = docsText ? `${docsText}\n---\n${styleBlock}` : styleBlock;
    // }

    return { text: docsText, meta };
  } catch(e) {
    console.error("Error fetching docs context:", e);
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
  // Match any triple backtick block, optionally with a language identifier
  // This handles ```mermaid, ```marmaid, or just ```
  const fenced = text.match(/```(?:\w+)?([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    code = fenced[1].trim();
  } else {
    code = text.trim();
  }

  const summaryIndex = code.indexOf("RU_SUMMARY:");
  if (summaryIndex !== -1) {
    code = code.substring(0, summaryIndex).trim();
  }

  // Also cleanup any leading regex match leftovers if they leaked through
  // (though the regex match group 1 should exclude the backticks)
  return code.replace(/^```(?:\w+)?/i, "").replace(/```$/, "").trim();
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
  
  export const callCliproxyApiFixStructure = async (badCode, errors, diagramTypeLabel = "diagram", structureCode = "", docsContext = "") => {
    const state = getState();
    const sanitizedBadCode = sanitizeMermaidCode(badCode || "");
    
    // For structure fix, syntaxRules might be general Mermaid rules or specific type rules
    const syntaxRules = prompts.structure.getStrategy ? prompts.structure.getStrategy(diagramTypeLabel) : ""; // Assuming structure might have strategies too, if not, use empty.
    const systemPrompt = prompts.fix.system(syntaxRules);
    const userContent = prompts.fix.user(diagramTypeLabel, structureCode, sanitizedBadCode, errors, docsContext);
  
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
      throw new Error(`cliproxyapi error (fix structure): ${response.status}`);
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

export const analyzePrompt = async (userPrompt) => {
  const state = getState();
  // System prompt to classify intent and type
  const systemPrompt = `You are an intelligent assistant for a Mermaid diagram generator.
Determine the most likely Mermaid diagram type and the user's intent.

STRICT RULES for "diagramType":
1. Must be ONE of these supported types: flowchart, sequence, class, state, er, gantt, mindmap, pie, gitgraph, journey, timeline, c4, kanban, architecture, zenuml, sankey, xy, block, quadrant, requirement.
2. If the user asks for a topic (e.g. "hospital system", "login flow") WITHOUT specifying a diagram type, YOU MUST CHOOSE the single best type from the supported list (e.g. "class", "sequence", or "flowchart").
3. NEVER return the topic name (e.g. "главврач", "database") as the diagramType.
4. If you are unable to determine a specific type, default to "flowchart" as a general-purpose choice.

Return a STRICT JSON object:
{
  "diagramType": "string", 
  "intent": "string", // "create", "fix", "style"
  "confidence": number
}
`;

  const payload = {
    model: state.cliproxyApiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt.slice(0, 2000) }, // Limit context
    ],
    temperature: 0.0, // Deterministic
    response_format: { type: "json_object" } // If supported, otherwise we parse text
  };

  try {
    const response = await fetch(getCliproxyChatUrl(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${state.cliproxyApiToken}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Analysis failed");

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    
    // Clean up potential markdown wrappers if the model didn't respect json_object or it wasn't supported
    const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
        const result = JSON.parse(cleaned);
        // Normalize type names if needed (e.g. "sequenceDiagram" -> "sequence")
        // But our prompt asked for specific keys.
        return result;
    } catch (e) {
        console.warn("Failed to parse analysis JSON", e);
        return { diagramType: "auto", intent: "create", confidence: 0 };
    }
  } catch (e) {
      console.error("Prompt analysis error:", e);
      return { diagramType: "auto", intent: "create", confidence: 0 };
  }
};
