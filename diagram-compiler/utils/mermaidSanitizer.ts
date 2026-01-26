import type { DiagramType } from "../types";

const normalizeEscapedBr = (code: string) => {
  // LLMs (or intermediate renderers) may HTML-escape `<br/>` inside labels.
  // Mermaid expects a real `<br/>` tag for line breaks in labels.
  return code
    .replace(/&amp;lt;br\s*\/?&amp;gt;/gi, "<br/>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br/>");
};

const sanitizeArrowSyntax = (code: string) => {
  // Mermaid flowchart/state diagrams use `-->` / `<--`. LLMs sometimes emit `->` / `<-`.
  // Convert only the "single dash" variants, avoiding valid arrows like `-->`, `-.->`, `==>`,
  // and sequence arrows like `->>`.
  return code
    .replace(/(?<![-.=])<-(?!-)/g, "<--")
    .replace(/(?<![-.=])->(?!>)/g, "-->");
};

const sanitizeFlowchartLabels = (code: string) => {
  if (!code.trim().startsWith("flowchart")) return code;
  const replaceLiteralNewlines = (value: string) =>
    value.replace(/\\n/g, "<br/>");
  const replaceParens = (value: string) => {
    const withQuotes = replaceLiteralNewlines(value).replace(/"/g, "'");
    const withGroups = withQuotes.replace(/\(([^)]*)\)/g, (_match, inner) => {
      const trimmed = String(inner ?? "").trim();
      return trimmed ? ` — ${trimmed}` : "";
    });
    const withoutLoose = withGroups.replace(/[()]/g, "");
    return withoutLoose
      .replace(/\s*—\s*/g, " — ")
      .replace(/\s+/g, " ")
      .trim();
  };
  let next = sanitizeArrowSyntax(code);
  next = next.replace(/\\n/g, "<br/>");
  next = next.replace(
    /\|([^|\n]*)\|/g,
    (match, label) => `|${replaceParens(label)}|`,
  );
  next = next.replace(
    /\[([^\]\n]*)\]/g,
    (match, label) => `[${replaceParens(label)}]`,
  );
  next = next.replace(
    /\{([^}\n]*)\}/g,
    (match, label) => `{${replaceParens(label)}}`,
  );
  return next;
};

const sanitizeStateLabels = (code: string) => {
  if (!/^stateDiagram/i.test(code.trim())) return code;
  return code.replace(/\\n/g, "<br/>");
};

