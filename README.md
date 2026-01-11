# Mermaid Diagram Compiler (v2.0)

Мощная среда разработки для генерации, редактирования и визуализации диаграмм Mermaid с помощью ИИ. 
Приложение переписано на современный стек (React + Vite) и поддерживает локальные LLM через прокси или облачные провайдеры (OpenRouter).

## ✨ Основные возможности

### 🤖 ИИ и Автоматизация
*   **Chat / Build:** Чат отвечает только текстом (вопросы, уточнения, рекомендации). Диаграмма строится отдельным действием Build.
*   **MD Notebook Build:** Build может создавать Markdown-файл с несколькими Mermaid-блоками по planner-плану.
*   **Операционные логи:** После Chat/Build/Fix/Analyze доступны логи (тайминг, секции Plan/Diagrams, контекст messages/docs по клику).
*   **Авто-подключение:** Приложение запоминает настройки и автоматически подключается к провайдеру при запуске.
*   **Контекст документации:** При генерации используется актуальная документация Mermaid (загружается локально/параллельно).
*   **Build из контекста:** Build можно запускать без нового промпта — используется история чата + текущий код из редактора.
*   **Валидация и Авто-исправление:** Встроенная проверка синтаксиса и автофикс после Build (до 5 попыток), а также ручной Fix (Fix (5)).
*   **Таймауты LLM:** Каждый LLM-запрос ограничен настраиваемым таймаутом; повторы выполняются для текущего шага.

### 🎨 Интерфейс и UX
*   **Dark Mode:** Полная поддержка темной темы (цвета One Dark для редактора, адаптированный UI).
*   **Syntax Highlighting:** Редактор кода с подсветкой синтаксиса Mermaid (PrismJS).
*   **Live Preview:** Мгновенный рендер диаграммы при изменении кода.
*   **Preview Controls:** Zoom/Pan + Fit/Reset и полноэкранный режим (fit при входе/выходе).
*   **Resizable Layout:** Настраиваемые размеры колонок (Чат / Редактор / Превью).
*   **Горячие клавиши:** Enter = Chat, Ctrl/Cmd+Enter = Build.
*   **Проекты:** Список проектов (сессий) в чате; название можно редактировать. Если название не меняли, оно авто-генерируется после первого Chat.

### ⚙️ Технический Стек
*   **Frontend:** React 19, TypeScript, Vite.
*   **Styling:** Tailwind CSS (с поддержкой `darkMode`), Lucide Icons.
*   **Editor:** `react-simple-code-editor` + `prismjs`.
*   **Diagramming:** `mermaid` (npm package).
*   **Architecture:** Feature-based structure, Custom Hooks (`hooks/core`, `hooks/studio`), Service Layer, Strategy Pattern для LLM.

## 🚀 Установка и Запуск

Приложение находится в директории `diagram-compiler`.

1.  **Перейдите в директорию проекта:**
    ```bash
    cd diagram-compiler
    ```

2.  **Установите зависимости:**
    ```bash
    npm install
    ```

3.  **Запустите сервер разработки:**
    ```bash
    npm run dev
    ```
    Приложение будет доступно по адресу `http://localhost:5173` (или другой порт, указанный в консоли).

4.  **Сборка для продакшена:**
    ```bash
    npm run build
    npm run preview
    ```

5.  **Проверка типов:**
    ```bash
    npm run typecheck
    ```

## 📁 Структура Проекта

*   `diagram-compiler/src/`
    *   `components/`: UI компоненты (`Header`, `EditorColumn`, `ChatColumn`...).
    *   `hooks/`: Кастомные хуки.
        *   `hooks/core/`: Базовые хуки состояния (`useAI`, `useMermaid`, `useLayout`, `useChat`, `useHistory`).
*   `hooks/studio/`: Оркестрация и studio-логика (`useDiagramStudio`, `useNotebookBuild`, `useNotebookChat`, `useBuildDocs`, `useFixFlow`, `useMarkdownMermaid`, `usePromptPreview`, `useManualEditRecorder`).
    *   `services/`: Бизнес-логика.
        *   `llm/`: Стратегии подключения к LLM (`OpenRouterStrategy`, `CliproxyStrategy`).
        *   `mermaidService.ts`: Валидация и рендер.
        *   `docsContextService.ts`: Загрузка документации.
    *   `types.ts`: TypeScript интерфейсы.

## 🔧 Конфигурация

Настройки ИИ (ключи, провайдеры) сохраняются в `localStorage`.
Поддерживаются два провайдера:
1.  **OpenRouter:** Доступ к моделям OpenAI, Anthropic, Google и др.
2.  **Cliproxy (Local):** Локальный прокси для работы с локальными моделями или кастомными API.

---
*Старая версия (Vanilla JS) находится в архиве/корневой папке (legacy), но разработка ведется в `diagram-compiler`.*

## 🧱 C4 / Memory Bank

Архитектурная документация в формате C4: `docs/c4/README.md`.

## 📚 Полная документация

Полный набор документации проекта: `docs/project/README.md`.

---

Обновлено: 2026-01-11. Согласовано с текущей реализацией (операционные логи, проекты/авто-имя, notebook build, timeout UI).
