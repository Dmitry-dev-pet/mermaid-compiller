# Mermaid: валидация, рендер, превью и экспорт

## Инициализация

`initializeMermaid(theme)` настраивает Mermaid:

- `startOnLoad: false`.
- `theme`: `default` или `dark`.
- `securityLevel: 'loose'`.

## Валидация

`validateMermaid(code)`:

- Определяет Markdown (`isMarkdownLike`) и в этом случае пропускает валидацию (считается валидным контентом для превью).
- Для Mermaid-кода применяет inline-команды направления/темы/стиля (`applyInlineDirectionCommand`, `applyInlineThemeAndLookCommands`) и вызывает `mermaid.parse()`.
- При успехе помечает статус `valid` и обновляет `lastValidCode`; при ошибке извлекает номер строки.

## Рендеринг

`PreviewColumn` рендерит разными режимами (через surfaces):

- **Mermaid (SVG surface):** рендер в SVG, затем mount в DOM, `bindFunctions`, pan/zoom/fit.
- **Markdown (Markdown surface):** markdown → HTML, mermaid fenced blocks заменяются на SVG через renderer; ошибки показываются inline на месте блока.
- **Build Docs (BuildDocs surface):** отображение системных промптов/доков (как markdown).
- **Whiteboard/Notebook tiles surfaces:** Excalidraw-представления (whiteboard edit / notebook tiles).
- При ошибке рендера показывается оверлей с текстом ошибки; для статуса `invalid` показывается предупреждение вместо SVG.

## Нюансы синтаксиса (практика)

- Для `flowchart` безопаснее избегать круглых скобок в **тексте узлов** (например, `Node[Text (пример)]`): некоторые комбинации могут приводить к parse error. Предпочитайте тире/двоеточие.

## Zoom/Pan и fullscreen

- Используется `svg-pan-zoom` (через `hooks/preview/useSvgPanZoom.ts`); на каждой перерисовке вызываются `resize` + `fit` + `center`.
- Доступны кнопки Zoom In/Out, Fit и fullscreen (на всю ширину трех колонок); zoom отображается в процентах.

## Inline-настройки

- В шапке превью: выбор темы (`theme`), направления (`direction`) и стиля (`look`).
- Переключатель режима превью (Mermaid/Excalidraw) расположен в шапке и стилизован как единый toggle, в одном ряду с другими контролами.
- Выбранные значения добавляются в код как директивы (`%%{theme: ...}%%`, `%%{direction: ...}%%`, `%%{init: { look: ...}}%%`) и сразу учитываются в валидации/рендере.

## Структура Mermaid-сервисов

Mermaid helpers разделены по назначению:

- `diagram-compiler/services/mermaid/markdown.ts` — markdown-like detection + манипуляции блоками.
- `diagram-compiler/services/mermaid/validate.ts` — `initializeMermaid`, `validateMermaid`, inline directives.
- `diagram-compiler/services/mermaid/llm.ts` — парсинг ответов LLM (extract code/JSON).
- `diagram-compiler/services/mermaidService.ts` — совместимый re-export.

## Системные промпты в Build Docs

- Для каждого режима (Chat/Build/Analyze/Fix) есть отдельный файл `system-prompt.<mode>.md` в Build Docs.
- Чекбоксы рядом с файлами управляют включением документации в контекст выбранного режима.
- На кнопке системного промпта доступен переключатель Raw, чтобы увидеть полную или редактированную версию с контекстом доков.

## Экспорт

- Кнопки **SVG** и **PNG** доступны, когда есть сгенерированное SVG (не для Markdown режима).
- **SVG:** клонирует текущий SVG, нормализует `viewBox`, опционально добавляет фон и скачивает файл.
- **PNG:** инлайнит внешние `image`/`foreignObject img` и CSS-ресурсы (с таймаутами и лимитами по размеру/количеству), отказывает при `foreignObject` или при оставшихся внешних ссылках. Фон выбирается по текущей теме.
- Ошибки экспорта отображаются рядом с контролами в шапке превью.

---

Обновлено: 2026-01-23. Согласовано с текущей реализацией (preview surfaces, mermaid services split).
