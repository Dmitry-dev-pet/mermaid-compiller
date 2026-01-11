# Хранение данных

## localStorage

Используются ключи:

- `dc_ai_config` — настройки LLM (провайдер, ключи, endpoint, модель, фильтры).
- `dc_app_state` — состояние UI (тип диаграммы, ширины колонок, тема, язык, fullscreen, notebook-режим).
- `dc_active_session_id` — активная сессия истории.

## IndexedDB

База `dc_history` хранит проекты (сессии), историю шагов и ревизий. Схема описана в `docs/project/history.md`.

Сессия проекта хранит:
- название проекта;
- `updatedAt` для сортировки списка;
- настройки сессии (UI + LLM, опциональные параметры модели).
  - `appState` включает флаги notebook-режима (`isNotebookBuildEnabled`, `notebookBuildCount`).
  - `appState` включает таймаут LLM (`llmTimeoutMs`).

Шаги истории (`TimeStep`) могут хранить UI-метаданные в `step.meta`, например `operationLog` (для операционных логов) и `autoTitle` (для авто-названия проекта после первого Chat).

## Что НЕ хранится

- Секреты LLM не отправляются на сервер приложения и остаются в браузере.
- История чата/шагов хранится локально в IndexedDB.

---

Обновлено: 2026-01-11. Согласовано с текущей реализацией (llmTimeoutMs, operationLog meta, notebook build settings).
