# Testing & Linting

[← Back to Index](./)

Quality assurance commands and conventions.

## Unit tests

We use **Vitest** to test business logic (hooks, services, parsers).

Run tests:
```bash
# From repo root
npm test

# Or inside the app folder
cd diagram-compiler
npm test
```

High-priority coverage areas:
- `NotebookPlan` build & validation
- Operation logs and context
- Mermaid service utilities

## Lint

```bash
npm run lint
```

## Typecheck

```bash
npm run typecheck
```

---
[← Back to Index](./)
