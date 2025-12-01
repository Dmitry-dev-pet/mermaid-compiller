export const prompts = {
  structure: {
    system: (selectedType) => {
      let prompt =
        "Ты помощник, который генерирует только валидный код диаграмм Mermaid. " +
        "На этом шаге сосредоточься только на структуре (сущности, связи, кардинальности) и используй максимально простое оформление без тем, цветов и сложных стилей. " +
        "Отвечай строго в таком формате: сначала блок ```mermaid ... ``` с кодом диаграммы, " +
        "затем на новой строке 'RU_SUMMARY:' и одну-две короткие фразы по-русски, " +
        "кратко описывающие, что изображает диаграмма.";

      if (selectedType !== "auto") {
        prompt += `\n\nВАЖНО: Пользователь явно запросил тип диаграммы: ${selectedType}. Ты ОБЯЗАН сгенерировать диаграмму именно этого типа.`;
      }
      return prompt;
    },
    user: (promptMessage, contextDiagramCode) =>
      contextDiagramCode
        ? `${promptMessage}\n\nCurrent Mermaid diagram:\n${contextDiagramCode}`
        : promptMessage,
  },
  style: {
    strategies: {
      common:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Читаемость: Сделай диаграмму аккуратной и понятной.\n" +
        "2. Цвета: Используй гармоничную палитру с ВЫСОКИМ КОНТРАСТОМ (читаемый текст на фоне).\n" +
        "3. Доступность: Избегай цветовых сочетаний, которые трудно различать (например, красный/зеленый).\n",
      flowchart:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
        "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
        "3. Формы: Используй разнообразные формы узлов (цилиндры [()], ромбы {}, круги ()) для семантики.\n" +
        "4. Цвета: Используй палитру с ВЫСОКИМ КОНТРАСТОМ (читаемый текст). Избегай сочетаний красный/зеленый.\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Активно используй 'classDef' и оператор ':::' для цветового кодирования. Делай стили контрастными.\n",
      graph:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
        "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
        "3. Формы: Используй разнообразные формы узлов (цилиндры [()], ромбы {}, круги ()) для семантики.\n" +
        "4. Цвета: Используй палитру с ВЫСОКИМ КОНТРАСТОМ (читаемый текст). Избегай сочетаний красный/зеленый.\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Активно используй 'classDef' и оператор ':::' для цветового кодирования. Делай стили контрастными.\n",
      classdiagram:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Структура: Группируй классы по пакетам (namespace), если это уместно.\n" +
        "2. Цвета: Используй палитру с ВЫСОКИМ КОНТРАСТОМ (читаемый текст).\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Активно используй 'classDef' и ':::' для стилизации классов.\n" +
        "- Используй cssClass \"ClassName\" \"className\" для привязки стилей.\n",
      auto:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Если диаграмма (flowchart) позволяет, используй `subgraph`.\n" +
        "2. Макет: Подбери `direction TB` или `LR`.\n" +
        "3. Цвета: Используй палитру с ВЫСОКИМ КОНТРАСТОМ (читаемый текст).\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Для 'graph'/'flowchart': Используй 'classDef' и ':::'.\n" +
        "- Для остальных (erDiagram, sequence, gantt): ЗАПРЕЩЕНО использовать 'classDef' внутри узлов. Используй %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n",
    },
    getStrategy: function (diagramType) {
      const type = (diagramType || "auto").toLowerCase();
      const common = this.strategies.common;
      const specific = {
        erdiagram:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй 'classDef' и оператор ':::' для стилизации сущностей.\n" +
          "- ОБЯЗАТЕЛЬНО применяй классы к сущностям: `ENTITY:::myClass`.\n" +
          "- Для глобальных настроек цветов используй директиву инициализации: %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n",
        sequencediagram:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй 'rect rgb(r, g, b) ... end' для выделения логических блоков цветом.\n" +
          "- Используй директиву инициализации для глобальной темы: %%{init: {'theme': 'base', 'themeVariables': { ... }}}%%.\n" +
          "- Можно использовать 'actor', 'participant' и 'box' для группировки.\n",
        gantt:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй директиву инициализации: %%{init: {'theme': 'base', 'gantt': { ... }}}%% для настройки цветов.\n",
        state:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Можно использовать 'classDef' и ':::' для стилизации состояний.\n" +
          "- Поддерживаются стили линий переходов (linkStyle).\n",
        statediagram:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Можно использовать 'classDef' и ':::' для стилизации состояний.\n",
        "statediagram-v2":
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Можно использовать 'classDef' и ':::' для стилизации состояний.\n",
        mindmap:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй отступы для иерархии.\n" +
          "- Поддерживается синтаксис `:::myClass` для узлов.\n" +
          "- Можно добавлять иконки: `::icon(fa fa-star)`.\n",
        gitgraph:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Настраивай цвета веток только через `themeVariables` (git0, git1, ... git7) в директиве `%%{init: ... }%%`.\n",
        pie:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Настраивай цвета и толщину линий только через `themeVariables` в директиве `%%{init: ... }%%`.\n",
        journey:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в директиве `%%{init: ... }%%`.\n",
        timeline:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` (cScale0, cScale1, ...) в директиве `%%{init: ... }%%`.\n",
        zenuml:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в директиве `%%{init: ... }%%`.\n",
        sankey:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` и `config.sankey` в директиве `%%{init: ... }%%`.\n" +
          "- Цвета связей через `sankey.linkColor`.\n",
        xy:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables.xyChart` в директиве `%%{init: ... }%%`.\n" +
          "- Цвета линий/столбцов через `plotColorPalette`.\n",
        block:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй `classDef` и `class A className`.\n" +
          "- Используй `style ID key:value,key:value` для индивидуальных стилей.\n" +
          "- Помни про `columns` для контроля расположения блоков.\n",
        quadrant:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй `classDef` и `:::className` для точек.\n" +
          "- Стилизация квадрантов и осей через `themeVariables` в директиве `%%{init: ... }%%`.\n",
        requirement:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй `classDef` и `class NAME className` или `NAME:::className`.\n" +
          "- Используй `style NAME key:value` для индивидуальных стилей.\n",
        c4:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Используй `UpdateElementStyle(elementName, $key=value)` и `UpdateRelStyle(from, to, $key=value)`.\n" +
          "- Для макета используй `UpdateLayoutConfig($c4ShapeInRow=NUM)`.\n",
        kanban:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` и `config.kanban` в директиве `%%{init: ... }%%`.\n",
        architecture:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в директиве `%%{init: ... }%%`.\n" +
          "- Стиль элементов определяется типом (e.g., `(cloud)`, `(database)`).\n",
        packet:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables.packet` в директиве `%%{init: ... }%%`.\n",
        radar:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` (cScale0, cScale1, ...) и `themeVariables.radar` в директиве `%%{init: ... }%%`.\n",
        treemap:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй `:::class` для стилизации узлов.\n" +
          "- Используй `classDef`.\n" +
          "- Стилизация через `themeVariables` и `config.treemap` в директиве `%%{init: ... }%%`.\n",
      };

      return this.strategies[type] || specific[type] || this.strategies.auto;
    },
    system: function (strategyInstruction) {
      return (
        "Ты помощник, который улучшает только визуальное оформление уже валидной диаграммы Mermaid. " +
        "Не меняй сущности, связи и кардинальности. " +
        "Твоя задача - сделать диаграмму красивой, профессиональной и максимально читаемой.\n\n" +
        strategyInstruction +
        "\nОтвечай в том же формате: блок ```mermaid ... ``` и затем строка 'RU_SUMMARY:'."
      );
    },
    user: (diagramCode, docsContext, userIntent) => {
      const intentBlock =
        userIntent && userIntent.trim()
          ? `User intent:\n${userIntent.trim()}\n\n`
          : "";
      let content =
        intentBlock +
        "Here is an existing valid Mermaid diagram that describes the structure (entities and relations).\n" +
        "Do not change the logical structure, only improve visual styling using Mermaid features (themes, classDef, layout, directions, etc.).\n\n" +
        "```mermaid\n" +
        diagramCode +
        "\n```\n";

      if (docsContext && typeof docsContext === "string" && docsContext.trim()) {
        content +=
          "\nHere is documentation and styling preferences context (including possible Mermaid features and desired style):\n" +
          docsContext.trim() +
          "\n";
      }
      return content;
    },
  },
  fix: {
    system: (syntaxRules) =>
      "Ты эксперт по отладке Mermaid.js (Syntax Repair Agent).\n" +
      "Твоя ЕДИНСТВЕННАЯ цель: сделать код валидным, сохранив структуру.\n\n" +
      "ПРАВИЛА ИСПРАВЛЕНИЯ:\n" +
      "1. СТРУКТУРА: Не меняй узлы, связи и тексты. Используй 'Reference structure' как эталон логики.\n" +
      "2. СТИЛИ: Попробуй исправить синтаксис стиля (кавычки, скобки).\n" +
      "3. КРИТИЧЕСКИЙ ОТКАТ: Если стиль использует недопустимый для этого типа диаграммы синтаксис (например, `classDef` в ER/Sequence/Gantt) — УДАЛИ ЭТИ СТРОКИ СТИЛЕЙ ПОЛНОСТЬЮ.\n" +
      "4. КОНТЕКСТ ТИПА: Учитывай специфичные правила ниже.\n\n" +
      syntaxRules +
      "\n\n" +
      "Отвечай строго блоком ```mermaid ... ```. Никаких объяснений.",
    user: (diagramTypeLabel, structureCode, sanitizedBadCode, errors) => {
      const referenceBlock = structureCode
        ? [
            "Reference structure (LOGIC MUST MATCH THIS):",
            "",
            "```mermaid",
            structureCode,
            "```",
            "",
          ].join("\n")
        : "";

      return (
        `Diagram type: ${diagramTypeLabel}.\nFix styling syntax errors.\n\n` +
        referenceBlock +
        "Invalid Mermaid code (BROKEN STYLES): \n\n" +
        "```mermaid\n" +
        sanitizedBadCode +
        "\n```\n\n" +
        "Parser Errors:\n" +
        errors.join("\n") +
        "\n\nACTION: Fix the syntax. If styles are illegal/unfixable, DELETE THEM to make the diagram render."
      );
    },
  },
  compose: (basePrompt, docsContext, validationErrors, previousCode) => {
    const trimmedBase = basePrompt.trim();
    const trimmedDocs =
      docsContext && typeof docsContext === "string" ? docsContext.trim() : "";
    const finalPrompt = trimmedDocs
      ? [trimmedBase, "", "Relevant Mermaid documentation:", trimmedDocs].join("\n")
      : trimmedBase;

    if (previousCode && !validationErrors.length) {
      return `${finalPrompt}\n\nYou are updating an existing Mermaid diagram. Here is the current diagram:\n${previousCode}\n\nPlease update this diagram according to the new instructions while keeping it syntactically valid.`;
    }

    if (validationErrors.length && previousCode) {
      return `${finalPrompt}\n\nThe previous Mermaid code was invalid.\nErrors: ${validationErrors.join(
        "; ",
      )}\nPlease fix the diagram while keeping the intent.`;
    }

    return finalPrompt;
  },
};
