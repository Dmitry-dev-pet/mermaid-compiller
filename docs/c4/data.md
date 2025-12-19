# Data model — History (IndexedDB)

## Цель

Хранить локально:
- историю действий пользователя/ИИ (TimeStep),
- ревизии Mermaid-кода (DiagramRevision),
- возможность навигации по «рендерам диаграммы» из чата.

## Сущности

- **Session** — активная сессия пользователя.
- **TimeStep** — шаг истории на каждое действие (chat/build/fix/analyze/recompile/manual_edit...).
- **DiagramRevision** — создаётся только когда меняется Mermaid-код.

## Правило «одна диаграмма на шаг»

Каждый `TimeStep` содержит `currentRevisionId`:
- если шаг меняет диаграмму — указывает на новую ревизию,
- если шаг не меняет диаграмму (например, `chat`) — копирует `currentRevisionId` предыдущего шага,
- если диаграмма очищена — `currentRevisionId = null`.

## Схема (упрощённо)

```mermaid
erDiagram
  HistorySession ||--o{ TimeStep : has
  HistorySession ||--o{ DiagramRevision : has
  TimeStep }o--|| DiagramRevision : current

  HistorySession {
    string id
    number createdAt
    number nextStepIndex
    string currentRevisionId
  }

  TimeStep {
    string id
    string sessionId
    number index
    string type
    number createdAt
    string currentRevisionId
  }

  DiagramRevision {
    string id
    string sessionId
    number createdAt
    string createdByStepId
    string parentRevisionId
    string mermaid
  }
```
