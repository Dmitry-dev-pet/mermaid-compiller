# Mermaid Core: Validation & Rendering

[← Back to Index](./) | [← Prev: System Architecture](internal-architecture.md)

## Жизненный цикл кода

1.  **Generation**: LLM генерирует Markdown-блок.
2.  **Extraction**: Извлечение чистого кода.
3.  **Directive Injection**: Добавление настроек (Theme/Look).
4.  **Validation**: `mermaid.parse()`. Ошибки отправляются в Auto-Fix.
5.  **Rendering**: `mermaid.render()`.

## Поверхности превью
- **SVG**: Одна диаграмма.
- **Markdown**: Документ с блоками.
- **Whiteboard**: Рисование поверх SVG.

---
[← Back to Index](./) | [Next: Updating Docs →](internal-docs-update.md)
