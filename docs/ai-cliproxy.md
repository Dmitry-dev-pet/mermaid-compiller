# CLIProxyAPI Integration

[← Back to Index](./) | [← Prev: AI Overview](ai-overview.md)

**CLIProxyAPI** (Cliproxy) is the core of the “power user” integration. It lets you use advanced models without manually managing API keys.

## Key features

### 🔑 OAuth "No-Key" Magic
You authenticate in the browser using official tools (Google, OpenAI). Cliproxy reuses that session so the app can access the models.

### 🚀 Antigravity channel
Access to **Antigravity**, a high-performance gateway optimized for coding workloads.

### 📊 Quota monitoring
When connected to Cliproxy, the AI menu shows quota bars, for example:
- Remaining requests for **Codex**
- Available tokens for **Antigravity**

### ⚖️ Load Balancing
Cliproxy can rotate between multiple accounts (round-robin) to spread rate limits.

## How to use
1. Run `cliproxyapi` (default: `localhost:8317`).
2. In the editor, choose **My Proxy**.
3. Set endpoint to `http://localhost:8317`.

---
[← Back to Index](./) | [Next: Mermaid Agent →](ai-agent.md)
