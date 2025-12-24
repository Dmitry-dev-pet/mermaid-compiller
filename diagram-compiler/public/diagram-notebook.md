# Diagram notebook

Это обычный Markdown файл с несколькими Mermaid-блоками.  
В приложении можно вставить содержимое целиком в Editor, выбрать нужный блок вкладками (`Mermaid 1`, `Mermaid 2`, …) и делать `Chat`/`Build` для каждого блока отдельно.

Ниже — подробное «описание проекта через схемы». Диаграммы намеренно избыточны: их удобно по одной улучшать через чат (`Analyze/Chat/Build`) и смотреть, как меняется архитектурная «карта».

---

## Diagram 1 — Структура репозитория (high-level)

Зачем: быстро понять «что где лежит» и какие части связаны между собой.

Как читать:
- `diagram-compiler/` — основное SPA приложение.
- `public/mermaid-docs/` — подмножество Mermaid-доков для контекста LLM.
- `mermaid-docs/` в корне — полный снапшот доков (версия фиксируется в `diagram-compiler/constants.ts`).
- `server.js` обслуживает собранный `diagram-compiler/dist`.

```mermaid
flowchart LR
  subgraph Root["repo root"]
    pkg["package.json"]
    server["server.js"]
    docs["docs/"]
    md_docs["mermaid-docs/"]

    subgraph Compiler["diagram-compiler/ SPA"]
      components["components/"]
      hooks["hooks/"]
      services["services/"]
      public["public/"]
      dist["dist/"]

      subgraph Hooks["hooks/"]
        core["core/"]
        studio["studio/"]
      end

      subgraph Services["services/"]
        llm["llm/"]
        history["history/"]
        mermaidSvc["mermaidService.ts"]
        docsCtx["docsContextService.ts"]
      end

      subgraph Public["public/"]
        md_subset["mermaid-docs/ subset"]
        notebook["diagram-notebook.md"]
      end
    end
  end

  pkg -- "scripts" --> Compiler
  server --> dist
  docsCtx --> md_subset
```

---

## Diagram 2 — Архитектура SPA (UI → hooks → services)

Зачем: увидеть слои приложения и «центральную точку» оркестрации.

Как читать:
- UI-компоненты (колонки) не держат бизнес-логику — они дергают хуки.
- `useDiagramStudio` — главный оркестратор (собирает состояние, вызывает сервисы, прокидывает данные в preview).
- Сервисы отделяют интеграции: LLM, Mermaid parse/render, docs context, история, экспорт.
- `localStorage` — только настройки/ключи; история и ревизии — в `IndexedDB`.

```mermaid
flowchart TD
  User([User])

  subgraph UI["UI (components)"]
    Editor[EditorColumn]
    Chat[ChatColumn]
    Preview[PreviewColumn]
  end

  subgraph Hooks["Hooks (studio/core)"]
    Studio[useDiagramStudio]
    BuildDocs[useBuildDocs]
    UseHistory[useHistory]
  end

  subgraph Services["Services"]
    Mermaid[mermaidService]
    LLM[llm/*]
    Docs[docsContextService]
    History[history/*]
    Export[export/*]
  end

  subgraph Storage["Local storage"]
    LS[(localStorage)]
    IDB[(IndexedDB)]
  end

  User -->|edit| Editor
  User -->|prompt| Chat

  Editor --> Studio
  Chat --> Studio
  Studio -->|render request| Mermaid -->|SVG/errors| Preview

  Studio -->|docs needed| BuildDocs --> Docs
  Studio -->|LLM calls| LLM
  Studio -->|revisions| UseHistory --> History --> IDB

  LLM -. keys/models .-> LS
  Export -. download helpers .-> Preview
```

---

## Diagram 3 — Пайплайн Build (sequence)

Зачем: пошагово проследить, что происходит при нажатии `Build` — от клика до превью и сохранения ревизии.

Ключевые моменты:
- Контекст документации подмешивается опционально (в зависимости от режима/переключателя).
- Валидация Mermaid обязательна: `parse`/`autoFix` → либо SVG, либо диагностическое сообщение.
- Ревизия сохраняется всегда (и для валидного результата, и для ошибки) — чтобы можно было воспроизвести состояние.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant E as EditorColumn
  participant C as ChatColumn
  participant S as useDiagramStudio
  participant A as studioActions
  participant D as docsContextService
  participant L as llmService
  participant M as mermaidService
  participant P as PreviewColumn
  participant H as historyService
  participant DB as IndexedDB

  U->>E: edits spec/code
  U->>C: presses Build
  C->>S: build(spec, settings)
  S->>A: dispatch(build)

  opt Docs context enabled
    A->>D: selectContext(diagramType, query)
    D-->>A: docsSnippets
  end

  A->>L: generateMermaid(spec + docs + history)
  L-->>A: mermaidCode (candidate)

  A->>M: validate + autoFix(mermaidCode)
  alt Valid
    M-->>A: {svg, warnings}
    A->>P: render(svg)
  else Invalid
    M-->>A: error + hints
    A->>P: show error
  end

  A->>H: saveRevision(spec, mermaidCode, status)
  H->>DB: put(revision)
  DB-->>H: ok
