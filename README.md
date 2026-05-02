# Mermaid Compiler

AI-assisted Mermaid diagram workspace for generating, editing, validating, fixing, and exporting technical diagrams.

## What It Demonstrates

- React + TypeScript application for a real developer tool, not a static demo.
- LLM workflow design: separate chat, build, fix, analyze, prompt preview, and operation logs.
- Mermaid-specific validation and repair loops with syntax-aware feedback.
- Local-first storage with optional sync/share architecture.
- Agent-friendly architecture with docs context loading, explicit service boundaries, and testable hooks.
- Multi-provider AI integration through OpenRouter and local cliproxy-compatible endpoints.

## Features

- Chat for clarification and design discussion.
- Build action for generating Mermaid diagrams or Markdown notebooks with multiple Mermaid blocks.
- Live Mermaid preview with zoom, pan, fit/reset, and fullscreen controls.
- Syntax highlighting editor based on PrismJS.
- Automatic validation and repair attempts after generation.
- Manual fix flow with operation logs and context inspection.
- Project/session history with editable names.
- Dark theme and resizable three-column workspace.
- Local Mermaid documentation context for more grounded generation.
- Optional Desktop Agent / cliproxy integrations for local model workflows and quota visibility.

## Tech Stack

- React 19, TypeScript, Vite.
- Mermaid 11, PrismJS, `react-simple-code-editor`.
- Tailwind-style utility CSS and Lucide icons.
- Vitest, TypeScript checks, ESLint.
- Optional Tauri/Rust desktop agent.

## Repository Layout

```text
diagram-compiler/          # React + Vite application
diagram-compiler/src/      # app entry and runtime wiring
diagram-compiler/components/
diagram-compiler/hooks/    # core state and studio orchestration hooks
diagram-compiler/services/ # LLM, Mermaid, docs, storage services
agent/                     # optional Tauri desktop agent
docs/                      # project and architecture documentation
mermaid-docs/              # vendored Mermaid docs used as generation context
```

## Run Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The app runs from the `diagram-compiler` package and Vite will print the local URL, usually `http://localhost:5173`.

Build and preview:

```bash
npm run build
npm run preview
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
```

## AI Configuration

Provider settings are stored in browser `localStorage`.

Supported modes:

- OpenRouter for hosted model access.
- Cliproxy-compatible local endpoint for local or custom model routing.
- Optional Desktop Agent for local control plane and quota integrations.

No API keys are required in the repository. Keys are entered at runtime in the app UI.

## Documentation

- `docs/project/README.md` - full project documentation index.
- `docs/architecture.md` - architecture overview.
- `docs/ai-overview.md` - AI workflow overview.
- `docs/desktop-agent.md` - Desktop Agent notes.
- `docs/testing.md` - test strategy.

## Portfolio Notes

This project shows how I build agent-aware developer tools: separate planning and execution flows, inspectable LLM operations, provider abstraction, validation loops, and a UI designed for repeated technical work rather than a one-off prompt box.
