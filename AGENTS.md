# AGENT GUIDELINES for mermaid-langgraph

## Spec-first workflow

- Before making **any code or configuration changes** in this repository, the agent **must first read and respect** the following specification files:
  - `docs/constitution.md`
  - `features/001-mermaid-core/spec.md`
  - `features/001-mermaid-core/plan.md`
  - `features/001-mermaid-core/tasks.md`
- Treat these files as the **single source of truth** for project principles, feature requirements, implementation plan and task breakdown.
- If planned work не укладывается в текущую спецификацию, сначала обновить/уточнить спецификацию (по запросу пользователя), а уже потом менять код.

## Точка входа (TL;DR для агента)

- Основное SPA приложение находится в `diagram-compiler/`.
- Полная русская документация проекта: `docs/project/README.md`.
- Архитектура C4/Memory Bank: `docs/c4/README.md`.
- Подмножество Mermaid-доков для контекста LLM: `diagram-compiler/public/mermaid-docs/`.
- Полный снэпшот Mermaid-доков: `mermaid-docs/<version>/` (актуальная версия в `diagram-compiler/constants.ts`).

## Ключевые места в коде

- Оркестрация UI/логики: `diagram-compiler/hooks/useDiagramStudio.ts`.
- История и ревизии (IndexedDB): `diagram-compiler/services/history/*`.
- LLM стратегии и промпты: `diagram-compiler/services/llm/*`.
- Контекст документации: `diagram-compiler/services/docsContextService.ts`.
- Mermaid валидация: `diagram-compiler/services/mermaidService.ts`.
- Превью/рендер/zoom: `diagram-compiler/components/PreviewColumn.tsx`.

## Команды

- Dev: `npm run dev` (или `npm --prefix diagram-compiler run dev`).
- Build: `npm run build`.
- Тесты: `npm test` (обязательно запускать после изменений).

## Documentation

- Не создавать и не изменять дополнительную документацию (README, docs и т.п.), если пользователь явно не запросил этого.
