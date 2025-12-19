# C4 L3 — Components (SPA)

## Основные компоненты UI

- `Header` — настройки подключения (провайдер/ключ/модель), тема.
- `ChatColumn` — история сообщений + выбор типа диаграммы + действия Chat/Build.
- `EditorColumn` — редактор Mermaid-кода + Analyze/Fix/Run.
- `PreviewColumn` — рендер диаграммы и управление превью.

## Основные хуки/слои

- `useDiagramStudio` — «оркестратор» состояния приложения.
- `useAI` — конфигурация провайдера, подключение, список моделей.
- `useMermaid` — код, статус валидности, асинхронная валидация.
- `useHistory` + `services/history/*` — IndexedDB: Session/TimeStep/DiagramRevision.
- `services/llm/*` — стратегии провайдеров (OpenRouter/Cliproxy).
- `services/docsContextService.ts` — сбор сниппетов документации для промптов.

## Схема взаимодействий

```mermaid
flowchart TD
  UI[UI Components\n(Header/Chat/Editor/Preview)] --> Studio[useDiagramStudio]
  Studio --> AI[useAI]
  Studio --> Mermaid[useMermaid]
  Studio --> History[useHistory]
  Studio --> Docs[docsContextService]
  Studio --> LLM[llmService]

  LLM --> OR[OpenRouterStrategy]
  LLM --> CP[CliproxyStrategy]

  History --> IDB[(IndexedDB\nservices/history)]
```
