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
        "2. Тема: ПРЕДПОЧИТАЙ встроенные темы (`default`, `neutral`, `dark`, `forest`) вместо `base`. Это делает код чище.\n" +
        "3. Цвета: Если встроенной темы недостаточно, используй `themeVariables` для точечных правок или `classDef` для акцентов.\n" +
        "4. Доступность: Избегай цветовых сочетаний, которые трудно различать.\n",
      flowchart:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
        "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
        "3. Формы: Используй разнообразные формы узлов.\n" +
        "4. Тема: Попробуй `theme: neutral` или `forest` для быстрого результата.\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Используй 'classDef' только для семантического выделения (например, 'error', 'success').\n",
      graph:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Обязательно группируй логически связанные узлы в `subgraph` с понятными заголовками.\n" +
        "2. Макет: Подбери оптимальное направление (`direction TB` или `LR`).\n" +
        "3. Формы: Используй разнообразные формы узлов.\n" +
        "4. Тема: Попробуй `theme: neutral` или `forest` для быстрого результата.\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Используй 'classDef' только для семантического выделения.\n",
      classdiagram:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Структура: Группируй классы по пакетам (namespace).\n" +
        "2. Тема: `theme: default` или `neutral` обычно выглядят лучше всего для классов.\n\n" +
        "ВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
        "- Активно используй 'classDef' и ':::' для стилизации классов.\n",
      auto:
        "СТРАТЕГИЯ УЛУЧШЕНИЯ:\n" +
        "1. Группировка: Если диаграмма позволяет, используй `subgraph` или `box`.\n" +
        "2. Тема: Используй одну из встроенных тем (`neutral`, `forest`, `default`) в Frontmatter config:\n" +
        "```yaml\n" +
        "---\n" +
        "config:\n" +
        "  theme: neutral\n" +
        "---\n" +
        "```\n" +
        "Не усложняй `themeVariables` без необходимости.\n",
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
          "- Для глобальных настроек цветов используй Frontmatter config (в начале файла):\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  theme: base\n" +
          "  themeVariables:\n" +
          "    primaryColor: \"...\"\n" +
          "---\n" +
          "```\n",
        sequencediagram:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй 'rect rgb(r, g, b) ... end' для выделения логических блоков цветом.\n" +
          "- Используй Frontmatter config для глобальной темы:\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  theme: base\n" +
          "  themeVariables:\n" +
          "    actorBorder: \"...\"\n" +
          "---\n" +
          "```\n" +
          "- Можно использовать 'actor', 'participant' и 'box' для группировки.\n",
        gantt:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй Frontmatter config для настройки цветов:\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  theme: base\n" +
          "  gantt:\n" +
          "    titleTopMargin: 25\n" +
          "---\n" +
          "```\n",
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
          "- Настраивай цвета веток только через `themeVariables` в Frontmatter config:\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  theme: base\n" +
          "  themeVariables:\n" +
          "    git0: \"#ff0000\"\n" +
          "---\n" +
          "```\n",
        pie:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Настраивай цвета только через `themeVariables` в Frontmatter config:\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  theme: base\n" +
          "  themeVariables:\n" +
          "    pie1: \"#ff0000\"\n" +
          "---\n" +
          "```\n",
        journey:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в Frontmatter config.\n",
        timeline:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` (cScale0, ...) в Frontmatter config.\n",
        zenuml:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в Frontmatter config.\n",
        sankey:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` и `sankey` в Frontmatter config:\n" +
          "```yaml\n" +
          "---\n" +
          "config:\n" +
          "  sankey:\n" +
          "    linkColor: gradient\n" +
          "---\n" +
          "```\n",
        xy:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables.xyChart` в Frontmatter config.\n" +
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
          "- Стилизация квадрантов и осей через `themeVariables` в Frontmatter config.\n",
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
          "- Стилизация через `themeVariables` и `kanban` в Frontmatter config.\n",
        architecture:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` в Frontmatter config.\n" +
          "- Стиль элементов определяется типом (e.g., `(cloud)`, `(database)`).\n",
        packet:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables.packet` в Frontmatter config.\n",
        radar:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- ЗАПРЕЩЕНО использовать 'classDef'.\n" +
          "- Стилизация через `themeVariables` (cScale0...) и `themeVariables.radar` в Frontmatter config.\n",
        treemap:
          common +
          "\nВАЖНО ПО СИНТАКСИСУ СТИЛЕЙ:\n" +
          "- Используй `:::class` для стилизации узлов.\n" +
          "- Используй `classDef`.\n" +
          "- Стилизация через `themeVariables` и `treemap` в Frontmatter config.\n",
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
    system: (diagramTypeLabel) => // Renamed parameter to be clearer
      "Ты эксперт по отладке Mermaid.js (Syntax Repair Agent).\n" +
      "Твоя ЕДИНСТВЕННАЯ цель: сделать код валидным, сохранив структуру.\n\n" +
      "ПРАВИЛА ИСПРАВЛЕНИЯ:\n" +
      "1. СТРУКТУРА: Не меняй узлы, связи и тексты. Используй 'Reference structure' как эталон логики.\n" +
      "2. СИНТАКСИС: Исправь синтаксические ошибки в соответствии с типом диаграммы.\n" +
      "3. КОНТЕКСТ ТИПА: Учитывай, что это диаграмма типа: " + (diagramTypeLabel || "Mermaid") + ".\n\n" +
      "Отвечай строго блоком ```mermaid ... ```. Никаких объяснений.",
    user: (diagramTypeLabel, structureCode, sanitizedBadCode, errors, docsContext) => {
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

      const docsBlock =
        docsContext && typeof docsContext === "string" && docsContext.trim()
          ? [
              "Relevant Mermaid Documentation:",
              docsContext.trim(),
              "",
            ].join("\n")
          : "";

      return (
        `Diagram type: ${diagramTypeLabel}.\nFix styling syntax errors.\n\n` +
        docsBlock + 
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
