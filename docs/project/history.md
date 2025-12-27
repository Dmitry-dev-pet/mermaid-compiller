# История, шаги и ревизии

История хранится локально в IndexedDB, база `dc_history`.

## Сущности

- **HistorySession** — проект (сессия пользователя).
- **TimeStep** — шаг истории (любой экшен).
- **DiagramRevision** — ревизия Mermaid-кода.

Сессия включает метаданные проекта:
- `title` — название проекта.
- `updatedAt` — время последнего изменения (для сортировки списка).
- `settings` — настройки сессии (UI + LLM, опциональные параметры модели).

## Типы шагов

`TimeStepType`:
- `seed`, `manual_edit`, `chat`, `build`, `fix`, `analyze`, `recompile`, `system`.

`manual_edit` используется только для **Snapshot** (ручной фиксации). Обычные ручные правки обновляют текущую ревизию без создания нового шага.

## Правило «одна диаграмма на шаг»

- Каждый шаг содержит `currentRevisionId`.
- Ревизия создается только если диаграмма реально меняется.
- Если шаг не меняет диаграмму, берется предыдущая ревизия.

## Схема IndexedDB

База: `dc_history` (версия 2).

Объекты:
- `sessions`: ключ `id`, индексы `byCreatedAt`, `byUpdatedAt`.
- `steps`: ключ `id`, индексы `bySessionId`, `bySessionIndex`, `bySessionCreatedAt`.
- `revisions`: ключ `id`, индексы `bySessionId`, `byCreatedByStepId`, `bySessionCreatedAt`.

## Связь с UI

- В панели чата отображается список проектов (HistorySession).
- Метки «Diagram renders» показывают шаги, где изменилась ревизия.
- При клике на метку выполняется переход к связанному сообщению и переключение ревизии.
- В режиме notebook шаги `build` содержат метаданные блока (`blockIndex`, `diagramType`, `success`).

---

Обновлено: 2025-12-27. Согласовано с текущей реализацией (notebook build meta, LLM timeouts).
