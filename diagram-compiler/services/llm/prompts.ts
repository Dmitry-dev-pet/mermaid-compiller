import type { DiagramType } from '../../types';
import type { PromptLanguage } from './prompts/types';
import { ANALYZE_TEMPLATES } from './prompts/analyze';
import { CHAT_TEMPLATES } from './prompts/chat';
import { CHAT_DIAGRAM_TEMPLATES } from './prompts/chatDiagram';
import { CHAT_NOTEBOOK_TEMPLATES } from './prompts/chatNotebook';
import { FIX_TEMPLATES } from './prompts/fix';
import { GENERATE_TEMPLATES } from './prompts/generate';
import { PLAN_NOTEBOOK_TEMPLATES } from './prompts/planNotebook';
import { SUMMARY_TEMPLATES } from './prompts/summary';
import { MAIN_DIAGRAM_TYPES } from '../../utils/diagramTypes';

export type PromptMode = 'generate' | 'fix' | 'chat' | 'chat_diagram' | 'chat_notebook' | 'analyze' | 'plan_notebook' | 'summary';

type PromptArgs = {
  diagramType?: DiagramType;
  allowedDiagramTypes?: DiagramType[] | null;
  docsContext: string;
  language: string;
};

type TemplateValues = {
  typeRule: string;
  diagramTypeValues: string;
  languageInstruction: string;
  docsContext: string;
};

const PROMPT_TEMPLATES: Record<PromptLanguage, Record<PromptMode, string>> = {
  English: {
    generate: GENERATE_TEMPLATES.English,
    fix: FIX_TEMPLATES.English,
    chat: CHAT_TEMPLATES.English,
    chat_diagram: CHAT_DIAGRAM_TEMPLATES.English,
    chat_notebook: CHAT_NOTEBOOK_TEMPLATES.English,
    analyze: ANALYZE_TEMPLATES.English,
    plan_notebook: PLAN_NOTEBOOK_TEMPLATES.English,
    summary: SUMMARY_TEMPLATES.English,
  },
  Russian: {
    generate: GENERATE_TEMPLATES.Russian,
    fix: FIX_TEMPLATES.Russian,
    chat: CHAT_TEMPLATES.Russian,
    chat_diagram: CHAT_DIAGRAM_TEMPLATES.Russian,
    chat_notebook: CHAT_NOTEBOOK_TEMPLATES.Russian,
    analyze: ANALYZE_TEMPLATES.Russian,
    plan_notebook: PLAN_NOTEBOOK_TEMPLATES.Russian,
    summary: SUMMARY_TEMPLATES.Russian,
  },
};

const renderTemplate = (template: string, values: TemplateValues) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: keyof TemplateValues) => values[key] ?? '');

const resolvePromptLanguage = (language: string): PromptLanguage => {
  const normalized = language.trim().toLowerCase();
  if (normalized.includes('ru') || normalized.includes('рус')) return 'Russian';
  if (normalized.includes('en') || normalized.includes('анг')) return 'English';
  return language === 'Russian' ? 'Russian' : 'English';
};

const shouldIncludeLanguageInstruction = (language: string) => language !== 'auto';

const getLanguageInstruction = (language: string, promptLanguage: PromptLanguage) => {
  if (!shouldIncludeLanguageInstruction(language)) return '';
  return promptLanguage === 'Russian'
    ? '\nВАЖНО: отвечай на русском.'
    : '\nIMPORTANT: Respond in English.';
};

