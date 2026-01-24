import type { DiagramType } from "../types";

export const augmentMermaidErrorForAutoFix = (
  diagramType: DiagramType,
  errorMessage: string,
): string => {
  const msg = (errorMessage ?? "").trim();
  if (!msg) return msg;

  if (diagramType === "c4") {
    const isLexical =
      /lexical error/i.test(msg) || /unrecognized text/i.test(msg);
    const isParse = /parse error/i.test(msg) || /expecting/i.test(msg);
    if (isLexical || isParse) {
      return [
        msg,
        "",
        "Hint: Mermaid C4 поддерживает только C4-PlantUML синтаксис (Person/System/Container/Component/Boundary/Rel).",
        "Hint: Boundary-обертки: Boundary, Enterprise_Boundary, System_Boundary, Container_Boundary (Component_Boundary нет).",
        "Hint: Если нужно сгруппировать компоненты, используй Boundary(...) { ... }.",
        "Hint: Первая строка должна быть C4Context | C4Container | C4Component | C4Dynamic | C4Deployment.",
      ].join("\n");
    }
  }

  if (diagramType === "architecture") {
    if (
      /unexpected character:\s*->/i.test(msg) ||
      /Expecting:\s*one of these possible Token sequences:\s*\n\s*\d+\.\s*\[--\]/i.test(
        msg,
      )
    ) {
      return [
        msg,
        "",
        "Hint: для `architecture-beta` нельзя использовать `->` / `<-` и узлы вида `A[Text]` как во flowchart.",
        "Hint: объявляй `service`/`group`/`junction`, а связи пиши как `A:R -- L:B` (стороны `L|R|T|B`, стрелки через `<`/`>`).",
        "Hint: если встречаются `->`/`<-`, перепиши всю диаграмму в корректном синтаксисе architecture-beta.",
        "Hint: пример связи: `api:R -- L:db` или `api:R --> L:db` (стрелка только через `<`/`>` на концах).",
      ].join("\n");
    }
  }

  return msg;
};
