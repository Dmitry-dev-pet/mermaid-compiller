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

## Линт

- Для SPA: `npm --prefix diagram-compiler run lint`.
- Для корня (legacy/статик): `npm run lint`.