const getDiagramTypeValues = (
  diagramType: DiagramType | undefined,
  allowedDiagramTypes: DiagramType[] | null | undefined,
  mode: PromptMode,
  promptLanguage: PromptLanguage
) => {
  if (mode === 'chat_notebook') {
    if (allowedDiagramTypes?.length) return allowedDiagramTypes.join(', ');
    return promptLanguage === 'Russian'
      ? 'любой поддерживаемый Mermaid diagramType (пример: flowchart, sequence, er)'
      : 'any supported Mermaid diagramType (e.g. flowchart, sequence, er)';
  }

  if ((mode === 'chat' || mode === 'chat_diagram') && allowedDiagramTypes?.length) {
    return allowedDiagramTypes.join(', ');
  }

  if (diagramType && diagramType !== 'auto') return diagramType;

  return promptLanguage === 'Russian'
    ? 'flowchart, sequence, er (или другой поддерживаемый Mermaid diagramType)'
    : 'flowchart, sequence, er (or another supported Mermaid diagramType)';
};

const getDiagramTypeRule = (
  diagramType: DiagramType | undefined,
  allowedDiagramTypes: DiagramType[] | null | undefined,
  mode: 'generate' | 'chat' | 'chat_diagram' | 'chat_notebook',
  promptLanguage: PromptLanguage
) => {
  if (mode === 'chat_notebook') {
    if (diagramType === 'auto') {
      const list = (allowedDiagramTypes?.length ? allowedDiagramTypes : MAIN_DIAGRAM_TYPES);
      const mainSet = new Set<string>(MAIN_DIAGRAM_TYPES);
      const isMain =
        list.length === MAIN_DIAGRAM_TYPES.length
        && list.every((type) => mainSet.has(type));
      const listText = list.join(', ');
      return promptLanguage === 'Russian'
        ? [
            isMain
              ? `- Режим Main: в разделе Diagrams выбирай только из ${listText} (не обязательно все типы).`
              : `- Набор типов: в разделе Diagrams выбирай только из ${listText} (не обязательно все типы).`,
            '- НЕ используй другие типы диаграмм, даже если они кажутся уместными.',
          ].join('\n')
        : [
            isMain
              ? `- Main mode: in the Diagrams list choose only from ${listText} (not necessarily all types).`
              : `- Active set: in the Diagrams list choose only from ${listText} (not necessarily all types).`,
            '- Do NOT use other diagram types, even if they seem appropriate.',
          ].join('\n');
    }
    return '';
  }

  if ((mode === 'chat' || mode === 'chat_diagram') && diagramType === 'auto' && allowedDiagramTypes?.length) {
    const list = allowedDiagramTypes.join(', ');
    return promptLanguage === 'Russian'
      ? `ограничение типов: только ${list}.`
      : `allowed types: ${list}.`;
  }

  const sanitizeTypeRuleForGenerate = (rule: string) => {
    const patterns = promptLanguage === 'Russian'
      ? [
          /формат вывода/i,
          /верни только/i,
          /mermaid-код/i,
          /fenced/i,
          /код mermaid/i,
          /output/i,
        ]
      : [
          /format output/i,
          /return only/i,
          /mermaid code/i,
          /fenced/i,
          /output only/i,
        ];
    const nextLines = rule
      .split('\n')
      .filter((line) => !patterns.some((pattern) => pattern.test(line)));
    return nextLines.join('\n').trim();
  };
  const detailedTypeRulesRu: Partial<Record<DiagramType, string>> = {
    architecture: [
      'Цели:',
      '- Показать сервисы/ресурсы и связи между ними.',
      '- Сохранить понятную структуру с группами.',
      'Тип диаграммы:',
      '- Обязательно используй `architecture-beta`.',
      'Синтаксис:',
      '- Группы: `group id(icon)[Title]` (опционально `in parent`).',
      '- Сервисы: `service id(icon)[Title]` (опционально `in parent`).',
      '- Развилки: `junction id`.',
      '- Ребра: `A:R -- L:B` (стороны `L|R|T|B`, стрелки через `<`/`>`).',
      '- Ребра от групп: используй `service{group}`.',
      'Стиль и сложность:',
      '- Делай схему лаконичной; группируй родственные сервисы.',
      '- Не добавляй стили/темы/цвета без явного запроса.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Все группы/сервисы объявлены до использования в ребрах.',
      '- Нет лишнего текста вне Mermaid-кода.',
    ].join('\n'),
    block: [
      'Цели:',
      '- Дать автору контроль над расположением блоков.',
      '- Показать компоненты и связи в упрощенном виде.',
      'Тип диаграммы:',
      '- Обязательно используй `block` (не `block-beta`).',
      'Синтаксис:',
      '- Разметка: `columns N`.',
      '- Блоки: `id["Label"]`, ширины `id:2`.',
      '- Вложенные блоки: `block:group ... end`.',
      '- Связи: `A --> B`.',
      'Стиль и сложность:',
      '- Располагай блоки логично, избегай перегрузки.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Нет `block-beta`, корректно закрыты `end`.',
    ].join('\n'),
    c4: [
      'Цели:',
      '- Описать контекст/контейнеры/компоненты по C4.',
      'Тип диаграммы:',
      '- Используй один из заголовков: `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`.',
      'Синтаксис:',
      '- Элементы: `Person`, `System`, `Container`, `Component` и варианты `_Db`, `_Queue`, `_Ext`.',
      '- Границы: `Boundary`, `Enterprise_Boundary`, `System_Boundary`.',
      '- Связи: `Rel`, `BiRel`, `RelIndex`.',
      '- Порядок строк влияет на layout.',
      'Стиль и сложность:',
      '- Держи уровень абстракции консистентным.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Использован корректный C4 заголовок.',
    ].join('\n'),
    class: [
      'Цели:',
      '- Показать классы, их атрибуты, методы и связи.',
      'Тип диаграммы:',
      '- Обязательно используй `classDiagram`.',
      'Синтаксис:',
      '- Класс: `class Name`.',
      '- Члены: `Class : +type name` или блок `{ ... }`.',
      '- Связи: `<|--` наследование, `*--` композиция, `o--` агрегация, `..>` зависимость, `-->` ассоциация.',
      'Стиль и сложность:',
      '- Не перегружай диаграмму деталями.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Имена классов корректны, связи читаемы.',
    ].join('\n'),
    er: [
      'Цели:',
      '- Показать сущности и отношения с кардинальностями.',
      'Тип диаграммы:',
      '- Обязательно используй `erDiagram`.',
      'Синтаксис:',
      '- Связи: `A ||--o{ B : label`.',
      '- Кардинальности: `||`, `|{`, `}o` и т.д.',
      '- Атрибуты: `ENTITY { type name }`.',
      '- Тексты с пробелами — в кавычках.',
      'Стиль и сложность:',
      '- Ограничься ключевыми сущностями.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Кардинальности корректны, метки связей читаемы.',
    ].join('\n'),
    flowchart: [
      'Цели:',
      '- Преобразовать запрос в читаемую flowchart-диаграмму.',
      '- Покрыть ключевые шаги и связи.',
      'Тип диаграммы:',
      '- Обязательно используй `flowchart` и корректный direction.',
      'Синтаксис:',
      '- Заголовок: `flowchart TD` (или `LR`, `TB`, `BT`, `RL`).',
      '- Узлы: `id[Text]`, `id((Text))`, `id{Decision}`.',
      '- Избегай круглых скобок в тексте узла; используй тире/двоеточие.',
      '- Связи: `-->`, `-.->`, `==>`; подписи: `A -->|label| B`.',
      '- Subgraph: `subgraph Name ... end`.',
      '- Слово `end` в тексте узла — лучше писать как `End`/`END`.',
      'Стиль и сложность:',
      '- Делай схему лаконичной; не перегружай деталями.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Нет лишнего текста вне Mermaid-кода.',
    ].join('\n'),
    gantt: [
      'Цели:',
      '- Показать задачи и сроки на временной шкале.',
      'Тип диаграммы:',
      '- Обязательно используй `gantt`.',
      'Синтаксис:',
      '- Поля: `title`, `dateFormat`, `section`.',
      '- Задачи: `Task : id, 2024-01-01, 5d` или `Task : after id, 5d`.',
      '- Теги: `done`, `active`, `crit`, `milestone`.',
      'Стиль и сложность:',
      '- Группируй задачи по секциям.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Корректный `dateFormat`, задачи читаемы.',
    ].join('\n'),
    gitGraph: [
      'Цели:',
      '- Отобразить ветки и историю коммитов.',
      'Тип диаграммы:',
      '- Обязательно используй `gitGraph`.',
      'Синтаксис:',
      '- Команды: `commit`, `branch name`, `checkout name`, `merge name`.',
      '- Атрибуты: `commit id: "X" type: HIGHLIGHT tag: "v1"`.',
      'Стиль и сложность:',
      '- Держи историю компактной.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Нет `checkout` на несуществующую ветку.',
    ].join('\n'),
    kanban: [
      'Цели:',
      '- Показать стадии процесса и задачи в колонках.',
      'Тип диаграммы:',
      '- Обязательно используй `kanban`.',
      'Синтаксис:',
      '- Колонки: `columnId[Title]`.',
      '- Карточки (с отступом): `taskId[Task]`.',
      '- Метаданные: `@{ assigned: "x", ticket: KEY-1, priority: "High" }`.',
      'Стиль и сложность:',
      '- Не делай слишком много колонок.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Соблюдены отступы, id уникальны.',
    ].join('\n'),
    mindmap: [
      'Цели:',
      '- Отразить иерархию идей или тем.',
      'Тип диаграммы:',
      '- Обязательно используй `mindmap`.',
      'Синтаксис:',
      '- Иерархия задается отступами.',
      '- Формы как во flowchart: `[]`, `()`, `(( ))`, `{{ }}`.',
      '- Иконки: `::icon(...)` (экспериментально).',
      'Стиль и сложность:',
      '- Не перегружай карту большим числом веток.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Отступы консистентны.',
    ].join('\n'),
    packet: [
      'Цели:',
      '- Показать структуру пакета и битовые поля.',
      'Тип диаграммы:',
      '- Обязательно используй `packet`.',
      'Синтаксис:',
      '- Поля: `0-15: "Label"` или `+8: "Label"`.',
      '- Опционально `title ...`.',
      'Стиль и сложность:',
      '- Держи поля компактными.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Диапазоны не перекрываются.',
    ].join('\n'),
    pie: [
      'Цели:',
      '- Показать доли категорий.',
      'Тип диаграммы:',
      '- Обязательно используй `pie`.',
      'Синтаксис:',
      '- Опционально: `showData`, `title`.',
      '- Данные: `"Label" : 42` (значения > 0).',
      'Стиль и сложность:',
      '- Количество сегментов умеренное.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Значения только положительные.',
    ].join('\n'),
    quadrantChart: [
      'Цели:',
      '- Разместить точки по двум осям и квадрантам.',
      'Тип диаграммы:',
      '- Обязательно используй `quadrantChart`.',
      'Синтаксис:',
      '- Оси: `x-axis Low --> High`, `y-axis Low --> High`.',
      '- Квадранты: `quadrant-1 ...` и т.д.',
      '- Точки: `Name: [0.3, 0.6]` (0..1).',
      'Стиль и сложность:',
      '- Ограничься ключевыми точками.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Все точки в диапазоне 0..1.',
    ].join('\n'),
    radar: [
      'Цели:',
      '- Сравнить несколько объектов по осям.',
      'Тип диаграммы:',
      '- Обязательно используй `radar-beta`.',
      'Синтаксис:',
      '- Оси: `axis id["Label"]`.',
      '- Кривые: `curve id["Label"]{1,2,3}`.',
      '- Опции: `max`, `min`, `graticule`, `ticks`, `showLegend`.',
      'Стиль и сложность:',
      '- Не перегружай большим числом серий.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Число значений совпадает с числом осей.',
    ].join('\n'),
    requirementDiagram: [
      'Цели:',
      '- Описать требования и связи между ними.',
      'Тип диаграммы:',
      '- Обязательно используй `requirementDiagram`.',
      'Синтаксис:',
      '- Требования: `requirement name { id: 1 text: ... risk: High verifymethod: Test }`.',
      '- Элементы: `element name { type: ... docref: ... }`.',
      '- Связи: `A - satisfies -> B`.',
      'Стиль и сложность:',
      '- Выделяй только ключевые требования.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Использованы допустимые значения risk/verifymethod.',
    ].join('\n'),
    sequence: [
      'Цели:',
      '- Отразить порядок взаимодействий между участниками.',
      'Тип диаграммы:',
      '- Обязательно используй `sequenceDiagram`.',
      'Синтаксис:',
      '- Участники: `participant`, `actor`.',
      '- Сообщения: `A->>B: msg`, `A-->>B: msg`.',
      '- Активности: `A->>+B` и `B-->>-A`.',
      '- Заметки: `Note right of A: ...`.',
      'Стиль и сложность:',
      '- Сохраняй логический порядок сообщений.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Участники определены и используются консистентно.',
    ].join('\n'),
    sankey: [
      'Цели:',
      '- Показать потоки между узлами.',
      'Тип диаграммы:',
      '- Обязательно используй `sankey`.',
      'Синтаксис:',
      '- Строки CSV: `source,target,value` (ровно 3 колонки).',
      '- Запятые в тексте — в кавычках.',
      'Стиль и сложность:',
      '- Не перегружай диаграмму большим числом линий.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Значения числовые, 3 колонки в каждой строке.',
    ].join('\n'),
    state: [
      'Цели:',
      '- Показать состояния и переходы системы.',
      'Тип диаграммы:',
      '- Обязательно используй `stateDiagram-v2`.',
      'Синтаксис:',
      '- Переходы: `A --> B: event`.',
      '- Старт/конец: `[*]`.',
      '- Составные состояния: `state X { ... }`.',
      'Стиль и сложность:',
      '- Держи диаграмму компактной.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Есть стартовое состояние `[*]`.',
    ].join('\n'),
    timeline: [
      'Цели:',
      '- Показать события во времени.',
      'Тип диаграммы:',
      '- Обязательно используй `timeline`.',
      'Синтаксис:',
      '- События: `Year : Event : Event`.',
      '- Доп. события на новых строках начинаются с `:`.',
      '- Разделы: `section Name`.',
      'Стиль и сложность:',
      '- Сохраняй хронологический порядок.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Формат `:` используется корректно.',
    ].join('\n'),
    treemap: [
      'Цели:',
      '- Визуализировать иерархию и доли категорий.',
      'Тип диаграммы:',
      '- Обязательно используй `treemap-beta`.',
      'Синтаксис:',
      '- Узлы: "Section".',
      '- Листья: "Leaf": 12.',
      '- Иерархия через отступы.',
      'Стиль и сложность:',
      '- Сохраняй понятную иерархию.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Значения есть только у листьев.',
    ].join('\n'),
    userJourney: [
      'Цели:',
      '- Показать путь пользователя по шагам.',
      'Тип диаграммы:',
      '- Обязательно используй `journey`.',
      'Синтаксис:',
      '- Разделы: `section Name`.',
      '- Задачи: `Task: 5: Actor1, Actor2` (оценка 1..5).',
      'Стиль и сложность:',
      '- Выделяй ключевые шаги.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Оценки в диапазоне 1..5.',
    ].join('\n'),
    xychart: [
      'Цели:',
      '- Построить линейный или столбчатый график.',
      'Тип диаграммы:',
      '- Обязательно используй `xychart`.',
      'Синтаксис:',
      '- Оси: `x-axis [a, b, c]` или `x-axis title 0 --> 10`.',
      '- `y-axis` только числовая.',
      '- Серии: `bar [...]`, `line [...]`.',
      'Стиль и сложность:',
      '- Не перегружай диаграмму большим числом серий.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Длины массивов соответствуют осям.',
    ].join('\n'),
    zenuml: [
      'Цели:',
      '- Использовать синтаксис ZenUML для последовательностей.',
      'Тип диаграммы:',
      '- Обязательно используй `zenuml`.',
      'Синтаксис:',
      '- Участники: строки с именами или `A as Alice`, `@Actor`.',
      '- Сообщения: `A->B: msg`.',
      '- Вложенные вызовы: `A.method() { ... }`.',
      'Стиль и сложность:',
      '- Держи сценарий компактным и логичным.',
      'Формат вывода:',
      '- Верни только Mermaid-код, без пояснений и без fenced code.',
      '- Ровно одна диаграмма и корректная директива типа в первой строке.',
      'Самопроверка (не выводить):',
      '- Все блоки `{}` закрыты.',
    ].join('\n'),
  };

  const blockGenerateHint = promptLanguage === 'Russian'
    ? 'Используй синтаксис block (не block-beta). Ноды задавай как id["Label"]. Используй block:group только для вложенных блоков и закрывай их end.'
    : 'Use block syntax (not block-beta). Define nodes as id["Label"]. Use block:group only for nested blocks and close them with end.';

  if (diagramType && diagramType !== 'auto') {
    if (promptLanguage === 'Russian') {
      if (mode === 'generate') {
        const detailed = detailedTypeRulesRu[diagramType];
        if (detailed) return sanitizeTypeRuleForGenerate(detailed);
        const base = `Вы ДОЛЖНЫ создать диаграмму типа ${diagramType}.`;
        return diagramType === 'block' ? `${base}\n${blockGenerateHint}` : base;
      }
      return `Предпочитаемый тип диаграммы: ${diagramType}.`;
    }

    if (mode === 'generate') {
      const base = `You MUST generate a ${diagramType} diagram.`;
      return diagramType === 'block' ? `${base}\n${blockGenerateHint}` : base;
    }
    return `Preferred Diagram Type: ${diagramType}.`;
  }

  return promptLanguage === 'Russian'
    ? "Если тип не указан, используй 'flowchart TD'."
    : "Default to 'flowchart TD' if unspecified.";
};

