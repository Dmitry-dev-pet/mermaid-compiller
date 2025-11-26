import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).parent / "public"


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


def run() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server_address = ("", port)
    with ThreadingHTTPServer(server_address, StaticHandler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    run()
