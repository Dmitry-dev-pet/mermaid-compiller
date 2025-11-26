Представляем, что `specify-cli` уже установлен и доступен агенту.

1) Фаза constitution (`/speckit.constitution`)
- Цель: зафиксировать принципы проекта mermaid-langgraph.
- Файл: `memory/constitution.md`.
- Содержимое по сути:
  - Purpose: сервис, который по prompt → выдаёт валидный Mermaid с авто-валидацией и авто-фиксом.
  - Принципы: correctness first, минимальный API (`POST /api/diagram/iterate`), строгая валидация через Mermaid engine, spec-driven изменения.
  - Нон-цели v1: аккаунты, сложный персистентный стор, коллаборативность.

2) Фаза спецификации (`/speckit.specify`)
- Цель: описать, ЧТО мы строим, в продуктовых терминах.
- Файл: `features/001-mermaid-core/spec.md`.
- Структура:
  - Summary: «LLM‑сервис, преобразующий текстовый запрос в валидную диаграмму Mermaid с итерациями».
  - Problem/Motivation: боль ручного набора/отладки Mermaid.
  - Personas: разработчик, архитектор (PM — вторичный).
  - User stories: "сгенерировать новую диаграмму", "уточнить существующую", "увидеть статус валидации", "скачать .mmd".
  - Core flows: A) первая генерация, B) рефайн.
  - API summary: POST `/api/diagram/iterate` с `{prompt, baseDiagram?, maxFixAttempts?}` → `{diagram, valid, errors, attempts}`.

3) Фаза планирования (`/speckit.plan`)
- Цель: зафиксировать КАК мы будем это реализовывать технически.
- Файл: `features/001-mermaid-core/plan.md`.
- Ключевые разделы:
  - Tech stack: backend Python + LangGraph/LangChain, HTTP (FastAPI), LLM через OpenAI‑совместимый endpoint, Mermaid validation через JS/CLI, фронт на простой SPA с mermaid.js.
  - Архитектура: слои `api` → `orchestrator` (LangGraph) → `llm_client` + `MermaidValidator` (+ optional `storage`).
  - Модель состояния `DiagramState` (prompt, mermaid, is_valid, errors, attempts, max_attempts).
  - Control flow: generate → validate → fix‑loop до лимита.
  - Prompts: строгие промпты для генерации и фикса (только Mermaid, без ``` и пояснений).
  - Validation strategy: интерфейс `MermaidValidator`, дефолтная реализация через официальный Mermaid engine.

4) Фаза задач (`/speckit.tasks`)
- Цель: разбить план на конкретные шаги.
- Файл: `features/001-mermaid-core/tasks.md`.
- Группы задач:
  - Backend: структура проекта, реализация `MermaidValidator`, `llm_client`, LangGraph‑графа, HTTP‑эндпоинта, тестов.
  - Frontend: экран редактора (prompt + baseDiagram + превью + статус), вызов `/api/diagram/iterate`, рендер Mermaid, скачивание `.mmd`.
  - Tooling: конфиг (LLM, validator, max attempts), локальные команды (run, test).

5) Как использовать это дальше
- После подтверждения этой спецификации можно буквально создать указанные файлы (`memory/constitution.md`, `features/001-mermaid-core/spec.md`, `plan.md`, `tasks.md`) и заполнить их содержимым по описанной структуре — это будет «реальная» spec-kit‑совместимая спецификация, от которой уже можно двигаться к реализации.