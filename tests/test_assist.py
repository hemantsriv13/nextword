"""Checks for Ask local AI (nextword/lab/assist.py and its route in server.py).

A small fake Colibri server stands in for the real one, so these run without a model: it streams
answers the way Colibri does, or fails in the ways Colibri can.
"""

import http.client
import json
import socket
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from nextword.lab import assist, server, service
from nextword.lab.service import LabError

EXAMPLE_FP = service.CorpusStore().describe("example")["fingerprint"]
SERVED = "qwen3-4b-instruct-2507-q4km"
RUN = {"corpus": "example", "fingerprint": EXAMPLE_FP, "prompt": "a cat sat on th", "length": 10, "seed": 2}


class FakeColibri:
    """Serves /v1/models and a streaming /v1/chat/completions. `mode` picks the behaviour."""

    def __init__(self):
        self.mode = "ok"
        self.pieces = ["P(e | h) ", "= 4 / 5 ", "= 0.8."]
        self.delay = 0.0
        self.requests: list[dict] = []
        self.disconnected = threading.Event()
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):  # noqa: N802
                body = json.dumps({"data": [{"id": SERVED, "context_length": 2048}]}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):  # noqa: N802
                fake.requests.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                if fake.mode in ("429", "404"):
                    body = json.dumps({"error": {"message": "nope", "code": fake.mode}}).encode()
                    self.send_response(int(fake.mode))
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("x-colibri-queue-wait-ms", "3")
                self.end_headers()
                try:
                    if fake.mode == "silent":
                        time.sleep(1.5)
                    for piece in fake.pieces:
                        time.sleep(fake.delay)
                        chunk = {"choices": [{"delta": {"content": piece}, "finish_reason": None}]}
                        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                        self.wfile.flush()
                    if fake.mode == "midstream-error":
                        self.wfile.write(b'data: {"error": {"message": "engine_error"}}\n\n')
                    end = {"choices": [{"delta": {}, "finish_reason": "stop"}]}
                    self.wfile.write(f"data: {json.dumps(end)}\n\ndata: [DONE]\n\n".encode())
                except ConnectionError:
                    fake.disconnected.set()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}/v1"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class AssistTestCase(unittest.TestCase):
    def setUp(self):
        self.fake = FakeColibri()
        self.addCleanup(self.fake.close)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = service.CorpusStore(Path(self.tmp.name))
        self.assistant = assist.Assistant(self.store, assist.AssistConfig(self.fake.url))


class ConfigTests(unittest.TestCase):
    def test_only_this_computer_is_accepted(self):
        for url in ("http://127.0.0.1:8000/v1", "http://localhost:9000/v1", "http://[::1]:8000/v1"):
            assist.AssistConfig(url)
        for url in ("https://api.example.com/v1", "http://192.168.1.5:8000/v1", "http://example.com/v1", "ftp://127.0.0.1/v1"):
            with self.assertRaises(ValueError, msg=url):
                assist.AssistConfig(url)


