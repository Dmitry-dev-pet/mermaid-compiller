import {
  callCliproxyApiStructure,
  callCliproxyApiStyle,
  callCliproxyApiFixStyle,
  fetchStyleDocsContext,
  buildPrompt,
} from "./api.js";
import {
  sanitizeMermaidCode,
} from "./sanitize.js";
import {
  getState,
  addIteration,
  createIterationEntry,
  setActiveIterationIndex,
} from "./state.js";
import { validateMermaidCode } from "./validation.js";

export const runStructureFlow = async (iteration, { prompt, previousCode, docsContextText }, callbacks = {}) => {
  const state = getState();
  let workingCode = previousCode || "";
  let lastErrors = [];
  const { onStageAdded, onStatusUpdate } = callbacks;

  for (let attempt = 0; attempt < state.maxStructureRetries; attempt += 1) {
    const promptToSend = buildPrompt(prompt, lastErrors, workingCode, docsContextText);
    
    try {
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

      // Mutate iteration directly (it's a reference from state)
      iteration.stages.push(stage);
      if (stageInfo.reasoning) {
        iteration.summary = stageInfo.reasoning;
      }

      if (onStageAdded) onStageAdded(iteration);

      if (validation.isValid) {
        iteration.activeCode = sanitizedCode;
        return { success: true };
      }

      lastErrors = validation.errors;
      workingCode = sanitizedCode;
      if (onStatusUpdate) onStatusUpdate(`Структура невалидна: ${validation.errors.join("; ")}`, "error");
      
    } catch (error) {
      if (onStatusUpdate) onStatusUpdate(`Error in structure flow: ${error.message}`, "error");
      return { success: false, error };
    }
  }

  return { success: false };
};

export const runStyleFlow = async (parentIteration, callbacks = {}) => {
  const state = getState();
  const { onStageAdded, onStatusUpdate } = callbacks;
  
  if (!parentIteration || !parentIteration.activeCode) {
    if (onStatusUpdate) onStatusUpdate("Нет валидной структуры для стилизации.", "error");
    return { success: false };
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
  setActiveIterationIndex(styleIterationIndex);
  
  // Notify UI that a new iteration is active
  if (onStageAdded) onStageAdded(styleIteration); 

  if (onStatusUpdate) onStatusUpdate("Запуск стилизации...", "info");

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
    
    if (onStageAdded) onStageAdded(styleIteration);

    let attempt = 0;
    while (!validation.isValid && attempt < state.maxStyleFixAttempts) {
      attempt += 1;
      if (onStatusUpdate) onStatusUpdate(`Стиль невалиден. Авто-фиксация (${attempt}/${state.maxStyleFixAttempts})...`, "error");

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
        
        if (onStageAdded) onStageAdded(styleIteration);

        if (!codeChanged) {
          if (onStatusUpdate) onStatusUpdate("Авто-фиксер вернул тот же код. Останавливаем цикл.", "error");
          break;
        }
      } catch (fixError) {
        if (onStatusUpdate) onStatusUpdate(`Style fix error: ${fixError.message || fixError}`, "error");
        break;
      }
    }

    if (validation.isValid) {
      styleIteration.activeCode = styledCode;
      if (onStatusUpdate) onStatusUpdate("Диаграмма стилизована.", "success");
      return { success: true };
    } else {
      if (onStatusUpdate) onStatusUpdate("Не удалось получить валидный стиль.", "error");
      return { success: false };
    }
  } catch (error) {
    if (onStatusUpdate) onStatusUpdate(`Ошибка стилизации: ${error.message || error}`, "error");
    return { success: false, error };
  }
};
