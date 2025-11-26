import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import List
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).parent / "public"
DOCS_ROOT = Path(__file__).parent / "memory" / "mermaid-full-docs"


def _search_mermaid_docs(query: str, max_results: int = 5) -> List[dict]:
    """Naive text search over local Mermaid docs, returning small snippets.

    Scans a subset of .md files under memory/mermaid-full-docs and returns
    up to max_results snippets with a few lines of context around the match.
    """

    results: List[dict] = []
    lowered = query.lower()
    if not lowered or not DOCS_ROOT.exists():
        return results

    # Prefer syntax/config docs first by scanning known subdirs/order
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

            # Build a short snippet around the first occurrence
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
            results.append({"file": str(relative), "snippet": snippet})

            if len(results) >= max_results:
                return results

    return results


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self) -> None:  # type: ignore[override]
        parsed = urlparse(self.path)
        if parsed.path == "/docs/search":
            params = parse_qs(parsed.query)
            query = (params.get("q", [""])[0] or "").strip()
            if not query:
                payload = {"query": query, "results": []}
            else:
                payload = {"query": query, "results": _search_mermaid_docs(query)}

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
