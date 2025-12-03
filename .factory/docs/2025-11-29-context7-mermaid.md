План:
1. В `public/app.js` добавить константный словарь для каждой кнопки (flowchart, sequence и т.д.), где указан ключевой запрос к Context7 (например `"flowchart mermaid syntax"`).
2. `fetchDocsContext` и `fetchStyleDocsContext` будут использовать только эти шаблоны:
   • структура → `<diagramType> mermaid syntax reference` (если auto — дефолт `mermaid syntax basics`).
   • стиль → `<diagramType> mermaid styling tips`.
   Пользовательский текст больше не участвует (кроме выбора типа).
3. В History/Context7 модалке показывать какой шаблон применён (rawQuery = шаблон), чтобы прозрачнее видеть контекст.

После подтверждения подкручу helpers, обновлю вызовы и прогоню lint/ruff.