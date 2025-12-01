export const setButtonState = (button, isLoading, loadingLabel = "Работаю...") => {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : "Эволюционировать";
};

export const displayStatus = (statusElement, message, type = "info") => {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
};

export const setProxyStatus = (indicator, status) => {
  if (!indicator) return;
  let className = "proxy-indicator";
  if (status === "ok") {
    className += " proxy-indicator-ok";
  } else if (status === "error") {
    className += " proxy-indicator-error";
  } else {
    className += " proxy-indicator-unknown";
  }
  indicator.className = className;
};

export const openModal = (overlay, titleNode, bodyNode, title, body) => {
  if (!overlay || !titleNode || !bodyNode) return;
  titleNode.textContent = title;
  bodyNode.textContent = body || "Нет данных";
  overlay.classList.remove("hidden");
};

export const closeModal = (overlay) => {
  if (!overlay) return;
  overlay.classList.add("hidden");
};

export const renderMermaidDiagram = async (container, code) => {
  try {
    if (!container) return;
    if (!code) {
      container.innerHTML = "";
      return;
    }
    const id = `mermaid-diagram-${Date.now()}`;
    const { svg, bindFunctions } = await mermaid.render(id, code);
    container.innerHTML = svg;
    if (bindFunctions) {
      bindFunctions(container);
    }
  } catch (error) {
    console.error("Mermaid render error:", error);
    container.innerHTML = `<div style="color: #ef4444; padding: 1rem; border: 1px dashed #ef4444;">Failed to render diagram:<br>${error.message}</div>`;
    throw error;
  }
};

export const updateModelSelectWidth = (selectNode, models) => {
  if (!selectNode || !Array.isArray(models) || !models.length) return;
  const maxLen = models.reduce((max, m) => {
    const id = m.id || "";
    return id.length > max ? id.length : max;
  }, 0);
  const minCh = 12;
  const paddingCh = 4;
  const widthCh = Math.max(minCh, maxLen + paddingCh);
  selectNode.style.minWidth = `${widthCh}ch`;
};

const buildStageBadgeLabel = (stage) => {
  if (stage.type === "structure") return "Structure";
  if (stage.type === "style") return "Style";
  if (stage.scope === "style") return "Style Fix";
  return "Fix";
};

const hasSuccessfulStage = (iteration, predicate) =>
  iteration.stages.some((stage) => stage.status === "success" && predicate(stage));

export const formatPromptsModalContent = (iteration) => {
  if (!iteration?.stages?.length) return "Нет стадий для отображения.";
  return iteration.stages
    .map((stage) => {
      const lines = [];
      lines.push(`${stage.label || buildStageBadgeLabel(stage)} [${stage.status}]`);
      lines.push(`Scope: ${stage.scope}`);
      const validationText = stage.validation?.isValid
        ? "Valid"
        : `Invalid: ${(stage.validation?.errors || []).join("; ")}`;
      lines.push(`Validation: ${validationText}`);
      lines.push("");
      lines.push("System prompt:");
      lines.push(stage.prompts?.system || "<empty>");
      lines.push("");
      lines.push("User prompt:");
      lines.push(stage.prompts?.user || "<empty>");
      lines.push("");
      lines.push("Assistant response:");
      lines.push(
        typeof stage.assistantRaw === "string"
          ? stage.assistantRaw
          : JSON.stringify(stage.assistantRaw, null, 2),
      );
      return lines.join("\n");
    })
    .join("\n\n------------------------------\n\n");
};

export const formatStageModalContent = (stage) => {
  if (!stage) return "Нет данных.";
  const lines = [];
  lines.push(`${stage.label || buildStageBadgeLabel(stage)} [${stage.status}]`);
  lines.push(`Scope: ${stage.scope}`);
  const validationText = stage.validation?.isValid
    ? "Valid"
    : `Invalid: ${(stage.validation?.errors || []).join("; ")}`;
  lines.push(`Validation: ${validationText}`);
  lines.push("");
  lines.push("System prompt:");
  lines.push(stage.prompts?.system || "<empty>");
  lines.push("");
  lines.push("User prompt:");
  lines.push(stage.prompts?.user || "<empty>");
  lines.push("");
  lines.push("Sanitized Mermaid code:");
  lines.push(stage.code || "<empty>");
  if (stage.rawCode) {
    lines.push("");
    lines.push("Raw Mermaid code:");
    lines.push(stage.rawCode);
  }
  lines.push("");
  lines.push("Assistant response:");
  lines.push(
    typeof stage.assistantRaw === "string"
      ? stage.assistantRaw
      : JSON.stringify(stage.assistantRaw, null, 2),
  );
  return lines.join("\n");
};