```

---

## Diagram 4 — Чат (Analyze → Chat → Build) и намерения

Зачем: различать режимы общения с моделью и понимать, почему кнопки/поток действий отличаются.

Как читать:
- `Analyze` — структурирует проблему/требования, не обязан генерировать Mermaid-код.
- `Chat` — объясняет/уточняет/предлагает варианты.
- `Build/Fix` — формирует промпт с контекстом, генерирует кандидата Mermaid и прогоняет валидацию/исправления.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant C as ChatColumn
  participant S as useDiagramStudio
  participant I as IntentDetector
  participant P as PromptBuilder
  participant D as docsContextService
  participant L as llmService
  participant M as mermaidService

  U->>C: types message
  C->>S: enqueueMessage(text)
  S->>I: detectIntent(text, mode)
  I-->>S: intent=Analyze|Chat|Build|Fix

  alt Analyze
    S->>L: analyze(text, context)
    L-->>S: structured findings
  else Chat
    S->>L: chat(text, context)
    L-->>S: answer
  else Build/Fix
    S->>P: buildPrompt()
    P->>D: pickDocsSnippets()
    D-->>P: docs
    P-->>S: finalPrompt
    S->>L: generateMermaid(finalPrompt)
    L-->>S: candidate code
    S->>M: validate/autoFix
    M-->>S: valid/error
  end
```

---

## Diagram 5 — Жизненный цикл диаграммы (state machine)

Зачем: понимать состояния, в которых может быть диаграмма, и почему UI иногда «не дает» нажимать кнопки (например, во время `Building`).

Подсказки:
- `Dirty` означает «есть несохраненные изменения относительно последнего compiled/valid».
- `Invalid` не тупик: `Fixing` возвращает в `Candidate`.
- `Exporting` — отдельная ветка, не меняет содержимое диаграммы.

```mermaid
stateDiagram-v2
  [*] --> Empty

  Empty --> Editing: user types
  Editing --> Dirty: spec changed

  Dirty --> Building: Build pressed
  Building --> Candidate: LLM returns
  Candidate --> Valid: mermaid.parse ok
  Candidate --> Invalid: parse error

  Invalid --> Fixing: Fix pressed / autoFix
  Fixing --> Candidate

  Valid --> Rendering: render(svg)
  Rendering --> Displayed

  Displayed --> Dirty: user edits
  Displayed --> Exporting: SVG/PNG
  Exporting --> Displayed

  Displayed --> [*]: new project
```

---

## Diagram 6 — История и ревизии (пример ER-модели)

Зачем: понять, какие сущности удобно хранить в `IndexedDB`, чтобы поддерживать историю, восстановление, маркеры ошибок и контекст чата.

Как читать:
- `SESSION` группирует одну «работу» пользователя (проект/сессию).
- `REVISION` — основной атом истории (spec + mermaidCode + статус).
- `MESSAGE` — сообщения чата, привязанные к ревизии (полезно для «почему так получилось»).
- `MARKER` — структурированные ошибки/подсказки (line/column) для подсветки и навигации.

```mermaid
erDiagram
  SESSION ||--o{ REVISION : contains
  REVISION ||--o{ MESSAGE : includes
  REVISION ||--o{ MARKER : has

  SESSION {
    string id
    datetime createdAt
    string appVersion
  }

  REVISION {
    string id
    string sessionId
    int index
    datetime createdAt
    string diagramType
    string sourceSpec
    string mermaidCode
    string status
  }

  MESSAGE {
    string id
    string revisionId
    datetime createdAt
    string role
    string text
  }

  MARKER {
    string id
    string revisionId
    string kind
    int line
    int column
    string message
  }
```

---

## Diagram 7 — Build Docs / контекст документации

Зачем: показать, как подмешивается контекст Mermaid-документации в запрос к LLM.

Как читать:
- Источник может быть «легким» (subset в `public/mermaid-docs`) или «полным» (snapshot в `mermaid-docs/<version>`).
- Важно не «скормить все»: сначала ранжирование, затем упаковка в контекстное окно (chunking/limit).
- Результат идет в `PromptBuilder`, затем в `llmService`.

```mermaid
flowchart TD
  User([User]) --> Toggle[Build Docs toggle]
  Toggle --> Mode{Docs mode?}

  Mode -->|Off| NoDocs[No docs context]
  Mode -->|On| Pick[Select docs snippets]

  Pick --> Source{Source}
  Source -->|public/mermaid-docs| Subset[Subset docs]
  Source -->|mermaid-docs/<version>| Full[Full snapshot]

  Subset --> Rank[Rank by relevance]
  Full --> Rank
  Rank --> Pack[Pack context window]
  Pack --> Prompt[PromptBuilder]
  Prompt --> LLM[llmService]
```

