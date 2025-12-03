export const detectDiagramType = (code) => {
  if (!code || typeof code !== "string") return "auto";

  // Known Mermaid types. Order matters for overlapping names (e.g., stateDiagram-v2 vs stateDiagram).
  // Longer names first.
  const knownTypes = [
    "stateDiagram-v2", "stateDiagram", 
    "flowchart", "graph",
    "sequenceDiagram", "classDiagram", "erDiagram", 
    "gantt", "mindmap", "pie", "gitGraph", "userJourney", "journey", 
    "timeline", "zenuml", "sankey-beta", "sankey", 
    "xyChart-beta", "xyChart", "block-beta", "block",
    "quadrantChart", "requirementDiagram",
    "packet-beta", "packet", "radar-beta", "radar",
    "treemap-beta", "treemap", "kanban", "architecture-beta", "architecture", "c4Context"
  ];

  // Regex to find a type keyword at the start of a line (ignoring leading whitespace)
  // The 'm' flag makes ^ match the start of each line.
  // We escape special regex chars in types if any (none currently, but good practice)
  const typesPattern = knownTypes.join("|");
  const regex = new RegExp(`^\\s*(${typesPattern})\\b`, "im");

  const match = code.match(regex);

  if (match) {
    let type = match[1].toLowerCase();
    console.log(`[Utils] Detected type '${type}' via regex match: '${match[0]}'`);

    // Normalization
    if (type === "graph") return "flowchart";
    if (type === "userjourney") return "journey";
    if (type === "c4context") return "c4";
    
    // Strip beta/v2 suffixes for cleaner doc mapping
    type = type.replace(/-beta$/i, "").replace(/-v2$/i, "");
    
    return type;
  }

  console.warn("[Utils] Could not detect diagram type via regex, returning auto");
  return "auto";
};