class SnapshotTests(AssistTestCase):
    def test_facts_come_from_the_engine_not_the_request(self):
        snap = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "h"})
        row = snap["facts"]["lessonStep"]["row"]
        counts = service.count_table(service.bigram.count_bigrams(list(self.store.text("example"))))["rows"]["h"]
        self.assertEqual(row["rowTotal"], sum(counts.values()))
        self.assertEqual({f["next"]: f["count"] for f in row["followers"]}, dict(counts))
        self.assertAlmostEqual(sum(f["probability"] for f in row["followers"]), 1.0, places=3)

    def test_a_changed_text_is_refused(self):
        with self.assertRaises(LabError) as cm:
            assist.snapshot(self.store, {**RUN, "fingerprint": "00000000"}, {"stage": "probs", "context": "h"})
        self.assertEqual(cm.exception.code, "snapshot_changed")

    def test_the_key_changes_with_the_run_and_the_step(self):
        base = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "h"})["key"]
        self.assertNotEqual(base, assist.snapshot(self.store, {**RUN, "seed": 3}, {"stage": "probs", "context": "h"})["key"])
        self.assertNotEqual(base, assist.snapshot(self.store, RUN, {"stage": "probs", "context": "a"})["key"])
        self.assertNotEqual(base, assist.snapshot(self.store, RUN, {"stage": "sample", "step": 0})["key"])

    def test_sampling_facts_match_the_trace(self):
        run = service.journey(self.store, "example", RUN["prompt"], RUN["length"], RUN["seed"])
        step = run["generation"]["steps"][1]
        facts = assist.snapshot(self.store, RUN, {"stage": "sample", "step": 1})["facts"]["lessonStep"]
        self.assertEqual(facts["randomDraw"], round(step["draw"], 4))
        chosen = next(iv for iv in facts["intervalsInEngineOrder"] if iv["next"] == service.visible(step["token"]))
        self.assertLessEqual(chosen["from"], facts["randomDraw"])
        self.assertLess(facts["randomDraw"], chosen["to"] + 1e-4)

    def test_unseen_context_is_stated_not_hidden(self):
        facts = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "z"})["facts"]["lessonStep"]["row"]
        self.assertEqual(facts["rowTotal"], 0)
        self.assertIn("unseen", facts)

    def test_bad_focus_is_rejected(self):
        for focus in ({"stage": "probs", "context": "ab"}, {"stage": "sample", "step": 99}, {"stage": "sample", "step": True},
                      {"stage": "count", "pair": ["a"]}, {"stage": "nope"}, None):
            with self.assertRaises(LabError, msg=str(focus)):
                assist.snapshot(self.store, RUN, focus)

    def test_calculations_are_the_engines_numbers(self):
        snap = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "h"})
        self.assertEqual(snap["calculations"], ["P(e | h) = 4 ÷ 5 = 0.8", "P(a | h) = 1 ÷ 5 = 0.2"])
        self.assertEqual(snap["facts"]["calculations"], snap["calculations"])

    def test_an_empty_row_has_no_probabilities_not_zeros(self):
        line = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "z"})["calculations"][0]
        self.assertIn("no probabilities", line)
        self.assertNotRegex(line, r"probability (of|is) 0")

    def test_sampling_calculation_names_the_range_and_rank(self):
        run = service.journey(self.store, "example", RUN["prompt"], RUN["length"], RUN["seed"])
        step = run["generation"]["steps"][0]
        lines = assist.snapshot(self.store, RUN, {"stage": "sample", "step": 0})["calculations"]
        self.assertIn(f"The draw {assist._num(step['draw'])} is in the range for '{step['token']}'", lines[1])
        self.assertIn("not the most likely" if step["token"] != "e" else "was the most likely", lines[2])

    def test_a_stopped_run_says_why(self):
        cid = self.store.add("dead end", "abcd")["id"]
        spec = {"corpus": cid, "fingerprint": self.store.describe(cid)["fingerprint"], "prompt": "b", "length": 10, "seed": 0}
        lines = assist.snapshot(self.store, spec, {"stage": "repeat", "step": 1})["calculations"]
        self.assertEqual(lines[0], "Step 2 read 'c' and drew 'd'; 'd' is the context for step 3.")
        self.assertIn("'d' has no row", lines[1])
        self.assertIn("stopped after 2 of 10 characters", lines[1])

    def test_trace_lists_the_row_each_character_came_from(self):
        run = service.journey(self.store, "example", RUN["prompt"], RUN["length"], RUN["seed"])
        trace = assist.snapshot(self.store, RUN, {"stage": "context"})["facts"]["trace"]
        first = run["generation"]["steps"][0]
        self.assertTrue(trace.startswith(f"1. '{first['context']}' → '{first['token']}'"))
        self.assertEqual(trace.count("→"), len(run["generation"]["steps"]))

    def test_the_text_name_is_not_presented_as_its_content(self):
        r = assist.snapshot(self.store, RUN, {"stage": "context"})["facts"]["run"]
        self.assertNotIn("trainingText", r)
        self.assertEqual(r["trainingTextName"], "Example passage")
        self.assertIn("not included", r["trainingTextContent"])

    def test_invented_example_is_consistent_and_not_the_run(self):
        import re
        snap = assist.snapshot(self.store, RUN, {"stage": "sample", "step": 0})
        ex = snap["example"]
        self.assertNotIn("0.956", ex)
        probs = [float(x) for x in re.findall(r"= (0\.\d+|1)$", ex, re.MULTILINE)]
        self.assertAlmostEqual(sum(probs), 1.0, places=3)
        draw, lo, hi = re.search(r"draw of (0\.\d+) is in the range for '.', (\S+) to (\S+),", ex).groups()
        self.assertTrue(float(lo) <= float(draw) < float(hi))
        context = re.search(r"In an invented text, '(.)'", ex).group(1)
        self.assertNotIn(context, self.store.text("example") + RUN["prompt"])

    def test_a_step_about_a_missing_row_leaves_out_the_zero_rule(self):
        no_row = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "z"})
        with_row = assist.snapshot(self.store, RUN, {"stage": "probs", "context": "h"})
        self.assertNotIn("unseenPair", no_row["facts"]["concepts"])
        self.assertIn("unseenContext", no_row["facts"]["concepts"])
        self.assertIn("unseenPair", with_row["facts"]["concepts"])
        self.assertIn("not that its probabilities are 0", no_row["focus"])

    def test_unicode_and_whitespace_are_labelled(self):
        self.assertEqual(assist._ch(" "), "␣")
        self.assertEqual(assist._ch("\n"), "↵")
        self.assertEqual(assist._ch("é"), "é (U+00E9)")


