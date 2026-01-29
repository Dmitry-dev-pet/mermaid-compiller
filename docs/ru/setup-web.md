# Web Setup & Installation

[← Back to Index](INDEX.md)

Это руководство по запуску стандартной веб-версии Mermaid Diagram Compiler.

## Требования
- **Node.js**: v20 или выше.
- **npm**: v10 или выше.

## Установка

Репозиторий содержит два `package.json`. Рекомендуется устанавливать зависимости из корня:

```bash
# В корне проекта
npm install
npm --prefix diagram-compiler install
```

## Запуск (Dev Mode)

Для запуска локального сервера разработки:

```bash
npm run dev
```
Приложение откроется по адресу `http://localhost:5173`.

## Сборка (Production)

Для создания оптимизированной сборки:

```bash
npm run build
```
Файлы будут созданы в `diagram-compiler/dist`.

## Проверка типов и тесты

```bash
npm run typecheck
npm test
```

---
[← Back to Index](INDEX.md) | [Next: Desktop Setup →](setup-desktop.md)