const sanitizeArchitectureIds = (code: string) => {
  if (!code.trim().startsWith("architecture-beta")) return code;
  const idMap = new Map<string, string>();
  let counter = 1;
  const transliterate = (value: string) => {
    const map: Record<string, string> = {
      А: "A",
      Б: "B",
      В: "V",
      Г: "G",
      Д: "D",
      Е: "E",
      Ё: "E",
      Ж: "Zh",
      З: "Z",
      И: "I",
      Й: "I",
      К: "K",
      Л: "L",
      М: "M",
      Н: "N",
      О: "O",
      П: "P",
      Р: "R",
      С: "S",
      Т: "T",
      У: "U",
      Ф: "F",
      Х: "H",
      Ц: "Ts",
      Ч: "Ch",
      Ш: "Sh",
      Щ: "Shch",
      Ы: "Y",
      Э: "E",
      Ю: "Yu",
      Я: "Ya",
      а: "a",
      б: "b",
      в: "v",
      г: "g",
      д: "d",
      е: "e",
      ё: "e",
      ж: "zh",
      з: "z",
      и: "i",
      й: "i",
      к: "k",
      л: "l",
      м: "m",
      н: "n",
      о: "o",
      п: "p",
      р: "r",
      с: "s",
      т: "t",
      у: "u",
      ф: "f",
      х: "h",
      ц: "ts",
      ч: "ch",
      ш: "sh",
      щ: "shch",
      ы: "y",
      э: "e",
      ю: "yu",
      я: "ya",
    };
    return value
      .split("")
      .map((char) => map[char] ?? char)
      .join("");
  };
  const alphaId = (value: number) => {
    let next = value;
    let result = "";
    while (next > 0) {
      const index = (next - 1) % 26;
      result = String.fromCharCode(97 + index) + result;
      next = Math.floor((next - 1) / 26);
    }
    return result;
  };
  const toId = (raw: string) => {
    const normalizedRaw = raw.toLowerCase();
    if (idMap.has(normalizedRaw)) return idMap.get(normalizedRaw)!;
    let base = normalizedRaw.replace(/[^A-Za-z]/g, "");
    if (!base) {
      base = `id${alphaId(counter)}`;
      counter += 1;
    }
    if (/^\d/.test(base)) base = `id${alphaId(counter)}`;
    if ([...idMap.values()].includes(base)) {
      idMap.set(normalizedRaw, base);
      return base;
    }
    let candidate = base;
    let suffix = 1;
    while ([...idMap.values()].includes(candidate)) {
      candidate = `${base}${alphaId(suffix)}`;
      suffix += 1;
    }
    idMap.set(normalizedRaw, candidate);
    return candidate;
  };
  const sanitizeIcon = (raw: string) => {
    const cleaned = raw.replace(/[^A-Za-z0-9:.-]/g, "").toLowerCase();
    return cleaned;
  };
  const lines = code.split(/\r?\n/);
  const sanitizeLabel = (value: string) => {
    const normalized = transliterate(value)
      .replace(/[^A-Za-z0-9]/g, "")
      .trim();
    return normalized || "Label";
  };
  const servicesInGroups = new Set<string>();
  const groupIds = new Set<string>();
  const normalizeGroupOrService = (line: string) => {
    const match = line.match(
      /^\s*(group|service)\s+([^\s(]+)(?:\(([^)]*)\))?(?:\s*\[([^\]]*)\])?(?:\s+in\s+([^\s]+))?\s*$/i,
    );
    if (!match) return line;
    const kind = match[1].toLowerCase();
    const rawId = match[2];
    const rawIcon = match[3];
    const rawLabel = match[4];
    const rawParent = match[5];
    const defaultIcon = kind === "group" ? "cloud" : "server";
    const icon = sanitizeIcon(rawIcon || defaultIcon);
    const label = sanitizeLabel(rawLabel || rawId);
    const parent = rawParent ? ` in ${toId(rawParent)}` : "";
    return `${kind} ${rawId}(${icon})[${label}]${parent}`;
  };
  const normalizeGroupRef = (value: string) => {
    const base = value.replace(/\{group\}/gi, "");
    const mapped = toId(base);
    if (!servicesInGroups.has(mapped)) return mapped;
    return `${mapped}{group}`;
  };
  const replaceIdsInLine = (line: string) => {
    let next = line;
    next = next.replace(/\(([^)]+)\)/g, (_match, icon) => {
      const cleaned = sanitizeIcon(icon);
      return cleaned ? `(${cleaned})` : "";
    });
    next = next.replace(/\[([^\]\n]*)\]/g, (_match, label) => {
      return `[${sanitizeLabel(label)}]`;
    });
    next = next.replace(/\bservice\{([^}]+)\}/g, (_match, id) => {
      return `service{${toId(id)}}`;
    });
    next = next.replace(/([\p{L}0-9_]+\{group\})/giu, (_match, id) => {
      return normalizeGroupRef(id);
    });
    next = next.replace(
      /\bin\s+([\p{L}0-9_]+)\b/giu,
      (_match, id) => `in ${toId(id)}`,
    );
    next = next.replace(
      /(^|\s)([\p{L}0-9_]+)(\s*:\s*[LRTBlrtb])/giu,
      (_match, prefix, id, suffix) => {
        const normalizedSuffix = suffix.replace(/[lrtb]/gi, (value) =>
          value.toUpperCase(),
        );
        return `${prefix}${toId(id)}${normalizedSuffix}`;
      },
    );
    next = next.replace(
      /(^|\s)([\p{L}0-9_]+\{group\})(\s*:\s*[LRTBlrtb])/giu,
      (_match, prefix, id, suffix) => {
        const normalizedSuffix = suffix.replace(/[lrtb]/gi, (value) =>
          value.toUpperCase(),
        );
        return `${prefix}${normalizeGroupRef(id)}${normalizedSuffix}`;
      },
    );
    next = next.replace(
      /([LRTBlrtb]\s*:\s*)([\p{L}0-9_]+)/giu,
      (_match, prefix, id) => {
        const normalizedPrefix = prefix.replace(/[lrtb]/gi, (value) =>
          value.toUpperCase(),
        );
        return `${normalizedPrefix}${toId(id)}`;
      },
    );
    next = next.replace(
      /([LRTBlrtb]\s*:\s*)([\p{L}0-9_]+\{group\})/giu,
      (_match, prefix, id) => {
        const normalizedPrefix = prefix.replace(/[lrtb]/gi, (value) =>
          value.toUpperCase(),
        );
        return `${normalizedPrefix}${normalizeGroupRef(id)}`;
      },
    );
    next = next.replace(/:\s*([lrtb])\b/gi, (_match, port) => {
      return `:${String(port).toUpperCase()}`;
    });
    next = next.replace(/\s*-->\s*/g, " --> ");
    next = next.replace(/\s*--\s*/g, " -- ");
    next = next.replace(/\b([A-Za-z][A-Za-z0-9]*)\b/g, (match) => {
      const normalized = match.toLowerCase();
      if (["group", "service", "junction", "in"].includes(normalized))
        return match;
      if (["l", "r", "t", "b"].includes(normalized)) return match;
      const mapped = idMap.get(normalized);
      if (!mapped) return match;
      return mapped;
    });
    return next;
  };
  lines.forEach((line) => {
    const match = line.match(/^\s*(group|service|junction)\s+([^\s(]+)/i);
    if (match?.[2]) {
      const kind = match[1].toLowerCase();
      const raw = match[2];
      const mapped = toId(raw);
      if (kind === "group") {
        groupIds.add(mapped);
      }
      if (kind === "service") {
        const serviceMatch = line.match(
          /^\s*service\s+[^\s(]+(?:\([^)]*\))?(?:\s*\[[^\]]*\])?(?:\s+in\s+([^\s]+))?\s*$/i,
        );
        if (serviceMatch?.[1]) {
          servicesInGroups.add(mapped);
        }
      }
    }
  });
  const updated = lines.map((line) => {
    const normalizedLine = normalizeGroupOrService(line);
    const match = normalizedLine.match(
      /^(\s*(?:group|service|junction)\s+)([^\s(]+)(.*)$/i,
    );
    if (match?.[2]) {
      const prefix = match[1];
      const id = toId(match[2]);
      return replaceIdsInLine(`${prefix}${id}${match[3]}`);
    }
    const replaced = replaceIdsInLine(normalizedLine);
    if (replaced.includes("--")) {
      const edgeMatch = replaced.match(
        /(^|\s)([A-Za-z0-9]+)(\{group\})?\s*:\s*[LRTB]\s*[-<]*--[-*>]*\s*[LRTB]\s*:\s*([A-Za-z0-9]+)(\{group\})?/i,
      );
      if (edgeMatch) {
        const leftId = edgeMatch[2];
        const rightId = edgeMatch[4];
        if (groupIds.has(leftId) || groupIds.has(rightId)) {
          const indent = normalizedLine.match(/^\s*/)?.[0] ?? "";
          return `${indent}%% removed invalid group edge`;
        }
      }
    }
    return replaced;
  });
  return updated.join("\n");
};

