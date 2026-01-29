# AI Strategies Overview

[← Back to Index](./)

The app supports three independent strategies for connecting to an LLM.

## Strategy comparison

| Feature | OpenRouter (Cloud) | CLIProxyAPI (My Proxy) | Mermaid Agent (Native) |
| :--- | :--- | :--- | :--- |
| **Best for** | Beginners | Power users | Minimal setup |
| **Auth** | API key | **OAuth (browser)** | Local CLI session |
| **Quotas in UI** | No | **Yes (quota bars)** | No |
| **Antigravity** | No | **Yes** | No |
| **Privacy** | Medium | **High** | **High** |

---

## 1. OpenRouter (Cloud)
**Direct cloud connection.**
The simplest way to use models like GPT, Claude, or Gemini via OpenRouter.

- **How it works**: the editor sends requests directly to the OpenRouter API.
- **Requirements**: an OpenRouter API key.

## 2. CLIProxyAPI (My Proxy)
**A specialized local proxy integration.**
“No-Key Magic” mode: use existing subscriptions via OAuth sessions from CLI tools.

- **How it works**: the editor connects to a local `cliproxyapi` server.
- **More**: [CLIProxyAPI Integration](ai-cliproxy.md)

## 3. Mermaid Agent (Native Tray)
**Bridge to local CLIs.**
A desktop tray agent that runs local tools on your machine.

- **How it works**: the agent runs `gemini` or `codex` as subprocesses.
- **More**: [Mermaid Agent Guide](ai-agent.md)

---
[← Back to Index](./) | [Next: CLIProxyAPI Integration →](ai-cliproxy.md)
