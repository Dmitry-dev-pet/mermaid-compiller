export const insertDirectiveAfterLeadingDirectives = (code: string, directiveLine: string): string => {
  const lines = code.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? '';
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (!trimmed.startsWith('%%{')) break;

    while (index < lines.length && !lines[index]!.includes('}%%')) {
      index += 1;
    }
    if (index < lines.length) index += 1;
  }

  return [...lines.slice(0, index), directiveLine, ...lines.slice(index)].join('\n');
};

