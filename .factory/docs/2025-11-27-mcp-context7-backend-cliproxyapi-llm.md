Да, всё верно: сейчас CLIProxyAPI у тебя выступает только как OpenAI‑совместимый шлюз к моделям, у него своей настройки MCP нет. Поэтому MCP/context7 нужно реализовать не внутри cliproxy, а на нашем бэке, а cliproxy оставить только как «LLM‑двигатель».

Обновлённая архитектура (с акцентом на бэк):

1. Роли компонентов
- CLIProxyAPI: принимает `/v1/chat/completions`, ходит к моделям (gpt/gemini и т.п.), никак сам не говорит с MCP, он просто LLM‑gateway.
- Наш backend (`server.py`):
  - Сам реализует логіку MCP‑клиента context7 (через отдельный сервис или Python‑SDK/context7‑HTTP‑API).
  - Сам ходит в context7, вытаскивает сниппеты доков и отдаёт их фронту через `/docs/search`.
  - Для генерации диаграмм продолжает использовать cliproxy (`/v1/chat/completions`), как и сейчас.
- Фронтенд: ничего не знает про MCP, он только дергает `/docs/search` и `/v1/chat/completions` через наш бэк/cliproxy.

2. Как будет устроен MCP на бэке
- В `server.py` (или рядом) появляется обёртка `Context7Client`, которая:
  - Знает, как сходить к context7 (или через их HTTP API, или через MCP‑SDK) по ключу/endpoint из env.
  - Предоставляет метод `search_docs(query) -> list[{file, snippet}]`.
- Эту обёртку можно тестировать отдельно: сначала просто `Context7Client.search_docs("flowchart")`, без участия фронта и cliproxy.

3. Поведение `/docs/search`
- Приходит `q` от фронта.
- `server.py` делает:
  - `snippets = Context7Client.search_docs(q)`.
  - Если всё ок — возвращает `{ "query": q, "results": snippets }` в текущем формате.
  - Если context7 недоступен/ошибка — либо возвращает `{results: []}`, либо (опционально) падает на локальный поиск по `memory/mermaid-full-docs`.
- CLIProxyAPI здесь не участвует вообще: `/docs/search` идёт напрямую к context7.

4. Поведение генерации диаграмм
- Не меняется: фронт по‑прежнему шлёт промпт в наш JS, мы собираем промпт, подмешиваем `docsContext` из `/docs/search` и отправляем в cliproxy (`/v1/chat/completions`) уже как сейчас.
- Таким образом, цепочка: фронт → `/docs/search` (context7) → промпт + контекст → cliproxy → модель → диаграмма.

5. Тестирование по частям
- Шаг 1: отдельно протестировать `Context7Client` (без HTTP‑слоя).
- Шаг 2: протестировать `/docs/search` (curl к `server.py`).
- Шаг 3: интеграционный тест фронт + бэк (UI + cliproxy + context7).

Если такая архитектура (MCP на бэке, cliproxy только как LLM‑шлюз) тебе подходит, дальше можно уже проектировать конкретный интерфейс `Context7Client` и формат ответа context7 (какой именно endpoint/инструмент использовать, какие поля нужны в `snippet`).