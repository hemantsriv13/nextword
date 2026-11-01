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
from nextword.lab import assist, lessons, mlp_service, service
from nextword.lab.service import LabError

WEB_DIST = service.ROOT / "web" / "dist"
# The project documents the app links to, served read-only at /docs/<name> (nothing else in the folder is).
PROJECT_DOCS = {name: service.ROOT / rel for name, rel in {
    "README.md": "README.md", "ROADMAP.md": "ROADMAP.md", "LAB.md": "docs/LAB.md", "LESSONS.md": "docs/LESSONS.md",
    "MLP.md": "docs/MLP.md", "DATASETS.md": "docs/DATASETS.md", "LOCAL_AI.md": "docs/LOCAL_AI.md",
    "COMPARE.md": "evals/local_ai/COMPARE.md", "ROUND2.md": "evals/local_ai/ROUND2.md", "TUTOR.md": "evals/local_ai/TUTOR.md",
    "FROZEN.md": "evals/local_ai/FROZEN.md",
}.items()}
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_ASSIST_BODY_BYTES = 16 * 1024

store = service.CorpusStore()
assistant: assist.Assistant | None = None  # created by main(), or on first use with the default settings


def _assistant() -> assist.Assistant:
    global assistant
    if assistant is None:
        assistant = assist.Assistant(store, mlps=_mlps(), lessons=_lessons())
    return assistant


lesson_results: lessons.Lessons | None = None


def _lessons() -> lessons.Lessons:
    global lesson_results
    if lesson_results is None:
        lesson_results = lessons.Lessons(store)
    return lesson_results


mlps: mlp_service.MLPService | None = None


def _mlps() -> mlp_service.MLPService:
    global mlps
    if mlps is None:
        mlps = mlp_service.MLPService(store)
    return mlps


