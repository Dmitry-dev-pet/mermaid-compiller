# Тесты и линт

## Тесты

Запуск из корня:
```bash
npm test
```

Эквивалентно:
```bash
npm --prefix diagram-compiler test
```

Фреймворк: Vitest (`diagram-compiler/package.json`).
Добавлены тесты для парсинга/валидации `NotebookPlan`.

## Линт

- Для SPA: `npm --prefix diagram-compiler run lint`.
- Для корня (legacy/статик): `npm run lint`.

## Проверка типов

- Для SPA: `npm --prefix diagram-compiler run typecheck`.
- Из корня: `npm run typecheck`.

---

Обновлено: 2025-12-27. Согласовано с текущей реализацией (notebook plan tests, LLM timeouts, typecheck).
