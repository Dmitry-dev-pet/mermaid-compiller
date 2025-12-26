# Plan

Статус: выполнено.

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

---

Обновлено: 2025-12-26.