---

## Diagram 8 — Рендер/превью/зум/экспорт

Зачем: отделить «валидность кода» от «отрисовки» и понять, где появляются ошибки и где работают кнопки зума/экспорта.

Советы:
- Если `parse` падает — экспорта/зума быть не должно (нет SVG).
- `render` → SVG → вставка в DOM → затем панорама/зум/fit и только потом экспорт.
- Экспорт SVG обычно проще (сериализация), PNG требует растеризации.

```mermaid
flowchart LR
  Spec[Mermaid code] --> Parse[mermaid.parse]
  Parse -->|ok| Render[mermaid.render -> SVG]
  Parse -->|error| Err[Diagnostics]

  Render --> DOM[Inject SVG]
  DOM --> Zoom[Pan/Zoom controls]
  DOM --> Fit[Fit to viewport]

  DOM -->|export| ToSVG[SVG serializer]
  DOM -->|export| ToPNG[Rasterize PNG]

  Err --> UIErr[Preview error view]
```

---

## Diagram 9 — LLM Provider Strategy (class)

Зачем: объяснить, как приложение переключает провайдеров (локальный прокси/облако) без переписывания логики UI.

Как читать:
- `LLMService` держит активную стратегию (`LLMProviderStrategy`) и вызывает общий интерфейс.
- Стратегии инкапсулируют детали API (эндпоинты, заголовки, формат сообщений, модели).
- `MockStrategy` полезна для тестов и офлайн-режима.

```mermaid
classDiagram
  class LLMProviderStrategy {
    +name: string
    +listModels()
    +chat(messages)
    +analyze(input)
    +build(prompt)
  }

  class OpenRouterStrategy
  class LocalProxyStrategy
  class MockStrategy

  LLMProviderStrategy <|.. OpenRouterStrategy
  LLMProviderStrategy <|.. LocalProxyStrategy
  LLMProviderStrategy <|.. MockStrategy

  class LLMService {
    -strategy: LLMProviderStrategy
    +setStrategy(strategy)
    +generateMermaid(...)
  }

  LLMService o-- LLMProviderStrategy
```

---

## Diagram 10 — Где что хранится (privacy/storage)

Зачем: зафиксировать правило приватности: ключи остаются у пользователя, история живет локально.

Как читать:
- `localStorage` — настройки (провайдер/модель/тема/язык/ключи).
- `IndexedDB` — тяжелые данные: сессии, ревизии, сообщения.
- Внешним провайдерам отправляется только то, что нужно для запроса (и только вместе с ключом из настроек).

```mermaid
flowchart TD
  subgraph Browser["Browser"]
    subgraph LS["localStorage (settings)"]
      keys[API keys]
      model[model/provider]
      ui[ui prefs]
    end

    subgraph IDB["IndexedDB (history)"]
      sessions[sessions]
      revisions[revisions]
      messages[messages]
    end
  end

  subgraph External["External services"]
    LLM[LLM provider]
  end

  keys -. sent in requests .-> LLM
  revisions -->|read/write| IDB
```

---

## Diagram 11 — Запись взаимодействий (interactions log)

Зачем: понять механику трекинга действий (клики/ввод) и «снимков» состояния для дебага/воспроизведения сессии.

Как читать:
- Recorder пишет события в in-memory лог (в рамках одной сессии).
- Snapshot (если включен) добавляет периодические/ручные снимки UI состояния.
- Просмотр лога — это просто read из накопленного буфера.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant UI as UI (buttons/inputs)
  participant R as Recorder
  participant S as Snapshotter
  participant Store as In-memory log

  U->>UI: click/type
  UI->>R: emit(event)
  R->>Store: append(event)
  opt Snapshot
    UI->>S: capture()
    S-->>Store: append(snapshot)
  end
  U->>UI: open log
  UI->>Store: read()
  Store-->>UI: events + snapshots
```

---

## Diagram 12 — C4-стиль: контекст системы (очень упрощённо)

Зачем: «вид сверху» — кто пользователи, что внутри SPA, какие внешние зависимости.

Как читать:
- Внутри браузера: UI + engine + Mermaid validate/render + история + docs context.
- Снаружи: LLM провайдеры (облако/локальный прокси).
- Потоки: пользователь → UI → engine → (валидация/история/доки/LLM) → обратно в UI.

```mermaid
flowchart LR
  User([Developer / User])
  subgraph Browser["Diagram Compiler (SPA)"]
    UI[UI]
    Engine[Studio engine]
    Val[Mermaid validate/render]
    Hist["History: IndexedDB"]
    Docs[Docs context]
  end
  subgraph Providers["LLM Providers"]
    OR[OpenRouter]
    Proxy[Local proxy]
  end

  User --> UI --> Engine
  Engine --> Val
  Engine --> Hist
  Engine --> Docs
  Engine --> OR
  Engine --> Proxy
```
