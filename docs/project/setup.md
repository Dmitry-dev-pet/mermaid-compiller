# Установка и запуск

## Требования

- Node.js (актуальная LTS версия).

## Установка

Репозиторий содержит два `package.json`:

1. Корень репозитория — служебные скрипты и dev-сервер для статики.
2. `diagram-compiler/` — основное SPA-приложение.

Рекомендуемые варианты установки:

Вариант A (из корня):
```bash
npm install
npm --prefix diagram-compiler install
```

Вариант B (внутри SPA):
```bash
cd diagram-compiler
npm install
```

## Запуск dev-сервера

Из корня:
```bash
npm run dev
```

Или из `diagram-compiler/`:
```bash
npm run dev
```

## Сборка и превью

Из корня:
```bash
npm run build
npm run preview
```

Или из `diagram-compiler/`:
```bash
npm run build
npm run preview
```

## Запуск production-статики

После сборки:
```bash
node server.js
```

Сервер отдаёт `diagram-compiler/dist` на порту `8080` (или `PORT`).

## Переменные окружения

Используются Vite-переменные:

- `VITE_OPEN_ROUTER_ENDPOINT` — базовый URL OpenRouter (по умолчанию `https://openrouter.ai/api/v1`).
- `VITE_PROXY_ENDPOINT` — URL локального прокси (по умолчанию `http://localhost:8317`).

Файлы окружения находятся в `diagram-compiler/.env.*`.

---

Обновлено: 2025-12-24. Согласовано с текущей реализацией (markdown-навигация, scroll sync, frontmatter config).
