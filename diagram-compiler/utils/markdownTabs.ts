export const getMarkdownMermaidDiagnosticsCounts = (
  diagnostics: Array<{ isValid?: boolean } | null | undefined>
) => {
  let validCount = 0;
  let invalidCount = 0;
  diagnostics.forEach((diag) => {
    if (diag?.isValid === true) validCount += 1;
    if (diag?.isValid === false) invalidCount += 1;
  });
  return { validCount, invalidCount };
};

export const getMarkdownDiagramTabTooltip = (args: {
  diagramLabel: string;
  index: number;
  isInvalid: boolean;
}) => {
  const suffix = args.isInvalid ? ' (invalid)' : '';
  return `${args.diagramLabel} #${args.index + 1}${suffix}`;
};