export const sanitizeMermaidByType = (
  diagramType: DiagramType,
  code: string,
) => {
  const normalized = normalizeEscapedBr(code);
  if (diagramType === "auto") {
    const trimmed = normalized.trimStart();
    if (trimmed.startsWith("flowchart"))
      return sanitizeFlowchartLabels(normalized);
    if (/^stateDiagram/i.test(trimmed)) return sanitizeArrowSyntax(normalized);
    if (trimmed.startsWith("erDiagram"))
      return sanitizeMermaidByType("er", normalized);
    if (trimmed.startsWith("architecture-beta"))
      return sanitizeArchitectureIds(normalized);
    return normalized;
  }
  if (diagramType === "flowchart") {
    return sanitizeFlowchartLabels(normalized);
  }
  if (diagramType === "architecture") {
    return sanitizeArchitectureIds(normalized);
  }
  if (diagramType === "state") {
    return sanitizeStateLabels(sanitizeArrowSyntax(normalized));
  }
  if (diagramType === "er") {
    const lines = normalized.split(/\r?\n/);
    let inEntity = false;
    const sanitized = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.endsWith("{")) {
        inEntity = true;
        return line;
      }
      if (trimmed.startsWith("}")) {
        inEntity = false;
        return line;
      }
      if (!inEntity) return line;
      const match = line.match(/^(\s*)([A-Za-zА-Яа-я0-9_]+)\s+"([^"]+)"\s*$/);
      if (!match) return line;
      const [, indent, type, rawValue] = match;
      const normalized = rawValue
        .replace(/[:]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[\s-]+/g, "_")
        .replace(/[^A-Za-zА-Яа-я0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
      const attr = normalized || "attr";
      return `${indent}${type} ${attr}`;
    });
    return sanitized.join("\n");
  }
  return normalized;
};

export const formatMermaidErrorLine = (
  errorMessage: string,
  maxLength = 200,
) => {
  const lines = errorMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return lines[0].slice(0, maxLength);
  const first = lines[0].endsWith(":") ? lines[0].slice(0, -1) : lines[0];
  const combined = `${first}: ${lines[1]}`.trim();
  return combined.slice(0, maxLength);
};
