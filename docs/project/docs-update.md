# Обновление Mermaid-документации

## Где лежит документация

- Полный снэпшот: `mermaid-docs/11.12.2/`.
- Подмножество для приложения: `diagram-compiler/public/mermaid-docs/`.

Приложение загружает **только** файлы, перечисленные в `services/docsContextService.ts`.

## Процесс обновления (рекомендованный)

1. Обновить полный снэпшот Mermaid-доков в `mermaid-docs/<version>/`.
2. Скопировать нужные файлы в `diagram-compiler/public/mermaid-docs/`.
3. Проверить пути в `services/docsContextService.ts`.
4. Обновить `MERMAID_VERSION` в `diagram-compiler/constants.ts`.
5. Прогнать `npm test`.

## Как понять, какие файлы нужны

Список путей задается в `docsContextService`:

- `commonDocs` — базовые главы (getting started, syntax reference, configuration).
- `diagramDocs` — файл, специфичный для выбранного типа диаграммы.
