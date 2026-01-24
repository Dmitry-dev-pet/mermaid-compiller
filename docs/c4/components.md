# C4 L3 — Components (SPA)

## UI-компоненты (верхний уровень)

- `Header` — настройки подключения (provider/key/model), тема, статус.
- `components/header/*` — подменю шапки (AI control plane, theme menu).
- `ChatColumn` — история сообщений + Chat/Build + управление проектами.
- `components/chat/ChatMessageList` — список сообщений + привязанные operation logs.
- `components/chat/ChatSummaryCard` — summary/intent карточка.
- `components/chat/ProjectsMenu` — меню проектов (sort/rename/delete/continue/preview).
- `components/chat/DiagramTypePicker` — выбор типа/набора типов и параметров notebook N.
- `EditorColumn` — редактор Mermaid + Analyze/Fix/Snapshot + Build Docs + вкладки markdown.
- `PreviewColumn` — SVG/Markdown preview, zoom/pan/fit, whiteboard/ED.
- `components/preview/PreviewSurface` + `components/preview/surfaces/*` — surfaces превью по режимам.
- `components/chat/ChatOperationLog` — рендер operation logs по view-model.
- `components/ui/*` — единые UI‑примитивы (Button/Tab/Input/Select/PanelHeader).

## Хуки и подсистемы

### Оркестрация (studio)

- `hooks/studio/useDiagramStudio` — центральный orchestrator состояния.
- `hooks/studio/useStudioTabs` — editor tab + build docs scope.
- `hooks/studio/useStudioHydration` — гидрация состояния из history.
- `hooks/studio/useStudioChatContext` — активный chat context (main vs block).
- `hooks/studio/useStudioChatFlow` — выполнение Chat/Build с учётом diagram context.
- `hooks/studio/useStudioWhiteboard` — загрузка/сохранение whiteboard (bundle per markdown block).
- `hooks/studio/runStudioOperation` — wrapper для Chat/Build/Fix/Analyze.
- `hooks/studio/useNotebookBuild` — planner + последовательный build блоков notebook.
- `hooks/studio/useFixFlow` — auto-fix Mermaid.
- `hooks/studio/useOperationLog` — сбор/гидрация operation logs.
- `hooks/studio/useProjects` — управление сессиями.

### Preview subsystem

- `hooks/preview/useMermaidSvgRender` — Mermaid → SVG (single diagram).
- `hooks/preview/useSvgPanZoom` — pan/zoom/fit для SVG.
- `hooks/preview/useMermaidCodeBlockRenderer` — Mermaid‑блоки внутри Markdown/Build Docs.
- `hooks/preview/useMarkdownPreview` — markdown → HTML.
- `hooks/preview/useMarkdownPreviewMeta` — derived state (theme/look/direction/flowchart styles).
- `hooks/preview/usePreviewScrollSync` — scroll sync между Editor и Preview.
- `hooks/preview/usePreviewContentMode` — выбор режима/поверхности превью.
- `hooks/preview/usePreviewHeaderModel` — модель хедера превью.
- `hooks/preview/usePreviewWhiteboard` — whiteboard/ED режимы, темы, авто‑sync.
- `hooks/preview/useBuildDocsPreview` — превью Build Docs/Prompts.

### Core hooks

- `hooks/core/useAI` — подключение к LLM, модели, provider.
- `hooks/core/useMermaid` — Mermaid код + async validation.
- `hooks/core/useHistory` — IndexedDB (Session/TimeStep/DiagramRevision).
- `hooks/core/useChat` — сообщения.
- `hooks/core/useLayout` — theme/size/fullscreen.

### Services

- `services/llm/*` — стратегии OpenRouter/Cliproxy.
- `services/llmRequestRunner.ts` — таймауты/повторы.
- `services/mermaidService.ts` + `services/mermaid/*` — parsing/validate/sanitize.
- `services/docsContextService.ts` — build docs context from local docs.
- `services/history/*` — IndexedDB.
- `services/notebookPlanService.ts` — `NotebookPlan` parsing/validation.

## Схема взаимодействий

```mermaid
flowchart LR
  UI["UI Components<br/>(Header/Chat/Editor/Preview)"] --> Studio[hooks/studio/useDiagramStudio]
  Studio --> AI[hooks/core/useAI]
  Studio --> Mermaid[hooks/core/useMermaid]
  Studio --> History[hooks/core/useHistory]
  Studio --> Docs[docsContextService]
  Studio --> LLM[llmService]
  Studio --> NB[useNotebookBuild]
  Studio --> Runner[llmRequestRunner]

  Preview[PreviewColumn] --> PreviewHooks[hooks/preview/*]
  PreviewHooks --> MermaidRender[useMermaidSvgRender]
  PreviewHooks --> PanZoom[useSvgPanZoom]
  PreviewHooks --> Whiteboard[usePreviewWhiteboard]

  LLM --> OR[OpenRouterStrategy]
  LLM --> CP[CliproxyStrategy]

  History --> IDB[(IndexedDB<br/>services/history)]
```

---

Обновлено: 2026-01-23. Согласовано с текущей реализацией (preview surfaces/hooks, studio subhooks, chat refactor).
