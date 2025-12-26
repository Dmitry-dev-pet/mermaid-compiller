# Mermaid Core Spec

## Scope
- Maintain the Diagram Compiler SPA functionality for Mermaid editing, markdown previews, and diagram navigation.

## Current task
Статус: выполнено, режим поддержки.

Фича: менеджер проектов (сессий) в панели чата.

Реализовано:
- Проект = сессия пользователя, которую можно продолжить.
- Действия: создать новую сессию, продолжить/открыть существующую, удалить, переименовать.
- Хранилище: IndexedDB (данные сессии не в localStorage).
- UI: список проектов в панели чата с основными действиями.
- Персистентность: сохраняются настройки UI и LLM (включая опциональные параметры модели).

Реализовано (предыдущие задачи):
- Preview navigation buttons visible for markdown diagrams in `markdown_mermaid`.
- Inline direction follows Mermaid syntax (`TD` only for flowchart headers, `direction` statements for class/state/ER/requirement).
- Markdown-wide theme selection applies to all Mermaid blocks.
- Markdown-wide look selection applies to all Mermaid blocks (dir hidden in markdown preview).
- Theme/look uses YAML frontmatter (`config:`) instead of deprecated directives.
- Column headers (Chat, Editor, Preview) are kept at equal height.
- Scroll sync toggle links Editor and Preview in markdown mode.
- Active markdown block uses solid left bar only on preview hover.
- Scroll sync uses proportional height mapping for smooth movement.

Фича: режим фиксации Markdown (последовательное исправление всех невалидных блоков).

Требования:
- Одна кнопка Fix запускает режим.
- В режиме Fix для Markdown блоки исправляются по очереди.
- Остановка на первом неуспешном блоке.
- История фиксируется шагом на каждый блок.

Следующие шаги: только косметика/maintenance.

Обновление поведения проектов:
- Удаление проекта без предупреждения.
- После удаления доступна кнопка Undo (отмена удаления).

Фича: режим сборки MD notebook из чата (несколько диаграмм по одной кнопке Build).

Идея:
- В чате рядом с Build доступен toggle `MD notebook`.
- Если toggle включен, Build генерирует не одну диаграмму, а Markdown-файл с несколькими Mermaid-блоками.
- Для согласованности терминов используется общий план (planner) и glossary; промпт каждой диаграммы независим.

Требования (UX):
- Toggle `MD notebook` расположен рядом (как switch/toggle) и влияет на поведение Build.
- Рядом с toggle доступно поле `N` (количество диаграмм, optional).
  - Если пользователь задал `N`, planner обязан построить план ровно на `N` диаграмм (приоритет пользователя).
  - Если `N` не задано, planner выбирает `N` по запросу.
- Генерация запускается только по кнопке Build (toggle сам по себе ничего не создает).

Требования (flow):
- По нажатию Build в notebook-режиме выполняется planner-запрос, который возвращает структурированный JSON `NotebookPlan`:
  - итоговое `resolvedN`
  - список диаграмм (каждая: `diagramType`, `title`, `goal`, `buildPrompt`, `acceptance`)
  - `glossary` (общие термины и канонические названия)
- После planner создается markdown-скелет ноутбука с `resolvedN` mermaid-блоками и заголовками, затем запускается последовательная генерация блоков.
- Для каждого блока `i` (1..N):
  - Временно устанавливается `appState.diagramType = plan.diagrams[i].diagramType` (вариант B).
  - Обязательно дождаться обновления docs-entries для выбранного типа (чтобы `getDocsContext('build')` был релевантным).
  - Выполняется до 3 попыток построения диаграммы:
    - попытка = build + validation + auto-fix (в рамках существующих лимитов), затем повторная validation
    - если после попытки код все еще невалиден, выполняется следующая попытка
  - Если после 3 попыток блок невалиден — блок помечается как failed (сообщение в чат) и pipeline продолжает следующий блок.
- После завершения notebook pipeline возвращается исходный `appState.diagramType` (тот, что был до Build).
- Все LLM-запросы защищены таймаутом; при таймауте выполняются повторы только для текущего шага (по умолчанию 3 попытки).

Требования (docs):
- Для каждой диаграммы используется релевантный docs context, определяемый текущим `appState.diagramType` (вариант B).
- Planner также использует docs context, но не привязан к одному блоку; его задача — подобрать типы диаграмм и независимые промпты.
- Chat в notebook-режиме возвращает intent для planner (структура с разделами Summary/Diagrams/Glossary/Constraints/Open questions).

## Constraints
- Keep UI state in hooks; components should remain presentation-focused.
- Use existing React + Tailwind patterns in `diagram-compiler/`.

---

Обновлено: 2025-12-26.
