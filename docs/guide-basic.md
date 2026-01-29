# Basic Workflow: Chat, Build, Fix

[← Back to Index](./)

The core workflow in Mermaid Diagram Compiler is split into design and execution phases. This helps you validate intent early and reduces syntax errors later.

## 1. Design phase (Mode: Chat)
Instead of generating code immediately, you discuss what you want to build with the AI.
- **Action**: Describe the task (e.g. “Describe a pizza ordering process”) and press **Chat**.
- **Result**: The AI produces an **Intent** — a structured description of entities, relationships, and constraints. No Mermaid code is generated at this stage.
- **Why**: You can adjust logic before the model starts producing strict Mermaid syntax.

## 2. Execution phase (Mode: Build)
Once the Intent looks correct, generate the diagram code.
- **Action**: Press **Build** (or `Ctrl/Cmd + Enter`).
- **Result**: The AI takes the Intent, adds relevant Mermaid docs context, and generates valid code.
- **Live Preview**: The diagram renders immediately in the Preview column.

## 3. Fix phase (Mode: Fix)
If the model produces invalid syntax (for example, a missing bracket):
- **Auto-Fix**: The app detects the error and attempts to fix it automatically (up to 5 attempts).
- **Manual Fix**: If automatic fixes don’t help, you can press **Fix** manually or edit code directly.

## 4. Useful editor features
- **Vim Mode**: Optional, for Vim-style editing.
- **Inline Settings**: Change Theme (Dark/Light), Look (Handdrawn), and Direction (Top–Bottom / Left–Right) from the preview header.
- **Snapshot**: Save a revision of the diagram to history.

---
[← Back to Index](./) | [Next: Markdown Notebooks →](guide-notebooks.md)
