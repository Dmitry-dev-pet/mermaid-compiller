export const detectDiagramType = (code) => {
  if (!code || typeof code !== "string") return "auto";
  const trimmed = code.trim();
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  // Handle specific cases like 'flowchart' vs 'graph'
  if (firstWord === "graph") return "flowchart";
  // Handle cases with hyphens like 'stateDiagram-v2'
  // Basically, we trust the first token as the type, stripped of special chars if needed
  // but Mermaid types are usually clean.
  return firstWord || "auto";
};
