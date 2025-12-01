import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).parent / "public"
DOCS_ROOT = Path(__file__).parent / "memory" / "mermaid-docs" / "syntax"

DIAGRAM_DOCS_MAP = {
    "flowchart": "flowchart.md",
    "sequence": "sequenceDiagram.md",
    "class": "classDiagram.md",
    "state": "stateDiagram.md",
    "er": "entityRelationshipDiagram.md",
    "entity": "entityRelationshipDiagram.md",
    "gantt": "gantt.md",
    "mindmap": "mindmap.md",
    "pie": "pie.md",
    "gitgraph": "gitgraph.md",
    "journey": "userJourney.md",
    "timeline": "timeline.md",
    "zenuml": "zenuml.md",
    "sankey": "sankey.md",
    "xy": "xyChart.md",
    "block": "block.md",
    "quadrant": "quadrantChart.md",
    "requirement": "requirementDiagram.md",
    "c4": "c4.md",
    "kanban": "kanban.md",
    "architecture": "architecture.md",
    "packet": "packet.md",
    "radar": "radar.md",
    "treemap": "treemap.md",
}


def _contains_cyrillic(text: str) -> bool:
    for ch in text:
        if "\u0400" <= ch <= "\u04ff":
            return True
    return False


def _search_mermaid_docs_local(query: str, max_chars: int = 8000) -> list:
    """Search for relevant documentation locally based on diagram type keywords."""
    query_lower = query.lower()
    print(f"[DEBUG] Docs search query: '{query}'")
    
    found_file = None
    
    # 1. Try to find explicit diagram type in query
    for key, filename in DIAGRAM_DOCS_MAP.items():
        # Use word boundaries to avoid partial matches (e.g. "er" in "mermaid")
        if re.search(r'\b' + re.escape(key) + r'\b', query_lower):
            found_file = filename
            print(f"[DEBUG] Match found for key '{key}': {filename}")
            break
    
    # 2. Fallback for 'auto' or generic queries if 'examples' exists
    if not found_file and "basics" in query_lower:
         if (DOCS_ROOT / "examples.md").exists():
             found_file = "examples.md"

    if not found_file:
        print("[DEBUG] No matching file found in map.")
        return []

    file_path = DOCS_ROOT / found_file
    print(f"[DEBUG] Checking file path: {file_path}")
    
    if not file_path.exists():
        print(f"[DEBUG] File does not exist: {file_path}")
        return []

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        # Simple truncation for now. 
        # Ideally, we might want to prioritize syntax blocks, but raw top text is usually good.
        snippet = content[:max_chars]
        print(f"[DEBUG] Read {len(content)} chars, returning snippet of {len(snippet)}")
        
        return [{
            "file": found_file,
            "source": "local_docs",
            "snippet": snippet
        }]
    except Exception as e:
        print(f"Error reading docs file {file_path}: {e}")
        return []


def _normalize_docs_query(query: str, model_id: str = "") -> dict:
    """Normalize user docs query for styling.

    Returns a dict with:
      - search_query: short English topic for docs search
      - style_prefs: optional English description of styling preferences
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
        "You normalize user requests (possibly in Russian) "
        "for generating Mermaid diagrams. "
        "Respond with a strict JSON object only, no extra text:\n"
        "{\n"
        '  "search_topic": '
        '"short English phrase for documentation search about the diagram intent",\n'
        '  "style_prefs": '
        '"short English description of visual styling preferences '
        '(colors, layout, theme, shapes) or empty if none"\n'
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

                # Local file search based on query keywords (diagram types)
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
