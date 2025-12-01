# AGENT GUIDELINES for mermaid-langgraph

## Spec-first workflow

- Before making **any code or configuration changes** in this repository, the agent **must first read and respect** the following specification files:
  - `docs/constitution.md`
  - `features/001-mermaid-core/spec.md`
  - `features/001-mermaid-core/plan.md`
  - `features/001-mermaid-core/tasks.md`
- Treat these files as the **single source of truth** for project principles, feature requirements, implementation plan and task breakdown.
- If planned work не укладывается в текущую спецификацию, сначала обновить/уточнить спецификацию (по запросу пользователя), а уже потом менять код.

## Documentation

- Не создавать и не изменять дополнительную документацию (README, docs и т.п.), если пользователь явно не запросил этого.
