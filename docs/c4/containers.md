# C4 L2 — Containers

## Контейнеры

- **Browser SPA**: `diagram-compiler/` — основной UI (Chat/Editor/Preview), хуки/сервисы.
- **Static file server (prod)**: `server.js` — раздаёт `diagram-compiler/dist`.
- **Static Mermaid docs**: `diagram-compiler/public/mermaid-docs` — локальные сниппеты документации для промптов.

## Диаграмма контейнеров (C4Container)

```mermaid
C4Container
title Mermaid Diagram Compiler - Containers

Person(user, "User")

Container(spa, "Browser SPA", "React + TypeScript + Vite", "Chat/Build + Editor + Preview")
Container(server, "Static Server", "Node.js + Express", "Serves SPA build")
ContainerDb(idb, "IndexedDB", "Browser DB", "History")

System_Ext(openrouter, "OpenRouter", "LLM API")
System_Ext(cliproxy, "Cliproxy", "Local LLM proxy")
System_Ext(localDocs, "Local Mermaid Docs", "Static files at /mermaid-docs")

Rel(user, spa, "Uses")
Rel(server, spa, "Serves", "HTTP")
Rel(spa, idb, "Persists", "IndexedDB")
Rel(spa, openrouter, "Requests", "HTTPS")
Rel(spa, cliproxy, "Requests", "HTTP")
Rel(spa, localDocs, "Fetches", "HTTP (static)")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

---

Обновлено: 2025-12-24. Согласовано с текущей реализацией (markdown-навигация, scroll sync, frontmatter config).
