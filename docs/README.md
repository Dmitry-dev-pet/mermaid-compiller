# Mermaid Diagram Compiler — Documentation

This documentation set describes how to run Mermaid Diagram Compiler, how the AI/Proxy integrations work, and how the app is structured internally.

## Contents

- **Getting started**
  - `index.md` — docs index
  - `setup-web.md` — web setup
  - `setup-desktop.md` — desktop setup (Mermaid Agent)
- **Guides**
  - `guide-basic.md` — Chat / Build / Fix workflow
  - `guide-notebooks.md` — notebooks & planner pipeline
  - `guide-whiteboard.md` — whiteboard / Excalidraw
  - `guide-export.md` — export & share
  - `guide-troubleshooting.md` — troubleshooting
- **AI**
  - `ai-overview.md` — strategies overview
  - `ai-cliproxy.md` — CLIProxyAPI integration
  - `ai-agent.md` — local Mermaid Agent
  - `ai-prompts.md` — prompt engineering
- **Storage**
  - `storage-local.md` — local IndexedDB/history
  - `storage-sync.md` — cloud sync & E2EE
- **Internals**
  - `internal-architecture.md` — architecture
  - `internal-mermaid.md` — Mermaid validation/rendering
  - `internal-testing.md` — tests/lint/typecheck
  - `internal-docs-update.md` — updating embedded Mermaid docs

## Code locations

- SPA app: `diagram-compiler/` (React + Vite + TypeScript)
- Desktop agent: `agent/` (Tauri + Rust)

---

Updated: 2026-01-29.
