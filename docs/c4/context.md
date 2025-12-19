# C4 L1 — System Context

## Что это за система

**Mermaid Diagram Compiler** — локальное SPA (React/Vite), которое помогает:
- вести диалог (Chat) по требованиям к диаграмме,
- генерировать/обновлять Mermaid-код (Build),
- валидировать и чинить синтаксис (Auto-fix/Fix),
- хранить историю шагов и ревизий диаграмм локально в браузере (IndexedDB).

## Диаграмма контекста (C4Context)

> Mermaid C4 — экспериментальный тип диаграмм; некоторые Markdown-превьюеры могут не поддерживать его. Если превью пустое, открой диаграмму в приложении или в Mermaid Live Editor.

```mermaid
C4Context
title Mermaid Diagram Compiler - System Context

Person(user, "User", "Writes prompts, reviews diagrams")

System(spa, "Mermaid Diagram Compiler (SPA)", "Chat + Editor + Preview")

System_Ext(openrouter, "OpenRouter", "Cloud LLM provider")
System_Ext(cliproxy, "Cliproxy API", "Local OpenAI-compatible proxy")

System_Ext(localDocs, "Local Mermaid Docs", "Static files at /mermaid-docs")
SystemDb(idb, "IndexedDB", "Local history store (Session/TimeStep/DiagramRevision)")

Rel(user, spa, "Uses")
Rel(spa, openrouter, "Calls", "HTTPS")
Rel(spa, cliproxy, "Calls", "HTTP")
Rel(spa, localDocs, "Fetches", "HTTP (static)")
Rel(spa, idb, "Reads/Writes", "IndexedDB")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

Примечания:
- В режиме **Chat** приложение просит LLM отвечать **только текстом**.
- В режиме **Build** приложение просит LLM вернуть **только Mermaid-код** и валидирует его через `mermaid.parse()`.