export const formatContextModalContent = (iteration) => {
  const lines = [];
  const original = iteration?.promptOriginal || iteration?.prompt || "—";
  lines.push(`Original prompt: ${original}`);
  if (iteration?.promptPrepared && iteration.promptPrepared !== original) {
    lines.push(`Prepared prompt: ${iteration.promptPrepared}`);
  }

  const appendDocsBlock = (title, meta, aggregatedText) => {
    const block = [];
    const ctx = meta || {};
    block.push("");
    block.push(`${title}:`);
    block.push(`Raw docs query: ${ctx.rawQuery || "—"}`);
    block.push(`Normalized search query: ${ctx.searchQuery || "—"}`);
    block.push(`Style prefs: ${ctx.stylePrefs || "—"}`);
    block.push("");
    if (!Array.isArray(ctx.snippets) || !ctx.snippets.length) {
      const fallbackText = aggregatedText && aggregatedText.trim();
      block.push(fallbackText || "No doc snippets returned.");
    } else {
      ctx.snippets.forEach((item, index) => {
        const source = item?.source || "docs";
        const file = item?.file ? ` (${item.file})` : "";
        block.push(`Snippet ${index + 1} [${source}${file}]`);
        if (item?.snippet) {
          block.push(item.snippet.trim());
        }
        block.push("");
      });
    }
    return block;
  };

  lines.push(...appendDocsBlock("Structure docs context", iteration?.docsMeta, iteration?.docsContextText));

  const hasStyleMeta =
    iteration?.styleDocsMeta &&
    (iteration.styleDocsMeta.rawQuery ||
      iteration.styleDocsMeta.searchQuery ||
      (Array.isArray(iteration.styleDocsMeta.snippets) && iteration.styleDocsMeta.snippets.length));
  const hasStyleText = iteration?.styleDocsContextText && iteration.styleDocsContextText.trim();

  if (hasStyleMeta || hasStyleText) {
    lines.push(...appendDocsBlock("Style docs context", iteration?.styleDocsMeta, iteration?.styleDocsContextText));
  }

  return lines.join("\n");
};

export const renderIterationList = ({
  container,
  iterations = [],
  activeIterationIndex = -1,
  onSelectIteration = () => {},
  onStyleIteration = () => {},
  onShowPrompts = () => {},
  onShowStage = () => {},
  onShowContext = () => {},
} = {}) => {
  if (!container) return;
  container.textContent = "";
  if (!iterations.length) {
    const empty = document.createElement("div");
    empty.className = "iteration-summary";
    empty.textContent = "Пока нет итераций.";
    container.appendChild(empty);
    return;
  }

  iterations.forEach((iteration, index) => {
    const card = document.createElement("div");
    card.className = "iteration-card";
    if (index === activeIterationIndex) {
      card.classList.add("iteration-card-active");
    }
    card.addEventListener("click", () => onSelectIteration(index));

    const header = document.createElement("div");
    header.className = "iteration-card-header";

    const titleWrap = document.createElement("div");
    const labelSpan = document.createElement("span");
    labelSpan.className = "iteration-label";
    labelSpan.textContent = iteration.label;
    const summarySpan = document.createElement("span");
    summarySpan.className = "iteration-summary";
    summarySpan.textContent = iteration.summary || iteration.prompt.slice(0, 80) || "Без описания";
    titleWrap.appendChild(labelSpan);
    titleWrap.appendChild(summarySpan);

    const buttonWrap = document.createElement("div");
    buttonWrap.className = "iteration-buttons";

    const promptBtn = document.createElement("button");
    promptBtn.type = "button";
    promptBtn.className = "mini-button";
    promptBtn.textContent = "Промпт";
    promptBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      onShowPrompts(iteration);
    });

    const contextBtn = document.createElement("button");
    contextBtn.type = "button";
    contextBtn.className = "mini-button";
    contextBtn.textContent = "Контекст";
    contextBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      onShowContext(iteration);
    });

    buttonWrap.appendChild(promptBtn);
    buttonWrap.appendChild(contextBtn);

    header.appendChild(titleWrap);
    header.appendChild(buttonWrap);
    card.appendChild(header);

    const badgesWrap = document.createElement("div");
    badgesWrap.className = "iteration-badges";
    iteration.stages.forEach((stage) => {
      const stageRow = document.createElement("button");
      stageRow.type = "button";
      stageRow.className = "iteration-stage-row";
      stageRow.classList.add(stage.status === "success" ? "stage-badge-success" : "stage-badge-error");
      stageRow.textContent = `${stage.label || buildStageBadgeLabel(stage)} — ${stage.status}`;
      stageRow.addEventListener("click", (event) => {
        event.stopPropagation();
        onShowStage(stage);
      });
      badgesWrap.appendChild(stageRow);
    });
    card.appendChild(badgesWrap);

    const structureSuccess = hasSuccessfulStage(iteration, (stage) => stage.scope === "structure");
    const styleSuccess = hasSuccessfulStage(iteration, (stage) => stage.type === "style");

    if (structureSuccess) {
      const styleBtn = document.createElement("button");
      styleBtn.type = "button";
      styleBtn.className = "iteration-style-button";
      styleBtn.textContent = styleSuccess ? "Стилизовано" : "Стилизовать";
      styleBtn.disabled = styleSuccess;
      styleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        onStyleIteration(index, styleBtn);
      });
      card.appendChild(styleBtn);
    }

    container.appendChild(card);
  });
};
