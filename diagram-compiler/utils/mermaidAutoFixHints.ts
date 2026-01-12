import type { DiagramType } from '../types';

export const augmentMermaidErrorForAutoFix = (
  diagramType: DiagramType,
  errorMessage: string
): string => {
  const msg = (errorMessage ?? '').trim();
  if (!msg) return msg;

  if (diagramType === 'architecture') {
    if (/unexpected character:\s*->/i.test(msg) || /Expecting:\s*one of these possible Token sequences:\s*\n\s*\d+\.\s*\[--\]/i.test(msg)) {
      return [
        msg,
        '',
        'Hint: для `architecture-beta` нельзя использовать `->` / `<-` и узлы вида `A[Text]` как во flowchart.',
        'Hint: объявляй `service`/`group`/`junction`, а связи пиши как `A:R -- L:B` (стороны `L|R|T|B`, стрелки через `<`/`>`).',
      ].join('\n');
    }
  }

  return msg;
};

