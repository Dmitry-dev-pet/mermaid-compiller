# Архитектура

Mermaid Diagram Compiler — SPA в `diagram-compiler/`, собранная на React 19 + Vite. Архитектура построена вокруг набора хуков (состояние/процессы) и сервисов (LLM, Mermaid, история). Компоненты остаются максимально презентационными, вся логика выносится в хуки.

## Быстрая карта папок

- `diagram-compiler/components/` — UI-компоненты и layout.
- `diagram-compiler/hooks/` — состояние и orchestration.
  - `hooks/core/` — базовые состояния (AI, Mermaid, layout, history, chat).
  - `hooks/editor/` — вкладки/Build Docs, редакторские сценарии.
  - `hooks/preview/` — рендер/zoom/markdown/whiteboard (Preview).
  - `hooks/studio/` — оркестрация (Chat/Build/Fix/Analyze/Notebook, projects, logs).
- `diagram-compiler/services/` — LLM, Mermaid-валидация, docs context, history/IndexedDB.
- `diagram-compiler/utils/` — парсеры/нормализация, small helpers.
- `docs/c4/` — C4: контекст/контейнеры/компоненты/данные.

## Слои и ответственность

### UI-компоненты

- `Header` — провайдер/ключи/модель, тема, статус подключения.
- `ChatColumn` — сообщения, выбор типа диаграммы, Chat/Build, проекты.
- `EditorColumn` — код Mermaid, Analyze/Fix/Snapshot, Build Docs и вкладки markdown-блоков.
- `PreviewColumn` — превью: SVG, markdown, notebook-ED, whiteboard, zoom/pan/fit.
- `components/ui/*` — единые примитивы (Button/Tab/Input/Select/PanelHeader).

Компоненты получают готовые данные и callbacks из хуков; сами не держат “умную” логику.

### Хуки (state + процессы)

#### Core (`hooks/core/`)

- `useAI` — подключение, список моделей, настройки LLM.
- `useMermaid` — Mermaid код + async validation (`mermaid.parse`).
- `useChat` — сообщения и генерация id.
- `useHistory` — IndexedDB: шаги и ревизии диаграмм.
- `useLayout` — размер колонок, темы, fullscreen.

#### Editor (`hooks/editor/`)

- `useEditorTabs` — вкладки Mermaid/Markdown/Build Docs.
- `useBuildDocsContent` — формирование Build Docs текста и табов.

#### Preview (`hooks/preview/`)

- `useMermaidSvgRender` — рендер Mermaid в SVG для single-diagram preview.
- `useSvgPanZoom` — pan/zoom/fit для SVG.
- `useMermaidCodeBlockRenderer` — рендер Mermaid-блоков внутри Markdown и Build Docs.
- `useMarkdownPreview` — markdown to HTML + renderer.
- `useMarkdownPreviewMeta` — derived state для inline-параметров (theme/look/direction/flowchart styles).
- `usePreviewScrollSync` — scroll sync между Editor и Preview.
- `usePreviewWhiteboard` — whiteboard/Excalidraw, notebook-ED, персистенс тем/фона.
- `useBuildDocsPreview` — выбор активного “Prompt” документа и HTML превью.

#### Studio (`hooks/studio/`)

- `useDiagramStudio` — центральная оркестрация состояния и действий.
- `runStudioOperation` — единый wrapper для Chat/Build/Fix/Analyze (операции, логи, history).
- `useNotebookBuild` — planner + build блоков Markdown notebook.
- `useFixFlow` — автопоправка Mermaid.
- `useOperationLog` — сбор/гидрация operation logs.
- `useProjects` — проекты/сессии (создание/удаление/переименование).

### Сервисы

- `services/llm/*` — стратегии провайдера (OpenRouter, Cliproxy).
- `services/llmRequestRunner.ts` — таймауты/повторы запросов LLM.
- `services/mermaidService.ts` + `services/mermaid/*` — валидация, парсинг, sanitize.
- `services/docsContextService.ts` — загрузка локальных Mermaid Docs + сбор контекста.
- `services/history/*` — IndexedDB (Session/TimeStep/DiagramRevision).
- `services/notebookPlanService.ts` + `notebookPlanSchema.ts` — JSON план notebook.

## Основные потоки

### Chat

1. Пользователь вводит текст и нажимает Chat.
2. `runStudioOperation` создаёт operation log и шаг истории.
3. `createStudioOperationRunner` вызывает LLM `chat`.
4. Ответ сохраняется как intent в историю, Mermaid код не меняется.

### Build (single diagram)

1. Формируется intent (из prompt/истории/Chat).
2. Сбор docs context (`docsContextService`), формирование system prompt.
3. LLM `generateDiagram` → parse/clean → `validateMermaid`.
4. При ошибках: auto-fix до `AUTO_FIX_MAX_ATTEMPTS`.
5. Запись в history + ревизия диаграммы.

### Build (Markdown notebook)

1. Planner LLM возвращает `NotebookPlan` (types/prompts/glossary).
2. Генерация markdown-скелета с `N` блоками.
3. Для каждого блока:
   - временно переключается `diagramType` для релевантных docs,
   - build + validate + auto-fix (до 3 попыток),
   - сохранение block-step в history + пер-block сообщения.
4. Восстановление исходного `diagramType`.

### Fix

1. LLM `fixDiagram` получает код + ошибку.
2. Повтор авто-фикса до лимита.
3. Новая ревизия создаётся, если код изменился.

### Analyze

1. Отправка текущего кода в LLM.
2. Ответ добавляется в чат (код не меняется).

### Snapshot (Manual edit)

1. Пользователь нажимает Snapshot.
2. Создаётся шаг `manual_edit` + ревизия.

## Preview subsystem (детально)

### Single-diagram SVG

- `useMermaidSvgRender`:
  - проверяет валидность Mermaid,
  - рендерит SVG через `mermaid.render`,
  - собирает `bindFunctions` для интерактивных ссылок.
- `useSvgPanZoom`:
  - инициализирует `svg-pan-zoom`,
  - поддерживает zoom/pan/fit/scroll.

### Markdown preview

- `useMarkdownPreview` создаёт HTML из markdown.
- `useMermaidCodeBlockRenderer` заменяет fenced-code Mermaid на SVG-блоки.
- `usePreviewScrollSync` связывает прокрутку Preview/Editor.

### Whiteboard/Excalidraw

- `usePreviewWhiteboard` управляет:
  - режимом whiteboard,
  - режимом notebook ED,
  - темой/фоном canvas (per diagram key),
  - авто-синхронизацией Mermaid → Excalidraw.

## Operation logs

- `useOperationLog` хранит operation events по шагам.
- `operationLogViewModelBuilder` собирает view-model (sections, badges, тайминг).
- `operationLogContextRowUtils` извлекает type-badges, даже если LLM вернул нетипичный текст.
- Логи включают:
  - стадии (Plan/Diagrams),
  - контекст (messages/docs) через tooltips,
  - статусы блоков и попыток.

## Источник правды состояния

- Mermaid код: `hooks/core/useMermaid`.
- UI/Theme/Layout: `hooks/core/useLayout`.
- LLM/connection: `hooks/core/useAI`.
- История: `hooks/core/useHistory`.
- Проекты: `hooks/studio/useProjects`.

---

Обновлено: 2026-01-22. Согласовано с текущей реализацией (preview hooks, whiteboard, operation logs).
