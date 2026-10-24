"""NextWord Lab: a local web server for the Lab's interface and its JSON API.

Run:  .venv\\Scripts\\python -m nextword.lab --open        (serves http://127.0.0.1:8765)

Standard library only. It listens on 127.0.0.1, so nothing is reachable from other machines.
"""

import argparse
import json
import mimetypes
import sys
import time
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from nextword import bigram
from nextword.lab import service
from nextword.lab.service import LabError

WEB_DIST = service.ROOT / "web" / "dist"
MAX_BODY_BYTES = 8 * 1024 * 1024

store = service.CorpusStore()


def _body(handler: "LabHandler") -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length > MAX_BODY_BYTES:
        raise LabError("the request is larger than 8 MB", 413, "too_large")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as err:
        raise LabError(f"the request body is not valid JSON ({err})", 400, "bad_json") from err
    if not isinstance(data, dict):
        raise LabError("the request body must be a JSON object", 400, "bad_json")
    return data


def _corpus_text(data: dict, key: str = "corpus") -> str:
    """A request names a stored corpus by id, or sends its text inline as `<key>Text`."""
    inline = data.get(key + "Text")
    if isinstance(inline, str):
        if not inline:
            raise LabError("the text is empty", 422, "empty_text")
        return inline
    return store.text(data.get(key) or "sample")


# Each route takes the parsed JSON body (or query) and returns a JSON-serialisable result.
def r_health(_):
    return {"ok": True, "modelVersion": service.engine_version(), "time": time.time()}


def r_engines(_):
    return [{
        "id": "char-bigram",
        "name": "Character bigram",
        "source": "model",
        "status": "available",
        "version": service.engine_version(),
        "file": "nextword/bigram.py",
        "decoding": ["sample"],
    }]


def r_corpora(_):
    return store.list()


def r_corpus(data):
    corpus_id = data.get("id") or "sample"
    text = store.text(corpus_id)
    return {**store.describe(corpus_id), "text": text, "stats": service.corpus_stats(text)}


def r_corpus_add(data):
    return store.add(data.get("name", ""), data.get("text", ""))


def r_corpus_delete(data):
    store.delete(data.get("id", ""))
    return {"deleted": data.get("id")}


def r_stats(data):
    return service.corpus_stats(_corpus_text(data))


def r_table(data):
    if isinstance(data.get("corpusText"), str):
        counts = bigram.count_bigrams(bigram.tokenize(_corpus_text(data)))
    else:
        counts, _, _ = store.counts(data.get("corpus") or "sample")
    return service.count_table(counts)


def r_row(data):
    counts, _, _ = store.counts(data.get("corpus") or "sample")
    return service.distribution(counts, data.get("context", ""))


def r_generate(data):
    if data.get("engine", "char-bigram") != "char-bigram":
        raise LabError(f"engine {data.get('engine')!r} is not implemented yet", 404, "unknown_engine")
    return service.generate(store, data.get("corpus") or "sample", data.get("prompt", ""), data.get("length", 40), data.get("seed"))


def r_benchmark(data):
    return service.benchmark(store, data.get("corpus") or "sample", data.get("prompt", "The rain"), data.get("length", 40), data.get("runs", 50))


def r_evaluate(data):
    return service.evaluate(_corpus_text(data), data.get("train", 0.8), data.get("val", 0.1), data.get("on", "val"), data.get("k", 0))


def r_adapt(data):
    return service.adapt(_corpus_text(data, "base"), _corpus_text(data, "extra"), data.get("context", "e"))


def r_source(data):
    return service.source(data.get("path", ""))


GET_ROUTES = {"/api/health": r_health, "/api/engines": r_engines, "/api/corpora": r_corpora,
              "/api/corpus": r_corpus, "/api/source": r_source}
POST_ROUTES = {"/api/corpora": r_corpus_add, "/api/corpora/delete": r_corpus_delete, "/api/stats": r_stats,
               "/api/bigram/table": r_table, "/api/bigram/row": r_row, "/api/generate": r_generate,
               "/api/benchmark": r_benchmark, "/api/evaluate": r_evaluate, "/api/adapt": r_adapt}


class LabHandler(BaseHTTPRequestHandler):
    server_version = "NextWordLab/0.1"

    def _send_json(self, status: int, payload, started: float) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Server-Timing", f"total;dur={(time.perf_counter() - started) * 1000:.2f}")
        self.end_headers()
        self.wfile.write(body)

    def _api(self, routes: dict, get_data) -> None:
        started = time.perf_counter()
        path = urlparse(self.path).path
        route = routes.get(path)
        if route is None:
            self._send_json(404, {"error": {"code": "not_found", "message": f"no API route {path}"}}, started)
            return
        try:
            self._send_json(200, route(get_data()), started)
        except LabError as err:
            self._send_json(err.status, {"error": {"code": err.code, "message": str(err)}}, started)
        except Exception as err:  # noqa: BLE001 - report, never crash the server
            self.log_error("unhandled error on %s: %r", path, err)
            self._send_json(500, {"error": {"code": "server_error", "message": f"{type(err).__name__}: {err}"}}, started)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._api(GET_ROUTES, lambda: {k: v[-1] for k, v in parse_qs(parsed.query).items()})
            return
        self._static(parsed.path)

    def do_POST(self):  # noqa: N802
        self._api(POST_ROUTES, lambda: _body(self))

    def _static(self, path: str) -> None:
        if not WEB_DIST.exists():
            message = b"The Lab interface is not built yet. Run: npm --prefix web install && npm --prefix web run build"
            self.send_response(HTTPStatus.SERVICE_UNAVAILABLE)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
            return
        target = (WEB_DIST / path.lstrip("/")).resolve()
        if not target.is_file() or WEB_DIST.resolve() not in target.parents:
            target = WEB_DIST / "index.html"  # single-page app: unknown paths load the app
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        # index.html must never be cached, or a rebuilt app would request deleted files.
        self.send_header("Cache-Control", "no-cache" if target.name == "index.html" else "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[lab] {self.address_string()} {fmt % args}\n")


def main() -> int:
    parser = argparse.ArgumentParser(prog="nextword.lab", description="Run the NextWord Lab locally.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="open the Lab in your browser")
    args = parser.parse_args()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), LabHandler)
    url = f"http://127.0.0.1:{args.port}"
    print(f"NextWord Lab running at {url}  (Ctrl+C to stop)")
    if not WEB_DIST.exists():
        print("The interface isn't built yet. Run: npm --prefix web install && npm --prefix web run build")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
