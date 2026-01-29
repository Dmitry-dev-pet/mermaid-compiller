# Desktop Agent Setup

[← Back to Index](./) | [← Prev: Web Setup](setup-web.md)

Desktop-версия включает в себя нативное приложение на Tauri и фоновый агент для работы с CLI.

## Требования
- **Rust**: Актуальная версия (rustc & cargo).
- **Node.js**: v20+.
- **Системные зависимости**: 
    - macOS: XCode command line tools.
    - Linux: `libwebkit2gtk-4.0-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.
    - Windows: C++ Build Tools.

## Установка и Запуск

```bash
# Переходим в папку агента
cd agent/src-tauri

# Запуск в режиме разработки
cargo tauri dev
```
Эта команда запустит:
1.  Frontend (Vite).
2.  Backend (Mermaid Agent Server).
3.  Окно приложения.
4.  Иконку в системном трее.

## Сборка (Release)

Для создания установщика (`.dmg`, `.msi`, `.deb`):

```bash
cargo tauri build
```
Артефакты будут находиться в `agent/src-tauri/target/release/bundle`.

## Конфигурация Агента
Агент читает переменные окружения. Вы можете создать `.env` файл рядом с бинарником.

| Переменная | Описание | Дефолт |
| :--- | :--- | :--- |
| `AGENT_PORT` | Порт API сервера | `8787` |
| `AGENT_TOKEN` | Токен защиты API | (empty) |
| `GEMINI_CMD` | Путь к Gemini CLI | `gemini` |
| `CODEX_CMD` | Путь к Codex CLI | `codex` |

---
[← Back to Index](./)
