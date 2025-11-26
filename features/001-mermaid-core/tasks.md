# Задачи для Генератора Диаграмм Mermaid с Интеграцией cliproxyapi

Этот документ описывает задачи, необходимые для реализации Генератора Диаграмм Mermaid в соответствии с `spec.md` и `plan.md`.

## Основные Задачи по Реализации

- [ ] 1. **Настройка Структуры Проекта:**
    - [ ] 1.1. Создать директорию `public/` для клиентских ресурсов.
    - [ ] 1.2. Настроить базовый сервер статических файлов (например, используя `http-server` в Node.js или `http.server` в Python) для раздачи файлов из `public/`.
- [ ] 2. **Разработка `public/index.html`:**
    - [ ] 2.1. Создать базовую структуру HTML.
    - [ ] 2.2. Добавить `<textarea>` для ввода промпта пользователя (например, `id="prompt-input"`).
    - [ ] 2.3. Добавить `<button>` для запуска генерации (например, `id="generate-button"`).
    - [ ] 2.4. Добавить `<div>` для визуального рендеринга диаграммы Mermaid (например, `id="mermaid-render-area"`).
    - [ ] 2.5. Добавить `<div>` для отображения статусных сообщений, ошибок валидации и обратной связи (например, `id="status-messages"`).
    - [ ] 2.7. Подключить библиотеку `mermaid.js` из CDN (например, `<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>`).
    - [ ] 2.8. Подключить `public/app.js` (`<script src="app.js"></script>`).
- [ ] 3. **Разработка `public/app.js` - Основная Логика:**
    - [ ] 3.1. **Глобальное Состояние:** Определить переменные для `currentDiagramCode`, `originalUserPrompt`, `retryCount`, `maxRetries` (например, 5) и `cliproxyApiUrl` (локальный OpenAI-совместимый endpoint `cliproxyapi`, например, `http://localhost:8317/v1/chat/completions`).
    - [ ] 3.2. **Функция `validateMermaidCode(code)`:**
        - [ ] 3.2.1. Реализовать с использованием `mermaid.parse()` для проверки синтаксиса.
        - [ ] 3.2.2. Возвращать `{ isValid: boolean, errors: string[] }`.
    - [ ] 3.3. **Функция `callCliproxyApi(promptMessage, contextDiagramCode)`:**
        - [ ] 3.3.1. Сконструировать промпт для LLM, включая `promptMessage` и `contextDiagramCode` согласно `plan.md`.
        - [ ] 3.3.2. Реализовать `fetch`-запрос к `cliproxyApiUrl`.
        - [ ] 3.3.3. Обработать сетевые ошибки и парсинг JSON-ответа.
        - [ ] 3.3.4. Извлечь исходный код Mermaid из ответа LLM.
    - [ ] 3.4. **Функция `generateAndCorrectDiagram(userPrompt)`:**
        - [ ] 3.4.1. Инициализировать `originalUserPrompt`, `currentDiagramCode = ""`, `retryCount = 0`.
        - [ ] 3.4.2. Реализовать цикл повторных попыток с использованием `while (retryCount < maxRetries)`.
        - [ ] 3.4.3. Внутри цикла:
            - [ ] 3.4.3.1. Вызвать `callCliproxyApi` с соответствующим промптом и `currentDiagramCode`.
            - [ ] 3.4.3.2. Получить ответ LLM (`newDiagramCode`).
            - [ ] 3.4.3.3. Вызвать `validateMermaidCode(newDiagramCode)`.
            - [ ] 3.4.3.4. Если `isValid`, установить `currentDiagramCode = newDiagramCode` и прервать цикл.
            - [ ] 3.4.3.5. Если не `isValid`, увеличить `retryCount` и подготовить корректирующий промпт для следующей итерации.
        - [ ] 3.4.4. После цикла, если `currentDiagramCode` валиден, отрендерить его; в противном случае, отобразить финальную ошибку.
- [ ] 4. **Разработка `public/app.js` - Взаимодействие с UI:**
    - [ ] 4.1. Получить ссылки на все элементы UI (`prompt-input`, `generate-button` и т.д.).
    - [ ] 4.2. **Функция `renderMermaidDiagram(code)`:**
        - [ ] 4.2.1. Использовать `mermaid.render()` для рендеринга визуальной диаграммы.
    - [ ] 4.3. **Функция `displayStatus(message, type)`:** Обновить div `status-messages`.
    - [ ] 4.4. Добавить слушатель событий к `generate-button` для вызова `generateAndCorrectDiagram` со значением из `prompt-input`.
- [ ] 5. **Тестирование и Доработка:**
    - [ ] 5.1. Протестировать с валидными промптами.
    - [ ] 5.2. Протестировать с промптами, которые должны генерировать невалидные диаграммы, для проверки цикла исправления.
    - [ ] 5.3. Протестировать крайние случаи (например, достижение `maxRetries`).
    - [ ] 5.4. Убедиться, что CORS правильно настроен на `cliproxyapi` для локальной разработки.
