export const insertDirectiveAfterLeadingDirectives = (code: string, directiveLine: string): string => {
  const lines = code.split(/\r?\n/);
  let index = 0;
  let consumedFrontmatter = false;

  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? '';
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (!consumedFrontmatter && trimmed === '---') {
      index += 1;
      while (index < lines.length) {
        if ((lines[index]?.trim() ?? '') === '---') {
          index += 1;
          break;
        }
        index += 1;
      }
      consumedFrontmatter = true;
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
