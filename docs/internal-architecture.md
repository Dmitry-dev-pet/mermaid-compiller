# System Architecture

[← Back to Index](./)

The project is a React SPA (React 19) with a modular architecture.

## Modules

### UI Layer (`/components`)
- **ChatColumn**: chat history, projects.
- **EditorColumn**: editor (PrismJS).
- **PreviewColumn**: rendering (SVG / Markdown / Whiteboard).

### Logic Layer (`/hooks`)
- **Core**: `useAI`, `useMermaid`.
- **Studio**: `useDiagramStudio` (orchestration).

### Service Layer (`/services`)
- **Strategies**: LLM adapters.
- **History**: IndexedDB.
- **Mermaid**: validation.

---
[← Back to Index](./) | [Next: Mermaid Core →](internal-mermaid.md)
