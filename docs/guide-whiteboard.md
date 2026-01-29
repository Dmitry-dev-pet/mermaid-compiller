# Whiteboard Integration (Excalidraw)

[← Back to Index](./) | [← Prev: Markdown Notebooks](guide-notebooks.md)

Sometimes a code-generated diagram needs sketches, annotations, or manual notes. Mermaid Diagram Compiler integrates **Excalidraw** for that.

## Modes

### 1. On top of the diagram (Annotations)
Switch Preview to **Whiteboard** mode. The current Mermaid diagram becomes a background, and you can draw arrows, highlight blocks, or add sticky notes on top.

### 2. Free canvas (Empty Board)
Use Whiteboard as a standalone tool for early-stage sketching before you turn things into Mermaid code.

## Notebook integration
In Markdown Notebook mode, Whiteboard scenes are tied to the **active block**.
- If you draw something for Block 1 and then switch to Block 2, you’ll see the scene for Block 2.
- All drawings are saved with the project in IndexedDB.

## Controls
Use the **Mermaid / Whiteboard** switch in the preview header. The canvas is saved automatically on every change.

---
[← Back to Index](./) | [Next: Export & Sharing →](guide-export.md)
