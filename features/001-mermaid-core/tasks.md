# Tasks

- [x] Define session (project) data model and persistence rules in IndexedDB.
- [x] Implement session storage service (create/list/load/delete/rename).
- [x] Add session orchestration in `useDiagramStudio`/`useProjects` (load, autosave).
- [x] Add chat panel UI for session list and actions (continue/delete/new/rename).
- [x] Persist session settings and optional model parameters.
- [x] Validate resume/delete flows with existing history and settings.
- [x] Add Markdown fix mode to sequentially fix all invalid blocks via the existing Fix button.
- [x] Stop on first failure and record a history step per block.
- [x] Remove delete confirmation and add Undo for project deletion.
- [x] Add chat toggle `MD notebook` and optional `N` input (user-provided `N` has priority over planner).
- [x] Add planner step that returns structured `NotebookPlan` (with `glossary` + independent `buildPrompt` per diagram).
- [x] Create markdown notebook skeleton with `N` Mermaid blocks and set markdown notebook mode on Build.
- [x] Sequentially build each block with relevant docs via diagramType switching (variant B) + await docs load.
- [x] For each diagram: up to 3 attempts (build + validate + auto-fix); on 3 failures continue to next block.
- [x] Restore original `diagramType` after notebook pipeline completes.
- [x] Record progress messages and history meta per block (notebook mode, block index, diagram type).
- [x] Зафиксировать в плане/интенте ограничение: без theme/look директив и разноцветных оформлений.
- [x] Добавить per-block чат для notebook: `chat.md` из Build Docs и raw intent из плана; сохранять и восстанавливать из IndexedDB; retries как отдельные сообщения.
- [x] Разделить Build Docs на две панели (docs + intent) с ресайзером и плейсхолдером.
- [x] Унифицировать UI-контролы (Button/Tab/Input/Select/Radio) и выровнять хедеры.

---

Обновлено: 2026-01-22.
