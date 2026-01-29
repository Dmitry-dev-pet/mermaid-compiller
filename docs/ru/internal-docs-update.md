# Updating Mermaid Documentation

[← Back to Index](./) | [← Prev: Mermaid Core](internal-mermaid.md)

Для обеспечения качественной генерации приложение хранит локальную копию документации Mermaid.

## Процесс обновления

1.  Скачайте новую версию документации с официального сайта Mermaid.
2.  Поместите файлы в `diagram-compiler/public/mermaid-docs/`.
3.  Обновите маппинг файлов в `services/docsContextService.ts`.
4.  Обновите константу `MERMAID_VERSION` в `constants.ts`.

---
[← Back to Index](./)
