# C4 L3 — Components (SPA)

## Основные компоненты UI

- `Header` — настройки подключения (провайдер/ключ/модель), тема.
- `ChatColumn` — история сообщений + выбор типа диаграммы + действия Chat/Build.
- `EditorColumn` — редактор Mermaid-кода + Analyze/Fix/Run.
- `PreviewColumn` — рендер диаграммы и управление превью.

## Основные хуки/слои

- `hooks/studio/useDiagramStudio` — «оркестратор» состояния приложения.
- `hooks/core/useAI` — конфигурация провайдера, подключение, список моделей.
- `hooks/core/useMermaid` — код, статус валидности, асинхронная валидация.
- `hooks/core/useHistory` + `services/history/*` — IndexedDB: Session/TimeStep/DiagramRevision.
- `services/llm/*` — стратегии провайдеров (OpenRouter/Cliproxy).
- `services/docsContextService.ts` — сбор сниппетов документации для промптов.

## Схема взаимодействий

```mermaid
flowchart TD
  UI[UI Components\n(Header/Chat/Editor/Preview)] --> Studio[hooks/studio/useDiagramStudio]
  Studio --> AI[hooks/core/useAI]
  Studio --> Mermaid[hooks/core/useMermaid]
  Studio --> History[hooks/core/useHistory]
  Studio --> Docs[docsContextService]
  Studio --> LLM[llmService]

  LLM --> OR[OpenRouterStrategy]
  LLM --> CP[CliproxyStrategy]

  History --> IDB[(IndexedDB\nservices/history)]
```

---

Обновлено: 2025-12-24. Согласовано с текущей реализацией (markdown-навигация, scroll sync, frontmatter config).
