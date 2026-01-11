# C4 L3 — Components (SPA)

## Основные компоненты UI

- `Header` — настройки подключения (провайдер/ключ/модель), тема.
- `ChatColumn` — история сообщений + выбор типа диаграммы + действия Chat/Build.
- `EditorColumn` — редактор Mermaid-кода + Analyze/Fix/Run.
- `PreviewColumn` — рендер диаграммы и управление превью.
- `components/chat/ChatOperationLog` — операционные логи (Plan/Diagrams), тайминги и подсказки контекста.

## Основные хуки/слои

- `hooks/studio/useDiagramStudio` — «оркестратор» состояния приложения.
- `hooks/studio/useNotebookBuild` — сборка Markdown notebook (planner + последовательные build).
- `hooks/studio/useOperationLog` — сбор/гидрация и работа с operation logs.
- `hooks/studio/runStudioOperation` — обертка для операций (Chat/Build/Fix/Analyze) с логированием, таймаутами и итогами.
- `hooks/core/useAI` — конфигурация провайдера, подключение, список моделей.
- `hooks/core/useMermaid` — код, статус валидности, асинхронная валидация.
- `hooks/core/useHistory` + `services/history/*` — IndexedDB: Session/TimeStep/DiagramRevision.
- `services/llm/*` — стратегии провайдеров (OpenRouter/Cliproxy).
- `services/docsContextService.ts` — сбор сниппетов документации для промптов.
- `services/llmRequestRunner.ts` — таймауты/повторы запросов LLM.
- `services/notebookPlanService.ts` + `services/notebookPlanSchema.ts` — парсинг и валидация `NotebookPlan`.

## Схема взаимодействий

```mermaid
flowchart TD
  UI[UI Components\n(Header/Chat/Editor/Preview)] --> Studio[hooks/studio/useDiagramStudio]
  Studio --> AI[hooks/core/useAI]
  Studio --> Mermaid[hooks/core/useMermaid]
  Studio --> History[hooks/core/useHistory]
  Studio --> Docs[docsContextService]
  Studio --> LLM[llmService]
  Studio --> NB[useNotebookBuild]
  Studio --> Runner[llmRequestRunner]

  LLM --> OR[OpenRouterStrategy]
  LLM --> CP[CliproxyStrategy]

  History --> IDB[(IndexedDB\nservices/history)]
```

---

Обновлено: 2026-01-11. Согласовано с текущей реализацией (operation logs, notebook build, timeout UI).