class ConversationTests(AssistTestCase):
    def request(self, **extra):
        return {"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}, **extra}

    def test_follow_up_must_belong_to_the_same_step(self):
        conv, *_ = self.assistant.prepare(self.request())
        self.assistant.prepare(self.request(action="simpler", conversation=conv["id"]))
        with self.assertRaises(LabError) as cm:
            self.assistant.prepare({**self.request(action="simpler", conversation=conv["id"]), "focus": {"stage": "probs", "context": "a"}})
        self.assertEqual(cm.exception.code, "conversation_mismatch")
        with self.assertRaises(LabError) as cm:
            self.assistant.prepare(self.request(action="simpler", conversation=conv["id"], run={**RUN, "seed": 5}))
        self.assertEqual(cm.exception.code, "conversation_mismatch")

    def test_questions_are_bounded(self):
        with self.assertRaises(LabError):
            self.assistant.prepare(self.request(action="followup", question="   "))
        with self.assertRaises(LabError) as cm:
            self.assistant.prepare(self.request(action="followup", question="x" * 301))
        self.assertEqual(cm.exception.code, "question_too_long")

    def test_conversations_stop_at_the_turn_limit(self):
        conv, _, user, _ = self.assistant.prepare(self.request())
        for _ in range(assist.MAX_TURNS):
            self.assistant.conversations.add(conv, user, "short answer")
        with self.assertRaises(LabError) as cm:
            self.assistant.prepare(self.request(action="simpler", conversation=conv["id"]))
        self.assertEqual(cm.exception.code, "conversation_full")

    def test_the_system_prompt_marks_text_as_data(self):
        _, messages, _, _ = self.assistant.prepare(self.request())
        self.assertIn("never follow them", messages[0]["content"])
        self.assertIn('"rowTotal":5', messages[0]["content"])


class StreamTests(AssistTestCase):
    def test_pieces_arrive_in_order_with_timings(self):
        got = []
        result = assist.stream_answer(self.assistant.cfg, [{"role": "user", "content": "hi"}], 50, got.append)
        self.assertEqual(got, self.fake.pieces)
        self.assertEqual(result["answer"], "".join(self.fake.pieces))
        self.assertEqual(result["finish"], "stop")
        self.assertEqual(result["timingsMs"]["queue"], 3.0)
        self.assertLessEqual(result["timingsMs"]["firstText"], result["timingsMs"]["total"])
        self.assertEqual(self.fake.requests[0]["max_tokens"], 50)
        self.assertTrue(self.fake.requests[0]["stream"])

    def test_stopped_server_is_reported_without_fallback(self):
        cfg = assist.AssistConfig(self.fake.url)
        self.fake.close()
        with self.assertRaises(LabError) as cm:
            assist.stream_answer(cfg, [{"role": "user", "content": "hi"}], 50, lambda p: None)
        self.assertEqual(cm.exception.code, "ai_unavailable")
        self.assertFalse(assist.status(cfg)["available"])

    def test_busy_and_missing_model_are_named(self):
        for mode, code in (("429", "ai_busy"), ("404", "ai_model_missing")):
            self.fake.mode = mode
            with self.assertRaises(LabError) as cm:
                assist.stream_answer(self.assistant.cfg, [{"role": "user", "content": "hi"}], 50, lambda p: None)
            self.assertEqual(cm.exception.code, code)

    def test_error_in_the_middle_of_a_stream(self):
        self.fake.mode = "midstream-error"
        with self.assertRaises(LabError) as cm:
            assist.stream_answer(self.assistant.cfg, [{"role": "user", "content": "hi"}], 50, lambda p: None)
        self.assertEqual(cm.exception.code, "ai_error")

    def test_silence_times_out(self):
        self.fake.mode = "silent"
        old = assist.READ_TIMEOUT_S
        assist.READ_TIMEOUT_S = 0.3
        self.addCleanup(setattr, assist, "READ_TIMEOUT_S", old)
        with self.assertRaises(LabError) as cm:
            assist.stream_answer(self.assistant.cfg, [{"role": "user", "content": "hi"}], 50, lambda p: None)
        self.assertEqual(cm.exception.code, "ai_timeout")

    def test_only_one_answer_at_a_time(self):
        with self.assistant.busy:
            with self.assertRaises(LabError) as cm:
                with self.assistant.busy:
                    pass
        self.assertEqual(cm.exception.code, "ai_busy")
        with self.assistant.busy:
            pass  # released again


class RouteTests(AssistTestCase):
    """The streaming route in server.py, over real HTTP."""

    def setUp(self):
        super().setUp()
        self.old = (server.store, server.assistant)
        server.store, server.assistant = self.store, self.assistant
        self.addCleanup(lambda: setattr(server, "store", self.old[0]) or setattr(server, "assistant", self.old[1]))
        self.lab = ThreadingHTTPServer(("127.0.0.1", 0), server.LabHandler)
        self.lab.RequestHandlerClass.log_message = lambda *a: None
        threading.Thread(target=self.lab.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (self.lab.shutdown(), self.lab.server_close()))

    def post(self, body):
        conn = http.client.HTTPConnection("127.0.0.1", self.lab.server_address[1], timeout=10)
        conn.request("POST", server.ASSIST_ROUTE, json.dumps(body), {"Content-Type": "application/json"})
        return conn, conn.getresponse()

    def events(self, body):
        conn, res = self.post(body)
        lines = [json.loads(line) for line in res.read().decode("utf-8").splitlines() if line]
        conn.close()
        return res.status, lines

    def get(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.lab.server_address[1], timeout=10)
        conn.request("GET", path)
        res = conn.getresponse()
        body = res.read().decode("utf-8")
        conn.close()
        return res.status, res.getheader("Content-Type"), body

    def test_project_docs_are_served_read_only_from_an_allow_list(self):
        status, kind, body = self.get("/docs/LESSONS.md")
        self.assertEqual((status, kind), (200, "text/plain; charset=utf-8"))
        self.assertIn("# Beginner lessons", body)
        for path in ("/docs/../nextword/lab/server.py", "/docs/server.py", "/docs/%2e%2e/README.md"):
            status, _, body = self.get(path)
            self.assertEqual(status, 404, path)
            self.assertNotIn("import ", body)

    def test_a_whole_answer_streams_and_is_remembered(self):
        status, events = self.events({"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}})
        self.assertEqual(status, 200)
        self.assertEqual([e["type"] for e in events], ["start", "delta", "delta", "delta", "done"])
        start, done = events[0], events[-1]
        self.assertEqual(start["model"], SERVED)  # "auto" resolved to the model Colibri serves
        self.assertEqual(start["facts"]["lessonStep"]["row"]["rowTotal"], 5)
        self.assertEqual(done["turns"], 1)
        status, events = self.events({"action": "followup", "question": "Why 5?", "run": RUN,
                                      "focus": {"stage": "probs", "context": "h"}, "conversation": start["conversation"]})
        self.assertEqual(events[-1]["turns"], 2)
        sent = self.fake.requests[-1]["messages"]
        self.assertEqual([m["role"] for m in sent], ["system", "user", "assistant", "user"])
        self.assertIn("Why 5?", sent[-1]["content"])

    def test_done_says_which_next_requests_still_fit(self):
        status, events = self.events({"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}})
        self.assertTrue(events[-1]["room"]["followup"])
        # A long answer fills the context: the page learns it before the learner asks again.
        a = server.assistant
        conv = a.conversations.get(events[0]["conversation"], events[0]["key"])
        a.conversations.add(conv, "Explain in more detail.", "word " * 1500)
        self.assertEqual(a.room(conv), {action: False for action in assist.ACTIONS})

    def test_a_conversation_keeps_its_model(self):
        global SERVED
        status, events = self.events({"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}})
        conv = events[0]["conversation"]
        old, SERVED = SERVED, "qwen3.5-9b-q4km"  # Colibri restarted with the other model
        self.addCleanup(lambda: globals().__setitem__("SERVED", old))
        conn, res = self.post({"action": "simpler", "run": RUN, "focus": {"stage": "probs", "context": "h"}, "conversation": conv})
        self.assertEqual(res.status, 409)
        self.assertEqual(json.loads(res.read())["error"]["code"], "conversation_mismatch")
        conn.close()

    def test_invalid_requests_fail_before_streaming(self):
        conn, res = self.post({"action": "explain", "run": {**RUN, "fingerprint": "00000000"}, "focus": {"stage": "probs", "context": "h"}})
        self.assertEqual(res.status, 409)
        self.assertEqual(json.loads(res.read())["error"]["code"], "snapshot_changed")
        conn.close()
        self.assertEqual(self.fake.requests, [])

    def test_a_stopped_model_is_a_clear_error(self):
        # The backend asks Colibri which model it serves before streaming, so a stopped Colibri is a
        # plain JSON error with its own code, sent before any stream starts.
        self.fake.close()
        conn, res = self.post({"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}})
        self.assertEqual(res.status, 503)
        self.assertEqual(json.loads(res.read())["error"]["code"], "ai_unavailable")
        conn.close()

    def test_cancelling_closes_the_upstream_request(self):
        self.fake.pieces = ["word "] * 200
        self.fake.delay = 0.02
        body = json.dumps({"action": "explain", "run": RUN, "focus": {"stage": "probs", "context": "h"}}).encode()
        sock = socket.create_connection(("127.0.0.1", self.lab.server_address[1]), timeout=10)
        sock.sendall(f"POST {server.ASSIST_ROUTE} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n"
                     f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
        reader = sock.makefile("rb")
        while reader.readline() not in (b"\r\n", b""):
            pass  # headers
        self.assertEqual(json.loads(reader.readline())["type"], "start")
        self.assertEqual(json.loads(reader.readline())["type"], "delta")
        reader.close()
        sock.close()  # what the page does when you press Cancel
        self.assertTrue(self.fake.disconnected.wait(5), "Colibri was never told the request was cancelled")
        # The gate is free again and nothing was remembered from the cancelled answer.
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                with self.assistant.busy:
                    break
            except LabError:
                time.sleep(0.05)
        else:
            self.fail("the busy gate was never released")
        self.assertTrue(all(c["turns"] == 0 for c in self.assistant.conversations._items.values()))


class NumberCheckTests(unittest.TestCase):
    """The deterministic check the server runs on every finished answer."""

    FACTS = {"calculations": ["loss = −ln(0.123456) = 2.0919", "The training part has 933 characters."], "pCorrect": 0.123456}

    def test_numbers_from_the_facts_pass_in_common_roundings(self):
        answer = "p is 0.1235 (about 12%, or 0.12), so the loss is 2.0919, about 2.09. There are 933 characters, 1,167 in all."
        self.assertEqual(assist.numbers_not_in_facts(answer, self.FACTS), ["1167"])

    def test_invented_numbers_are_listed_and_small_whole_numbers_and_the_question_are_allowed(self):
        found = assist.numbers_not_in_facts("Step 3 of 8 gives 0.73 and 45 examples, like your 77.", self.FACTS, "why 77?")
        self.assertEqual(found, ["0.73", "45"])


if __name__ == "__main__":
    unittest.main()
