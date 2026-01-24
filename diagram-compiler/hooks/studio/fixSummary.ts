import { detectMermaidDiagramType } from "../../services/mermaidService";

export type FixSummaryArgs = {
  indexLabel?: string;
  attempts: number;
  changed: boolean;
  cleared: boolean;
  wasValid: boolean;
  errorMessage?: string;
  finalErrorMessage?: string;
  before?: string;
  after?: string;
};

const extractLineNumber = (text: string) => {
  const match = text.match(/line\s+(\d+)/i);
  return match ? match[1] : "";
};

export const summarizeFixOutcome = (args: FixSummaryArgs) => {
  const rawError = args.finalErrorMessage ?? args.errorMessage ?? "";
  const errorLine = rawError.split(/\r?\n/)[0]?.slice(0, 160) ?? "";
  const errorNote = !args.wasValid && errorLine ? `ошибка: ${errorLine}` : "";
  let typeNote = "";
  let diagnosisNote = "";
  let diffNote = "";
  if (
    args.changed &&
    !args.cleared &&
    args.before !== undefined &&
    args.after !== undefined
  ) {
    const beforeLines = args.before.split(/\r?\n/);
    const afterLines = args.after.split(/\r?\n/);
    const beforeType = detectMermaidDiagramType(args.before);
    const afterType = detectMermaidDiagramType(args.after);
    if (beforeType || afterType) {
      typeNote = `тип: ${beforeType ?? "unknown"} → ${afterType ?? "unknown"}`;
    }
    const beforeHead = beforeLines.find((line) => line.trim().length > 0) ?? "";
    const afterHead = afterLines.find((line) => line.trim().length > 0) ?? "";
    if (beforeHead && afterHead && beforeHead.trim() !== afterHead.trim()) {
      const hasNonAscii = Array.from(beforeHead).some(
        (char) => char.charCodeAt(0) > 127,
      );
      if ((args.errorMessage ?? "").includes("No diagram type detected")) {
        diagnosisNote = `исправлен заголовок диаграммы: "${beforeHead.trim()}" → "${afterHead.trim()}"`;
      }
      if (!diagnosisNote && hasNonAscii) {
        diagnosisNote = `исправлены некорректные символы в заголовке: "${beforeHead.trim()}" → "${afterHead.trim()}"`;
      }
    }
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    let changedLines = 0;
    let firstDiffLine = -1;
    for (let i = 0; i < maxLines; i += 1) {
      const beforeLine = beforeLines[i] ?? "";
      const afterLine = afterLines[i] ?? "";
      if (beforeLine !== afterLine) {
        changedLines += 1;
        if (firstDiffLine === -1) {
          firstDiffLine = i;
        }
      }
    }
    if (changedLines > 0 && firstDiffLine >= 0) {
      const beforeSample = (beforeLines[firstDiffLine] ?? "").slice(0, 80);
      const afterSample = (afterLines[firstDiffLine] ?? "").slice(0, 80);
      diffNote = `изменено строк: ~${changedLines}; пример L${firstDiffLine + 1}: "${beforeSample}" -> "${afterSample}"`;
    }
  }
  const combinedDiagnosis = typeNote;
  const errorText = errorNote ? errorNote.replace(/^ошибка:\s*/i, "") : "";
  const statusLine = args.indexLabel ? args.indexLabel : "блок";
  const resultLabel = args.cleared
    ? "очищен"
    : args.wasValid
      ? "валиден"
      : "с ошибкой";
  const changedLabel = args.changed ? "да" : "нет";
  const changesSummary = diffNote
    ? diffNote
        .replace(/^изменено строк:\s*~?\d+;.*$/i, (match) => {
          const count = match.match(/~?\d+/)?.[0] ?? "";
          return count ? `Строк: ${count}` : "";
        })
        .trim()
    : "";
  const exampleMatch = diffNote.match(
    /пример\s+L(\d+):\s+"([^"]*)"\s+->\s+"([^"]*)"/i,
  );
  const exampleLine = exampleMatch
    ? `- Пример (L${exampleMatch[1]}): \`${exampleMatch[2]}\` → \`${exampleMatch[3]}\``
    : "";

  const lineHint = errorText ? extractLineNumber(errorText) : "";
  const explanation = diagnosisNote
    ? diagnosisNote
    : errorText
      ? (() => {
          if (/no diagram type detected/i.test(errorText)) {
            return "Не распознан тип диаграммы. Проверьте заголовок.";
          }
          if (/parse error|syntax error|unexpected/i.test(errorText)) {
            return `Синтаксическая ошибка${lineHint ? ` в строке ${lineHint}` : ""}.`;
          }
          return `Mermaid не смог разобрать синтаксис${lineHint ? ` (строка ${lineHint})` : ""}.`;
        })()
      : "";

  const base = [
    `Итог: ${statusLine} — ${resultLabel}; попыток: ${args.attempts}; код изменён: ${changedLabel}.`,
  ];

  if (combinedDiagnosis)
    base.push(combinedDiagnosis.replace(/^тип:\s*/i, "Тип: "));
  if (changesSummary) base.push(changesSummary);
  if (!changesSummary && exampleLine) {
    base.push(exampleLine.replace(/^- /, "").replace(/`/g, ""));
  }
  if (explanation) base.push(explanation);
  if (errorText) base.push(`Ошибка: ${errorText.replace(/`/g, "")}`);

  return base.filter(Boolean).join("\n");
};
