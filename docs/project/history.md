# История, шаги и ревизии

История хранится локально в IndexedDB, база `dc_history`.

## Сущности

- **HistorySession** — сессия пользователя.
- **TimeStep** — шаг истории (любой экшен).
- **DiagramRevision** — ревизия Mermaid-кода.

## Типы шагов

`TimeStepType`:
- `seed`, `manual_edit`, `chat`, `build`, `fix`, `analyze`, `recompile`, `system`.

`manual_edit` используется только для **Snapshot** (ручной фиксации). Обычные ручные правки обновляют текущую ревизию без создания нового шага.

## Правило «одна диаграмма на шаг»

- Каждый шаг содержит `currentRevisionId`.
- Ревизия создается только если диаграмма реально меняется.
- Если шаг не меняет диаграмму, берется предыдущая ревизия.

## Схема IndexedDB

База: `dc_history` (версия 1).

Объекты:
- `sessions`: ключ `id`, индекс `byCreatedAt`.
- `steps`: ключ `id`, индексы `bySessionId`, `bySessionIndex`, `bySessionCreatedAt`.
- `revisions`: ключ `id`, индексы `bySessionId`, `byCreatedByStepId`, `bySessionCreatedAt`.

## Связь с UI

- Метки «Diagram renders» показывают шаги, где изменилась ревизия.
- При клике на метку выполняется переход к связанному сообщению и переключение ревизии.

---

Обновлено: 2025-12-24. Согласовано с текущей реализацией (markdown-навигация, scroll sync, frontmatter config).
