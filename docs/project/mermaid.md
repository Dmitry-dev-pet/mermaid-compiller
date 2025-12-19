# Mermaid: валидация, рендер и превью

## Инициализация

`initializeMermaid(theme)` настраивает Mermaid:

- `startOnLoad: false`.
- `theme`: `default` или `dark`.
- `securityLevel: 'loose'`.

## Валидация

`validateMermaid(code)` использует `mermaid.parse()`:

- При успехе помечает статус `valid` и обновляет `lastValidCode`.
- При ошибке извлекает номер строки из сообщения об ошибке.

## Рендеринг

`PreviewColumn` рендерит SVG так:

1. `mermaid.render(id, code)` возвращает `svg` и `bindFunctions`.
2. SVG монтируется через `innerHTML` (важно для диаграмм с `foreignObject`, например C4).
3. `bindFunctions` вызывается после монтирования.

## Zoom/Pan и fullscreen

- Используется библиотека `svg-pan-zoom`.
- Для SVG вычисляется `viewBox`, затем применяются `fit`/`center`.
- Поддерживаются кнопки Zoom In/Out, Fit, Reset.
- Кнопка fullscreen разворачивает превью на все три колонки; при входе/выходе выполняется fit.
