# Полная документация проекта Mermaid Diagram Compiler

Этот набор документов описывает текущее устройство, архитектуру, данные, LLM-интеграцию и эксплуатацию приложения.

## Содержание

- `docs/project/overview.md` — обзор и ключевые возможности.
- `docs/project/architecture.md` — архитектура и структура модулей.
- `docs/project/setup.md` — установка, запуск, сборка, конфигурация.
- `docs/project/usage.md` — пользовательские сценарии и UX.
- `docs/project/llm.md` — LLM-провайдеры, промпты и контекст документации.
- `docs/project/desktop-agent.md` — Desktop Agent и интеграция с CLIProxyAPI.
- `docs/project/history.md` — история, TimeStep, ревизии и хранилище.
- `docs/project/data-storage.md` — localStorage и хранение данных.
- `docs/project/mermaid.md` — Mermaid/рендер, валидация, превью, zoom.

## Где что находится

- SPA-приложение: `diagram-compiler/` (React + Vite + TypeScript).
- Desktop Agent: `agent/` (Tauri + Rust).

---

Обновлено: 2026-01-29. Добавлены Desktop Agent и Cliproxy.
