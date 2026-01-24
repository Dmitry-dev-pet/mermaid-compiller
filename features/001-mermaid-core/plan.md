# Plan

Статус: выполнено (база) + активный рефакторинг/поддержка.

1. [x] Describe the session data model and persistence in IndexedDB.
2. [x] Add session storage layer (create/list/load/delete) alongside existing history services.
3. [x] Integrate session lifecycle into studio orchestration (load/save on change).
4. [x] Add chat panel UI for sessions (list + actions).
5. [x] Ensure session settings include all per-session parameters (model params optional).
6. [x] Verify resume/delete flows and persistence across reloads.
7. [x] Add Markdown fix mode that sequentially fixes all invalid blocks.
8. [x] Stop on first failed block and record a history step per block.
9. [x] Switch project deletion to no-confirm with Undo.
10. [x] Define `NotebookPlan` JSON schema + planner prompts.
11. [x] Add chat toggle `MD notebook` and optional `N` input.
12. [x] Implement notebook pipeline: planner → markdown skeleton → sequential builds.
13. [x] Per-block docs via diagramType switching (variant B) + await docs load.
14. [x] Retry up to 3 attempts per diagram; continue on failure.
15. [x] Record progress + history meta per block.
16. [x] Ensure notebook plan fixes the constraint: no styling directives/colors in blocks.
17. [x] Add per-block notebook chat (chat.md from Build Docs; raw shows plan intent) and persist per diagram.
18. [x] Split Build Docs panel into two panes (docs + intent) with resizer and placeholders.

---

Maintenance:
19. [x] Unify UI controls (Button/Tab/Input/Select/Radio) and align header toggles across columns.

---

Refactor / maintenance (после 2026-01-22):
20. [x] Split Mermaid helpers into `services/mermaid/*` (markdown/validate/llm) with stable `mermaidService` exports.
21. [x] Refactor Preview rendering into surfaces + hooks (content mode, header model, markdown meta, scroll sync, SVG render/panzoom).
22. [x] Restructure operation logs view models + anchored inline logs in chat, add/expand tests.
23. [x] Extract Studio orchestration into dedicated hooks (tabs/hydration/chat flow/chat context/whiteboard/project preview).
24. [x] Improve Excalidraw canvas background/theme controls and persist behavior for notebook.
25. [x] Refactor chat/project UI: extract projects menu + diagram type picker + message list/summary components.
26. [x] Support whiteboard bundle per markdown block (resolve/update by active block index).
27. [x] Expand unit tests for build pipeline/autofix/operation runner/log context and docs context.

---

Обновлено: 2026-01-23.
