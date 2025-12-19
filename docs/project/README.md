# Полная документация проекта Mermaid Diagram Compiler

Этот набор документов описывает текущее устройство, архитектуру, данные, LLM-интеграцию и эксплуатацию приложения. Документация опирается на реальное поведение кода в `diagram-compiler/` и спецификации в `features/`.

## Содержание

- `docs/project/overview.md` — обзор и ключевые возможности.
- `docs/project/architecture.md` — архитектура и структура модулей.
- `docs/project/setup.md` — установка, запуск, сборка, конфигурация.
- `docs/project/usage.md` — пользовательские сценарии и UX.
- `docs/project/llm.md` — LLM-провайдеры, промпты и контекст документации.
- `docs/project/history.md` — история, TimeStep, ревизии и хранилище.
- `docs/project/data-storage.md` — localStorage и хранение данных.
- `docs/project/mermaid.md` — Mermaid/рендер, валидация, превью, zoom.
- `docs/project/docs-update.md` — обновление Mermaid-доков.
- `docs/project/testing.md` — тесты и линт.
- `docs/project/troubleshooting.md` — типовые проблемы и решения.

## Где что находится

- SPA-приложение: `diagram-compiler/` (React + Vite + TypeScript).
- Локальная Mermaid-документация: `diagram-compiler/public/mermaid-docs`.
- Полный снэпшот документации Mermaid: `mermaid-docs/11.12.2`.
- C4/Memory Bank: `docs/c4/`.
- Спецификации и план: `features/001-mermaid-core/`.

## Версии

- Версия Mermaid, используемая в UI и валидации: см. `diagram-compiler/constants.ts` (`MERMAID_VERSION`).
