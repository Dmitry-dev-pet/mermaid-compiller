# Build System Prompt — Diagram Type Hints (RU)

Этот документ предназначен для режима Build Docs и описывает подробные подсказки по синтаксису Mermaid для разных типов диаграмм. Используйте соответствующую секцию в зависимости от выбранного diagramType.

## Общие правила (для всех типов)
- Вывод только Mermaid-код, без пояснений и без fenced code.
- Должна быть строго одна диаграмма и корректная директива типа в первой строке.
- Не добавляй стили, темы, цвета и прочие декоративные директивы, если пользователь явно этого не просил.
- Если есть сомнения, делай схему проще, но валидной.
- Комментарии: `%%` на отдельной строке (для zenuml используется `//`).

---

## diagramType: architecture
- Заголовок: `architecture-beta`.
- Блоки: `group id(icon)[Title]`, `service id(icon)[Title]`, `junction id`.
- Вложенность: `in parentId`.
- Ребра: `{from}:{L|R|T|B} -- {L|R|T|B}:{to}`; стрелки через `<` и `>`.
- Нельзя ссылаться на groupId в ребрах напрямую; используй `service{group}` для ребер через группу.

## diagramType: block
- Заголовок: `block` (не `block-beta`).
- Разметка: `columns N`, блоки `id["Label"]`, ширина `id:2`.
- Вложенные блоки: `block:group ... end`.
- Связи: `A --> B`.
- ID блоков — без пробелов и спецсимволов; отображаемый текст — в кавычках.

## diagramType: c4
- Заголовок: `C4Context` / `C4Container` / `C4Component` / `C4Dynamic` / `C4Deployment`.
- Элементы: `Person`, `System`, `Container`, `Component` и варианты `_Db`, `_Queue`, `_Ext`.
- Границы: `Boundary`, `Enterprise_Boundary`, `System_Boundary`.
- Связи: `Rel`, `BiRel`, `RelIndex`.
- Порядок строк влияет на layout.

## diagramType: class
- Заголовок: `classDiagram`.
- Классы: `class Name` или через отношения `A <|-- B`.
- Члены: `Class : +type name` или блок `{ ... }`.
- Связи: `<|--` наследование, `*--` композиция, `o--` агрегация, `..>` зависимость, `-->` ассоциация.
- Направление: `direction LR` / `direction TB` и т.п.

## diagramType: er
- Заголовок: `erDiagram`.
- Связи: `A ||--o{ B : label`.
- Кардинальности: `||`, `|{`, `}o` и т.д.
- Атрибуты: `ENTITY { type name }`.
- Тексты с пробелами — в кавычках.
- Направление: `direction LR` / `direction TB` и т.п.

## diagramType: flowchart
- Заголовок: `flowchart TD` (или иной direction).
- Узлы: `id[Text]`, `id((Text))`, `id{Decision}`.
- ID узлов — без пробелов и спецсимволов; отображаемый текст — в скобках, в кавычках при необходимости.
- HTML-символы `<`, `>`, `&`, `#` в тексте экранируй (entity codes).
- Ребра: `-->`, `-.->`, `==>`; подписи: `A -->|label| B`.
- Subgraph: `subgraph Name ... end`.

## diagramType: gantt
- Заголовок: `gantt`.
- Поля: `title`, `dateFormat`, `section`.
- Задачи: `Task : id, 2024-01-01, 5d` или `Task : after id, 5d`.
- Теги: `done`, `active`, `crit`, `milestone`.
- ID задач — без пробелов.

## diagramType: gitGraph
- Заголовок: `gitGraph`.
- Команды: `commit`, `branch name`, `checkout name`, `merge name`.
- Атрибуты: `commit id: "X" type: HIGHLIGHT tag: "v1"`.

## diagramType: kanban
- Заголовок: `kanban`.
- Колонки: `columnId[Title]`.
- Карты (с отступом): `taskId[Task]`.
- Метаданные: `@{ assigned: 'x', ticket: KEY-1, priority: 'High' }`.

## diagramType: mindmap
- Заголовок: `mindmap`.
- Иерархия через отступы.
- Формы как во flowchart: `[]`, `()`, `(( ))`, `{{ }}`.
- Иконки: `::icon(...)` (экспериментально).

## diagramType: packet
- Заголовок: `packet`.
- Поля: `0-15: "Label"` или `+8: "Label"`.
- Заголовок пакета: `title ...`.

## diagramType: pie
- Заголовок: `pie` (опционально `showData`).
- Данные: `"Label" : 42`.
- Значения строго положительные.

## diagramType: quadrantChart
- Заголовок: `quadrantChart`.
- Оси: `x-axis Low --> High`, `y-axis Low --> High`.
- Квадранты: `quadrant-1 ...` и т.д.
- Точки: `Name: [0.3, 0.6]` (0..1).

## diagramType: radar
- Заголовок: `radar-beta`.
- Оси: `axis id["Label"]`.
- Кривые: `curve id["Label"]{1,2,3}`.
- Опции: `max`, `min`, `graticule`, `ticks`, `showLegend`.

## diagramType: requirementDiagram
- Заголовок: `requirementDiagram`.
- Требования: `requirement name { id: 1 text: ... risk: High verifymethod: Test }`.
- Элементы: `element name { type: ... docref: ... }`.
- Связи: `A - satisfies -> B`.

## diagramType: sequence
- Заголовок: `sequenceDiagram`.
- Участники: `participant`, `actor`.
- Сообщения: `A->>B: msg`, `A-->>B: msg`.
- Активности: `A->>+B` / `B-->>-A`.
- Заметки: `Note right of A: ...`.
- Спецсимволы `<`, `>`, `&`, `#` в тексте экранируй (entity codes).

## diagramType: sankey
- Заголовок: `sankey`.
- CSV-строки: `source,target,value` (ровно 3 колонки).
- Запятые в текстах — в кавычках.

## diagramType: state
- Заголовок: `stateDiagram-v2`.
- Переходы: `A --> B: event`.
- Старт/конец: `[*]`.
- Составные состояния: `state X { ... }`.
- Направление: `direction LR` / `direction TB` и т.п.

## diagramType: timeline
- Заголовок: `timeline`.
- События: `Year : Event : Event` или многострочно с `:`.
- Разделы: `section Name`.

## diagramType: treemap
- Заголовок: `treemap-beta`.
- Узлы: "Section"; листья с значением: "Leaf": 12.
- Иерархия через отступы.

## diagramType: userJourney
- Заголовок: `journey`.
- Разделы: `section Name`.
- Задачи: `Task: 5: Actor1, Actor2` (оценка 1..5).

## diagramType: xychart
- Заголовок: `xychart` (опционально `horizontal`).
- Оси: `x-axis [a, b, c]` или `x-axis title 0 --> 10`.
- `y-axis` только числовая.
- Ряды: `bar [1,2,3]`, `line [1,2,3]`.

## diagramType: zenuml
- Заголовок: `zenuml`.
- Участники: явные строки или `A as Alice`, `@Actor`.
- Сообщения: `A->B: msg`.
- Вложенные вызовы: `A.method() { ... }`.
- Комментарии: `//` (не `%%`).
