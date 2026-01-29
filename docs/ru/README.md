# Mermaid Diagram Compiler — Документация

Этот набор документов описывает установку/запуск Mermaid Diagram Compiler, интеграции с ИИ/прокси и внутреннее устройство приложения.

## Содержание

- **Начало**
  - `index.md` — индекс документации
  - `setup-web.md` — веб-версия
  - `setup-desktop.md` — desktop-версия (Mermaid Agent)
- **Гайды**
  - `guide-basic.md` — Chat / Build / Fix
  - `guide-notebooks.md` — notebooks и planner pipeline
  - `guide-whiteboard.md` — whiteboard / Excalidraw
  - `guide-export.md` — экспорт и шеринг
  - `guide-troubleshooting.md` — troubleshooting
- **ИИ**
  - `ai-overview.md` — обзор стратегий
  - `ai-cliproxy.md` — интеграция CLIProxyAPI
  - `ai-agent.md` — локальный Mermaid Agent
  - `ai-prompts.md` — промпты и контекст
- **Хранение**
  - `storage-local.md` — локально (IndexedDB/History)
  - `storage-sync.md` — cloud sync и E2EE
- **Внутренности**
  - `internal-architecture.md` — архитектура
  - `internal-mermaid.md` — Mermaid validation/rendering
  - `internal-testing.md` — тесты/линт/typecheck
  - `internal-docs-update.md` — обновление Mermaid-документации

## Где что находится в коде

- SPA: `diagram-compiler/` (React + Vite + TypeScript)
- Desktop agent: `agent/` (Tauri + Rust)

---

Обновлено: 2026-01-29.
