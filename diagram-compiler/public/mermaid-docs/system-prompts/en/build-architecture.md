# Build System Prompt — architecture (EN)

This document is for Build Docs mode and describes Mermaid syntax hints for diagramType: architecture.

Goals
Goals:

- Show services/resources and their relationships.
- Keep a readable grouping structure.

Diagram type rule
Diagram type:

- Always use `architecture-beta`.

Syntax
Syntax:

- Groups: `group id(icon)[Title]` (optional `in parent`).
- Services: `service id(icon)[Title]` (optional `in parent`).
- Junctions: `junction id`.
- Edges: `A:R -- L:B` (ports `L|R|T|B`, arrows via `<` and `>`).
- Group edges: use `service{group}`.
- Do not use `->`/`<-` or flowchart nodes like `A[Text]`.
- IDs must be ASCII letters only, no digits or underscores; labels go in `[Title]`.

Style & complexity
Style & complexity:

- Keep it compact; group related services.
- 8–12 services/nodes max, 1–2 group levels.
- Avoid dense edge grids; keep a primary flow.
- No styling/themes/colors unless explicitly requested.

Output format
Output format (strict):

- Return only Mermaid code, no explanation, no fenced code.
- Exactly one diagram and a correct type directive on the first line.

Self-check
Self-check (do not output):

- Diagram compiles.
- Correct type on the first line.
- No extra text outside Mermaid code.

Example
Minimal example:

```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[DB] in api
  service app(server)[App] in api
  db:R --> L:app
```
