# Markdown Notebooks & Planner

[← Back to Index](./) | [← Prev: Basic Workflow](guide-basic.md)

**Markdown Notebooks** is the most powerful mode in the app. It lets you generate complete technical documents with multiple related diagrams.

## How it works
In this mode, **Build** runs a pipeline instead of generating a single diagram:
1. **Planner**: the AI analyzes the task and produces a JSON plan of the document.
2. **Structure**: the app creates a Markdown skeleton with headings and empty Mermaid blocks.
3. **Sequential Build**: the AI fills each block one-by-one, using shared context (a glossary).

## How to run
1. Enable **MD notebook** in the chat panel.
2. (Optional) Specify the number of diagrams `N`.
3. Describe a complex system (e.g. “Architecture of a microservice bank”).
4. Press **Build**.

## Benefits
- **Consistency**: all diagrams reuse the same service/entity names (via the shared glossary).
- **Variety**: the Planner chooses the best diagram type (`sequenceDiagram`, `flowchart`, `ERDiagram`, etc.) per section.
- **Autonomy**: you get a publish-ready `.md` file.

## Editing individual blocks
In Markdown preview, each Mermaid block is clickable. You can select a specific block and run **Fix** or **Analyze** on it without affecting the rest of the document.

---
[← Back to Index](./) | [Next: Whiteboard Integration →](guide-whiteboard.md)
