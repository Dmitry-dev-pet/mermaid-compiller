# Troubleshooting Guide

[← Back to Index](./)

Common issues and solutions for Mermaid Diagram Compiler.

## The LLM won’t connect
- **OpenRouter**: verify your API key.
- **My Proxy (Cliproxy)**: make sure the server is running and reachable (e.g. `http://localhost:8317`).
- **Mermaid Agent**: make sure the tray app is running.

## LLM Timeout
Requests can take a while, especially when generating large documents.
- Increase **Timeout (s)** in the AI settings.
- Reduce the amount of documentation selected in **Build Docs** if the model is overloaded with context.

## Preview doesn’t render
- If the editor shows **Invalid**, the code has syntax errors. Press **Fix**.
- If the code is **Valid** but the screen is empty, check for a renderer error overlay.

## Old diagrams disappear
- The app stores history in **IndexedDB**. Clearing browser storage or using incognito/private mode can remove local data.
- Use **Cloud Sync** (Supabase) for reliable project storage.

---
[← Back to Index](./)
