"""Serve the static app and optionally expose local CSV cases on loopback only."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", type=Path, help="Optional directory containing case folders")
    args = parser.parse_args()
    data = args.data.resolve() if args.data else None
    if data and not data.is_dir():
        parser.error(f"Not a directory: {data}")

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/cases":
                cases = []
                if data:
                    for dialogue in sorted(data.rglob("dialogue.csv")):
                        if not dialogue.resolve().is_relative_to(data):
                            continue
                        form = dialogue.with_name("rater_form.csv")
                        cases.append({"name": dialogue.parent.name,
                                      "dialogue": dialogue.read_text(encoding="utf-8-sig"),
                                      "form": form.read_text(encoding="utf-8-sig") if form.exists() and form.resolve().is_relative_to(data) else None})
                payload = json.dumps(cases, ensure_ascii=False).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            else:
                super().do_GET()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT / "site")))
    print(f"Double Check: http://127.0.0.1:{args.port}", flush=True)
    print(f"Local cases: {data or 'none (use the import button)'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