const getPlannerSelectionRule = (
  diagramType: DiagramType | undefined,
  allowedDiagramTypes: DiagramType[] | null | undefined,
  promptLanguage: PromptLanguage
) => {
  if (diagramType && diagramType !== 'auto') {
    return promptLanguage === 'Russian'
      ? `- Активен forcedDiagramType: ${diagramType}. Следуй ему строго.`
      : `- forcedDiagramType is active: ${diagramType}. Follow it strictly.`;
  }
  if (allowedDiagramTypes?.length) {
    const list = allowedDiagramTypes.join(', ');
    return promptLanguage === 'Russian'
      ? `- Активен набор allowedDiagramTypes: ${list}. Выбирай diagramType только из этого списка.`
      : `- allowedDiagramTypes is active: ${list}. Choose diagramType only from this list.`;
  }
  return '';
};

export const buildSystemPrompt = (mode: PromptMode, args: PromptArgs): string => {
  const promptLanguage = resolvePromptLanguage(args.language);
  const template = PROMPT_TEMPLATES[promptLanguage][mode];

  const typeRule = mode === 'plan_notebook'
    ? getPlannerSelectionRule(args.diagramType, args.allowedDiagramTypes, promptLanguage)
    : (mode === 'generate' || mode === 'chat' || mode === 'chat_diagram' || mode === 'chat_notebook'
      ? getDiagramTypeRule(args.diagramType, args.allowedDiagramTypes, mode, promptLanguage)
      : '');

  const languageInstruction = getLanguageInstruction(args.language, promptLanguage);
  const diagramTypeValues = getDiagramTypeValues(args.diagramType, args.allowedDiagramTypes, mode, promptLanguage);
  const docsContext = args.docsContext;

  return renderTemplate(template, {
    typeRule,
    diagramTypeValues,
    languageInstruction,
    docsContext,
  });
};
