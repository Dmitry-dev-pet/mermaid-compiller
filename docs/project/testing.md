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
Добавлены тесты для парсинга/валидации `NotebookPlan` и утилит логов чата.

## Линт

- Для SPA: `npm --prefix diagram-compiler run lint`.
- Для корня (legacy/статик): `npm run lint`.

## Проверка типов

- Для SPA: `npm --prefix diagram-compiler run typecheck`.
- Из корня: `npm run typecheck`.

---

Обновлено: 2026-01-23. Согласовано с текущей реализацией (расширены unit tests для build/autofix/operation logs).
