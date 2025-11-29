import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import List
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

try:
    from context7_mcp_client import search_mermaid_docs_via_mcp
except Exception:  # pragma: no cover - MCP client optional
    search_mermaid_docs_via_mcp = None  # type: ignore[assignment]


ROOT = Path(__file__).parent / "public"
DOCS_ROOT = Path(__file__).parent / "memory" / "mermaid-full-docs"


def _search_mermaid_docs_local(query: str, max_results: int = 5) -> List[dict]:
    """Fallback text search over local Mermaid docs, returning small snippets."""

    results: List[dict] = []
    lowered = query.lower()
    if not lowered or not DOCS_ROOT.exists():
        return results

    candidate_dirs = [
        DOCS_ROOT / "docs",
        DOCS_ROOT / "packages-mermaid-src-docs",
    ]

    for base in candidate_dirs:
        if not base.exists():
            continue
        for path in base.rglob("*.md"):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            if lowered not in text.lower():
                continue

            lines = text.splitlines()
            idx = next(
                (i for i, line in enumerate(lines) if lowered in line.lower()),
                None,
            )
            if idx is None:
                continue

            start = max(0, idx - 3)
            end = min(len(lines), idx + 4)
            snippet = "\n".join(lines[start:end]).strip()

            relative = path.relative_to(DOCS_ROOT)
            results.append(
                {"file": str(relative), "snippet": snippet, "source": "local"}
            )

            if len(results) >= max_results:
                return results

    return results


def _contains_cyrillic(text: str) -> bool:
    for ch in text:
        if "\u0400" <= ch <= "\u04ff":
            return True
    return False


def _normalize_docs_query(query: str, model_id: str = "") -> dict:
    """Normalize user docs query for Context7 and styling.

    Returns a dict with:
      - search_query: short English topic for docs search
      - style_prefs: optional English description of styling preferences

    If normalizer is not configured or fails, falls back to the
    original query as search_query and empty style_prefs.
    """

    trimmed = (query or "").strip()
    result = {"search_query": trimmed, "style_prefs": ""}
    if not trimmed:
        return result

    base_url = os.environ.get("CLIPROXY_BASE_URL", "http://localhost:8317").strip()

    # Use provided model_id or fall back to environment variable
    if not model_id:
        model_id = os.environ.get("CLIPROXY_NORMALIZER_MODEL", "").strip()

    api_key = os.environ.get("CLIPROXY_API_KEY", "test").strip()
    if not base_url or not model_id:
        return result

    system_prompt = (
        "You normalize user requests (possibly in Russian) for generating Mermaid diagrams. "
        "Respond with a strict JSON object only, no extra text:\n"
        "{\n"
        '  "search_topic": "short English phrase for documentation search about the diagram intent",\n'
        '  "style_prefs": "short English description of visual styling preferences (colors, layout, theme, shapes) or empty if none"\n'
        "}\n"
        "Do not explain anything, do not add comments or markdown."
    )

    payload = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": trimmed},
        ],
        "temperature": 0.0,
    }

    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    try:
        with urlopen(
            Request(url, data=data, headers=headers, method="POST"), timeout=15
        ) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return result

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return result

    content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(content, str):
        return result

    try:
        obj = json.loads(content.strip())
    except json.JSONDecodeError:
        return result

    search_topic = str(obj.get("search_topic", "")).strip()
    style_prefs = str(obj.get("style_prefs", "")).strip()

    if search_topic:
        result["search_query"] = search_topic
    if style_prefs:
        result["style_prefs"] = style_prefs

    return result


def _search_mermaid_docs_via_context7(query: str, max_results: int = 5) -> List[dict]:
    """Try Context7 MCP client first, then HTTP API if configured.

    1. If context7_mcp_client is available and CONTEXT7_LIBRARY_ID is set,
       use MCP (`get-library-docs` tool) to fetch snippets.
    2. Otherwise (or if MCP returns nothing), fall back to direct HTTP API
       via CONTEXT7_SEARCH_URL, if задан.
    """

    trimmed_query = (query or "").strip()
    if not trimmed_query:
        return []

    # 1) MCP client
    if search_mermaid_docs_via_mcp is not None:
        try:
            mcp_results = search_mermaid_docs_via_mcp(trimmed_query, max_results)
        except Exception:
            mcp_results = []
        if mcp_results:
            return mcp_results

    # 2) HTTP API as fallback
    base_url = os.environ.get("CONTEXT7_SEARCH_URL", "").strip()
    if not base_url:
        return []

    topic = trimmed_query[:80]

    params = {
        "q": trimmed_query,
        "topic": topic,
        "limit": max_results,
    }

    page = os.environ.get("CONTEXT7_PAGE", "").strip()
    if page:
        params["page"] = page

    url = f"{base_url.rstrip('/') }?{urlencode(params)}"

    headers = {"Accept": "*/*"}
    api_key = os.environ.get("CONTEXT7_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        with urlopen(Request(url, headers=headers, method="GET"), timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return []

    text = raw.strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [{"file": "context7", "snippet": text, "source": "context7_http"}]

    results: List[dict] = []

    if isinstance(parsed, dict):
        items = None
        if isinstance(parsed.get("results"), list):
            items = parsed["results"]
        elif isinstance(parsed.get("snippets"), list):
            items = parsed["snippets"]
        if items is None:
            return [{"file": "context7", "snippet": text, "source": "context7_http"}]
    elif isinstance(parsed, list):
        items = parsed
    else:
        return [{"file": "context7", "snippet": text, "source": "context7_http"}]

    for item in items:
        if isinstance(item, dict):
            snippet = str(
                item.get("snippet") or item.get("content") or item.get("text") or "",
            ).strip()
            file_label = str(item.get("file", "")).strip() or "context7"
        else:
            snippet = str(item).strip()
            file_label = "context7"

        if not snippet:
            continue
        results.append(
            {"file": file_label, "snippet": snippet, "source": "context7_http"}
        )
        if len(results) >= max_results:
            break

    if not results:
        return [{"file": "context7", "snippet": text, "source": "context7_http"}]

    return results


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self) -> None:  # type: ignore[override]
        parsed = urlparse(self.path)
        if parsed.path == "/docs/search":
            params = parse_qs(parsed.query)
            query = (params.get("q", [""])[0] or "").strip()
            model_id = (params.get("model", [""])[0] or "").strip()

            if not query:
                payload = {
                    "query": query,
                    "search_query": query,
                    "style_prefs": "",
                    "results": [],
                }
            else:
                normalized = _normalize_docs_query(query, model_id)
                search_query = normalized.get("search_query", query) or query
                style_prefs = normalized.get("style_prefs", "")

                results = _search_mermaid_docs_via_context7(search_query)
                if not results:
                    # Fallback to local docs if context7 is unavailable
                    results = _search_mermaid_docs_local(search_query)
                payload = {
                    "query": query,
                    "search_query": search_query,
                    "style_prefs": style_prefs,
                    "results": results,
                }

            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Fallback to normal static file handling
        super().do_GET()


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server_address = ("", port)
    with ThreadingHTTPServer(server_address, StaticHandler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    run()
