# System Architecture

[← Back to Index](./)

Проект построен как SPA на React 19 с модульной архитектурой.

## Модули

### UI Layer (`/components`)
- **ChatColumn**: История, проекты.
- **EditorColumn**: Редактор (PrismJS).
- **PreviewColumn**: Рендеринг (SVG/Markdown/Whiteboard).

### Logic Layer (`/hooks`)
- **Core**: `useAI`, `useMermaid`.
- **Studio**: `useDiagramStudio` (оркестрация).

### Service Layer (`/services`)
- **Strategies**: Адаптеры для LLM.
- **History**: IndexedDB.
- **Mermaid**: Валидация.

---
[← Back to Index](./) | [Next: Mermaid Core →](internal-mermaid.md)