def _body(handler: "LabHandler", limit: int = MAX_BODY_BYTES) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length > limit:
        raise LabError(f"the request is larger than {limit:,} bytes", 413, "too_large")
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
    """The prediction engines and their real state on this computer, so pages never hard-code it. An engine
    that can't run says why and what to do. (The explaining model is separate: /api/assist/status.)"""
    mlp = _mlps().status()
    return [{
        "id": "char-bigram",
        "name": "Character bigram",
        "source": "model",
        "status": "available",
        "version": service.engine_version(),
        "file": "nextword/bigram.py",
        "route": "journey",
        "decoding": ["sample"],
    }, {
        "id": "char-mlp",
        "name": "Character MLP",
        "source": "model",
        "status": "available" if mlp["available"] else "unavailable",
        "version": f"PyTorch {mlp['torch']}" if mlp["available"] else None,
        "file": "nextword/mlp.py",
        "route": "mlp",
        "savedRuns": len(mlp["saved"]),
        "reason": None if mlp["available"] else f"PyTorch could not be imported ({mlp['error']}).",
        "nextAction": None if mlp["available"] else
            r".venv\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu -r requirements-mlp.txt, then restart the Lab",
        "decoding": ["sample"],
    }, {
        "id": "tiny-transformer",
        "name": "Tiny transformer",
        "source": "model",
        "status": "planned",
        "version": None,
        "file": None,
        "route": None,
        "reason": "Not built. The Attention page simulates its core step in the browser.",
        "decoding": [],
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


def r_journey(data):
    return service.journey(store, data.get("corpus") or "example", data.get("prompt", ""), data.get("length", 12), data.get("seed"))


def r_benchmark(data):
    return service.benchmark(store, data.get("corpus") or "sample", data.get("prompt", "The rain"), data.get("length", 40), data.get("runs", 50))


def r_evaluate(data):
    # A dataset has fixed parts; any other text is split by the fractions given.
    parts = store.parts(data["corpus"]) if isinstance(data.get("corpus"), str) and not isinstance(data.get("corpusText"), str) else None
    return service.evaluate(_corpus_text(data), data.get("train", 0.8), data.get("val", 0.1), data.get("on", "val"), data.get("k", 0), parts)


def r_adapt(data):
    return service.adapt(_corpus_text(data, "base"), _corpus_text(data, "extra"), data.get("context", "e"))


def r_source(data):
    return service.source(data.get("path", ""))


def r_assist_status(_):
    return assist.status(_assistant().cfg)


def r_mlp_status(_):
    return _mlps().status()


def r_mlp_run(data):
    return _mlps().get(data.get("id")).summary()


def r_mlp_start(data):
    return _mlps().start(data)


def r_mlp_stop(data):
    return _mlps().stop(data.get("id"))


def r_mlp_reset(data):
    return _mlps().reset(data.get("id"))


def r_mlp_inspect(data):
    return _mlps().inspect(data)


def r_mlp_examples(data):
    return _mlps().examples_list(data)


def r_mlp_generate(data):
    return _mlps().generate(data)


def r_mlp_history(data):
    return _mlps().history(data)


def r_mlp_replay(data):
    return _mlps().replay_update(data)


def r_lesson_result(data):
    return _lessons().result(data)


def r_mlp_compare(data):
    return _mlps().compare(data)


GET_ROUTES = {"/api/health": r_health, "/api/engines": r_engines, "/api/corpora": r_corpora,
              "/api/corpus": r_corpus, "/api/source": r_source, "/api/assist/status": r_assist_status,
              "/api/mlp/status": r_mlp_status, "/api/mlp/run": r_mlp_run}
ASSIST_ROUTE = "/api/assist/explain"
POST_ROUTES = {"/api/corpora": r_corpus_add, "/api/corpora/delete": r_corpus_delete, "/api/stats": r_stats,
               "/api/bigram/table": r_table, "/api/bigram/row": r_row, "/api/generate": r_generate, "/api/journey": r_journey,
               "/api/benchmark": r_benchmark, "/api/evaluate": r_evaluate, "/api/adapt": r_adapt,
               "/api/mlp/start": r_mlp_start, "/api/mlp/stop": r_mlp_stop, "/api/mlp/reset": r_mlp_reset,
               "/api/mlp/inspect": r_mlp_inspect, "/api/mlp/examples": r_mlp_examples, "/api/mlp/generate": r_mlp_generate, "/api/mlp/compare": r_mlp_compare,
               "/api/mlp/history": r_mlp_history, "/api/mlp/replay": r_mlp_replay, "/api/lessons/result": r_lesson_result}


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
        if parsed.path.startswith("/docs/"):
            self._doc(parsed.path[len("/docs/"):])
            return
        self._static(parsed.path)

    def do_POST(self):  # noqa: N802
        if urlparse(self.path).path == ASSIST_ROUTE:
            self._assist()
            return
        self._api(POST_ROUTES, lambda: _body(self))

    def _assist(self) -> None:
        """Ask local AI, streamed as one JSON object per line: start, delta…, then done or error.

        Anything wrong with the request is a normal JSON error before streaming starts. Once it has
        started, a failure arrives as an error line. If the page cancels, writing fails, the
        upstream request to Colibri is closed, and nothing is added to the conversation.
        """
        started = time.perf_counter()
        a = _assistant()
        streaming = False

        def send(event: dict) -> None:
            self.wfile.write((json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8"))
            self.wfile.flush()

        try:
            data = _body(self, MAX_ASSIST_BODY_BYTES)
            with a.busy:
                conv, messages, user, max_tokens = a.prepare(data)
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.close_connection = True
                streaming = True
                send({"type": "start", "conversation": conv["id"], "key": conv["key"], "action": data["action"],
                      "turn": conv["turns"] + 1, "maxTurns": assist.MAX_TURNS, "model": conv.get("model") or a.cfg.model,
                      "url": a.cfg.url, "maxTokens": max_tokens, "facts": a.facts_of(conv),
                      "calculations": conv["calculations"]})
                result = assist.stream_answer(a.cfg, messages, max_tokens, lambda piece: send({"type": "delta", "text": piece}),
                                              model=conv.get("model"))
                if result["answer"]:
                    a.conversations.add(conv, user, result["answer"])
                send({"type": "done", "finish": result["finish"], "timingsMs": result["timingsMs"],
                      "turns": conv["turns"], "maxTurns": assist.MAX_TURNS, "empty": not result["answer"], "room": a.room(conv)})
        except ConnectionError:
            pass  # the page cancelled or went away; the upstream request was closed on the way out
        except LabError as err:
            if streaming:
                try:
                    send({"type": "error", "code": err.code, "message": str(err)})
                except ConnectionError:
                    pass
            else:
                self._send_json(err.status, {"error": {"code": err.code, "message": str(err)}}, started)
        except Exception as err:  # noqa: BLE001 - report, never crash the server
            self.log_error("unhandled error on %s: %r", ASSIST_ROUTE, err)
            payload = {"code": "server_error", "message": f"{type(err).__name__}: {err}"}
            try:
                send({"type": "error", **payload}) if streaming else self._send_json(500, {"error": payload}, started)
            except ConnectionError:
                pass

    def _doc(self, name: str) -> None:
        """One of the project's documents, read-only and as plain text, so the app can link to them offline.
        Only the files named in PROJECT_DOCS are served."""
        source = PROJECT_DOCS.get(name)
        data = (source.read_bytes() if source and source.is_file()
                else f"No document called {name!r}. Available: {', '.join(sorted(PROJECT_DOCS))}".encode("utf-8"))
        self.send_response(200 if source and source.is_file() else 404)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

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
    parser.add_argument("--ai-url", default=None, help=f"Colibri's OpenAI-compatible address, on this computer only (default {assist.DEFAULT_URL}, or NEXTWORD_AI_URL)")
    parser.add_argument("--ai-model", default=None, help=f"the model id Colibri serves (default {assist.DEFAULT_MODEL}, or NEXTWORD_AI_MODEL)")
    args = parser.parse_args()
    global assistant
    try:
        assistant = assist.Assistant(store, assist.AssistConfig(args.ai_url, args.ai_model), mlps=_mlps(), lessons=_lessons())
    except ValueError as err:
        parser.error(str(err))
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), LabHandler)
    url = f"http://127.0.0.1:{args.port}"
    print(f"NextWord Lab running at {url}  (Ctrl+C to stop)")
    print(f"Ask local AI uses {assistant.cfg.model} at {assistant.cfg.url} (only when you ask; start Colibri separately)")
    if not WEB_DIST.exists():
        print("The interface isn't built yet. Run: npm --prefix web install && npm --prefix web run build")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0
