# Desktop Agent и интеграция с Cliproxy

## Обзор

Desktop-версия Mermaid Diagram Compiler (`mermaid-agent`) спроектирована для работы в тандеме с **CLIProxyAPI** (часто называемым Cliproxy). Эта архитектура позволяет приложению использовать локальные CLI-инструменты и авторизованные сессии (такие как OpenAI Codex, Claude Code, Gemini CLI), не требуя от пользователя ручного извлечения и управления сырыми API-ключами.

## Архитектура

```mermaid
graph TD
    UI[Mermaid Editor (React)] <-->|HTTP/IPC| Agent[Mermaid Agent (Tauri/Rust)]
    Agent <-->|Check/Manage| CLI[CLIProxyAPI (Go)]
    CLI <-->|OAuth/Session| Providers[Upstream Providers]
    
    subgraph Providers
        Codex[OpenAI Codex]
        Gemini[Gemini CLI]
        Claude[Claude Code]
        Anti[Antigravity]
    end
```

### Компоненты

1. **Mermaid Agent (Tauri)**
   - Работает как оболочка приложения и агент в системном трее.
   - Запускает локальный сервер UI.
   - Предоставляет единый локальный API-эндпоинт для UI.

2. **CLIProxyAPI (внешняя зависимость)**
   - Прокси-сервер, который оборачивает CLI-модели ИИ в API, совместимый с OpenAI.
   - Обрабатывает потоки OAuth-аутентификации для провайдеров.
   - Управляет балансировкой нагрузки между несколькими аккаунтами и квотами.

3. **Antigravity**
   - Специфический высокопроизводительный upstream-провайдер, поддерживаемый CLIProxyAPI.
   - Отображается в UI, когда активен CLIProxyAPI и доступны auth-файлы.

## Настройка Desktop-версии

1. Установите Mermaid Agent: скачайте и запустите исполняемый файл `mermaid-agent`.
2. Установите CLIProxyAPI:
   - Убедитесь, что бинарный файл `cliproxyapi` доступен в системном PATH.
   - Агент автоматически обнаружит его при запуске.
3. Аутентификация:
   - Используйте веб-морду/CLI CLIProxyAPI для логина в провайдерах.
   - UI проекта может читать квоты и модели через прокси-эндпоинт.

## Преимущества

- **Без API-ключей**: используйте существующие подписки/сессии через CLI-авторизацию.
- **Приватность**: токены управляются локально прокси-сервером и не уходят на наши серверы.
- **Гибкость**: быстрое переключение между OpenRouter и локальными CLI-интеграциями.

## Устранение неполадок

- **"cliproxyapi missing"**: убедитесь, что `cliproxyapi` установлен и в PATH; перезапустите агент.
- **"Agent Offline"**: проверьте, что процесс Mermaid Agent запущен и порт доступен.

---

Ссылка: [CLIProxyAPI GitHub](https://github.com/router-for-me/CLIProxyAPI)
