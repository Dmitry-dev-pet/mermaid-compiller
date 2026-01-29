# Desktop Agent Setup

[← Back to Index](./) | [← Prev: Web Setup](setup-web.md)

The desktop version includes a native Tauri app and a background agent (tray app) to work with local CLI tools.

## Requirements
- **Rust**: latest stable (`rustc` + `cargo`)
- **Node.js**: v20+
- **System dependencies**:
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.0-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - Windows: C++ Build Tools

## Install & run

```bash
# Go to the agent folder
cd agent/src-tauri

# Run in dev mode
cargo tauri dev
```
This will start:
1. Frontend (Vite)
2. Backend (Mermaid Agent server)
3. App window
4. System tray icon

## Release build

To build an installer (`.dmg`, `.msi`, `.deb`):

```bash
cargo tauri build
```
Artifacts will be in `agent/src-tauri/target/release/bundle`.

## Agent configuration
The agent reads environment variables. You can create a `.env` file next to the binary.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `AGENT_PORT` | Agent API server port | `8787` |
| `AGENT_TOKEN` | Agent API auth token | (empty) |
| `GEMINI_CMD` | Gemini CLI command/path | `gemini` |
| `CODEX_CMD` | Codex CLI command/path | `codex` |

---
[← Back to Index](./)
