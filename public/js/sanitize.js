const replacements = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ß": "ss",
  "°": "",
  "¶": "",
  "§": "",
  " ": " ",
  "“": '"',
  "”": '"',
  "„": '"',
  "’": "'",
  "‘": "'",
  "`": "'",
};

export const sanitizeMermaidCode = (code) => {
  if (!code || typeof code !== "string") return "";

  let working = code;
  Object.entries(replacements).forEach(([key, value]) => {
    working = working.split(key).join(value);
  });

  const nonAsciiRegex = new RegExp("[\\u0080-\\uFFFF]+", "g");
  working = working.replace(nonAsciiRegex, (segment) => {
    const normalizedSegment = segment.normalize ? segment.normalize("NFKC") : segment;
    return normalizedSegment;
  });

  const normalized = typeof working.normalize === "function" ? working.normalize("NFKC") : working;
  let sanitized = "";

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (replacements[ch]) {
      sanitized += replacements[ch];
      continue;
    }
    if (ch === "\n" || ch === "\r" || ch === "\t") {
      sanitized += ch;
      continue;
    }
    const charCode = ch.charCodeAt(0);
    const isAscii = charCode >= 32 && charCode <= 126;
    const isCyrillic = charCode >= 0x0400 && charCode <= 0x04ff;
    sanitized += isAscii || isCyrillic ? ch : " ";
  }

  const colorTokenRegex = /((?:stroke|fill|color|background|fontColor|textColor)\s*:\s*)([^,;\s]+)/gi;
  sanitized = sanitized.replace(colorTokenRegex, (full, prefix, value) => {
    const trimmed = value.trim();
    if (/^#?[0-9a-f]{3,6}$/i.test(trimmed)) {
      return `${prefix}${trimmed.startsWith("#") ? trimmed : `#${trimmed}`}`;
    }

    let hexCandidate = trimmed.replace(/[^0-9a-f]/gi, "");
    if (hexCandidate.length > 6) {
      hexCandidate = hexCandidate.slice(-6);
    }
    if (hexCandidate.length === 3 || hexCandidate.length === 6) {
      return `${prefix}#${hexCandidate}`;
    }

    return `${prefix}${value}`;
  });

  return sanitized;
};

const runSanitizeSmokeTest = () => {
  const sample = "color:ﬂ°455a64¶ß";
  const sanitized = sanitizeMermaidCode(sample);
  if (!/color:\s*#455a64/.test(sanitized) && typeof console !== "undefined") {
    console.warn("sanitizeMermaidCode ligature repair failed", { sample, sanitized });
  }

  const hexSample = "color:ﬂ°°424242¶ß";
  const hexSanitized = sanitizeMermaidCode(hexSample);
  if (!/color:\s*#424242/.test(hexSanitized) && typeof console !== "undefined") {
    console.warn("sanitizeMermaidCode hex repair failed", { hexSample, hexSanitized });
  }

  const namedSample = "color:red";
  const namedSanitized = sanitizeMermaidCode(namedSample);
  if (!/color:\s*red/.test(namedSanitized) && typeof console !== "undefined") {
    console.warn("sanitizeMermaidCode named color regression", { namedSample, namedSanitized });
  }

  const overflowSample = "color:ﬂ°°111827¶ß";
  const overflowSanitized = sanitizeMermaidCode(overflowSample);
  if (!/color:\s*#111827/.test(overflowSanitized) && typeof console !== "undefined") {
    console.warn("sanitizeMermaidCode overflow hex repair failed", { overflowSample, overflowSanitized });
  }
};

runSanitizeSmokeTest();
