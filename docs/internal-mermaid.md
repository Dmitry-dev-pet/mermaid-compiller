# Mermaid Core: Validation & Rendering

[← Back to Index](./) | [← Prev: System Architecture](internal-architecture.md)

## Code lifecycle

1. **Generation**: the LLM generates a Mermaid/Markdown block.
2. **Extraction**: extract clean Mermaid code.
3. **Directive injection**: add settings (Theme/Look).
4. **Validation**: `mermaid.parse()`. Errors are fed into Auto-Fix.
5. **Rendering**: `mermaid.render()`.

## Preview surfaces
- **SVG**: single diagram.
- **Markdown**: document with multiple blocks.
- **Whiteboard**: draw on top of SVG.

---
[← Back to Index](./) | [Next: Updating Docs →](internal-docs-update.md)
