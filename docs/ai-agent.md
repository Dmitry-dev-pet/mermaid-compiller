# Mermaid Agent Guide

[← Back to Index](INDEX.md) | [← Prev: CLIProxyAPI](ai-cliproxy.md)

**Mermaid Agent** — это нативный компонент Desktop-версии, который служит мостом между веб-интерфейсом и системными CLI-утилитами.

## Как это работает
Агент запускает HTTP-сервер на порту `8787`. Когда вы отправляете запрос, Агент запускает в системе процесс (например, `gemini`) и передает ему ваш промпт.

## Поддерживаемые инструменты

### 1. Gemini CLI
- Использует официальный `gemini` CLI от Google.
- Авторизация через `gcloud auth login` или `gemini auth`.

### 2. Codex CLI
- Использует `codex` CLI от OpenAI.

## Управление через Трей
Иконка в системном трее позволяет:
- Проверить статус (Online/Offline).
- Увидеть, какие инструменты установлены.
- Быстро вызвать команды логина.

---
[← Back to Index](INDEX.md) | [Next: Prompt Engineering →](ai-prompts.md)
