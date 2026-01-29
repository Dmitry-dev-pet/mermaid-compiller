# Testing & Linting

[← Back to Index](INDEX.md)

Документация по обеспечению качества кода.

## Тесты (Unit Tests)

Мы используем **Vitest** для тестирования бизнес-логики (хуки, сервисы, парсеры).

Запуск тестов:
```bash
# Из корня проекта
npm test

# Или в папке приложения
cd diagram-compiler
npm test
```

Критические области покрытия:
- Сборка и валидация `NotebookPlan`.
- Операционные логи и работа с контекстом.
- Утилиты Mermaid-сервиса.

## Линтинг (Lint)

Проверка стиля кода:
```bash
npm run lint
```

## Проверка типов (Typecheck)

Проверка TypeScript типов:
```bash
npm run typecheck
```

---
[← Back to Index](INDEX.md)
