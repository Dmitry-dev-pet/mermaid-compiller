# Mermaid Agent Guide

[← Back to Index](./) | [← Prev: CLIProxyAPI](ai-cliproxy.md)

**Mermaid Agent** is a native desktop component that acts as a bridge between the web UI and local CLI tools installed on your machine.

## How it works
The agent runs an HTTP server on port `8787`. When you send a request, the agent starts a local process (e.g. `gemini`) and passes your prompt to it.

## Supported tools

### 1. Gemini CLI
- Uses Google’s official `gemini` CLI.
- Authentication via `gcloud auth login` or `gemini auth`.

### 2. Codex CLI
- Uses OpenAI’s `codex` CLI.

## Tray control
The system tray icon lets you:
- Check status (Online/Offline)
- See which tools are installed
- Trigger login flows quickly

---
[← Back to Index](./) | [Next: Prompt Engineering →](ai-prompts.md)
