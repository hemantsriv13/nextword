"""Checks for the beginner lessons, the tutor's facts, the datasets and the recorded training history.

Real engines throughout: lesson results come from the bigram engine and from small MLPs trained here.
"""

import json
import tempfile
import time
import unittest
from pathlib import Path

from nextword import bigram, datasets
from nextword.lab import service
from nextword.lab.service import LabError

try:
    import torch  # noqa: F401

    from nextword.lab import assist, assist_lesson, lessons, mlp_service
except ImportError:  # PyTorch not installed: the learning lessons are optional
    torch = None

    from nextword.lab import lessons


class DatasetTests(unittest.TestCase):
    def test_tiny_parts_share_no_line(self):
        for d in datasets.tiny().values():
            lines = {k: {x.strip() for x in v.replace(". ", ".\n").splitlines() if x.strip()} for k, v in d["parts"].items()}
            if d["id"] == "tiny-abc":
                continue  # one repeated rule by design; its description says so
            self.assertFalse(lines["train"] & lines["val"], d["id"])
            self.assertFalse(lines["train"] & lines["test"], d["id"])
            self.assertFalse(lines["val"] & lines["test"], d["id"])

    def test_overlap_removal_drops_repeats_and_shared_runs(self):
        train = ["It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife."]
        held = ["“Yes.”", "it is a truth universally acknowledged that a single man in possession of a good fortune, said she.",
                "A wholly new paragraph about something else entirely."]
        kept, report = datasets.remove_overlap(held + [train[0]], train + ["“Yes.”"])
        self.assertEqual(kept, [held[2]])
        self.assertEqual(report, {"repeatedParagraphs": 2, "shared12WordRuns": 1})

    def test_cleaning_keeps_text_and_drops_markup(self):
        raw = ("Header\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\nContents\n\nCHAPTER I.\n\nThe Title\n\n"
               "“Hello,” she said—_twice_.\n[Illustration: a picture\n[_Copyright 1894_]]\n\n* * *\n\nCafé.\n"
               "CHAPTER II.\n\nSecond\n\nMore text.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nLicence")
        text, dropped = datasets.to_ascii(datasets.body(raw))
        chs = datasets.chapters(text, {"heading": r"CHAPTER [IVXLC]+\.", "title_line": True})
        self.assertEqual(chs, ['"Hello," she said - twice.\nCafe.', "More text."])
        self.assertEqual(dropped, 0)

    def test_prepared_datasets_have_disjoint_parts(self):
        found = datasets.prepared()
        if not found:
            self.skipTest("medium and large datasets are not prepared on this computer")
        for m in found.values():
            parts = datasets.parts_of(m)
            train = set(parts["train"].splitlines())
            for k in ("val", "test"):
                self.assertFalse(train & set(parts[k].splitlines()) - {""}, f"{m['id']} {k} repeats a training paragraph")
            self.assertIn("not train", m["trainsOnly"])  # the manifest says what it trains: not Qwen
            self.assertIn("Qwen", m["trainsOnly"])

    def test_store_serves_fixed_parts(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = service.CorpusStore(Path(tmp), datasets_home=None)
            parts = store.parts("ds-tiny-cat")
            self.assertEqual(store.text("ds-tiny-cat"), parts["train"] + parts["val"] + parts["test"])
            info = store.describe("ds-tiny-cat")
            self.assertEqual((info["origin"], info["level"]), ("dataset", "tiny"))
            ev = service.evaluate(store.text("ds-tiny-cat"), 0.8, 0.1, "val", 1, parts)
            self.assertEqual(ev["split"]["val"], len(parts["val"]))
            with self.assertRaises(LabError):
                store.delete("ds-tiny-cat")


class CountingLessonTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.lessons = lessons.Lessons(service.CorpusStore(Path(self.tmp.name), datasets_home=None), Path(self.tmp.name) / "runs")

    def test_every_counting_example_has_one_right_option(self):
        for lid in lessons.COMPUTE:
            for i in range(len(lessons.EXAMPLES[lid])):
                r = self.lessons.result({"lesson": lid, "example": i})
                p = r["prediction"]
                self.assertIn(p["answer"], p["options"], (lid, i))
                self.assertEqual(len(p["options"]), len(set(p["options"])), (lid, i))

    def test_results_match_the_engine(self):
        r = self.lessons.result({"lesson": "counts", "example": 0})
        counts = bigram.count_bigrams(list("banana"))
        self.assertEqual({x["token"]: x["count"] for x in r["row"]}, dict(counts["a"]))
        r = self.lessons.result({"lesson": "probability", "example": 0})
        self.assertEqual(r["fraction"], "2/3")
        self.assertAlmostEqual(r["p"], 2 / 3, places=4)

    def test_sampling_uses_the_engine_draw(self):
        import random
        r = self.lessons.result({"lesson": "sampling", "example": 0})
        probs = bigram.next_token_probabilities(bigram.count_bigrams(list("ab ac ab")), "a")
        token, draw = bigram.sample_next(probs, random.Random(4))
        self.assertEqual((r["token"], r["draw"]), (token, round(draw, 4)))

    def test_bad_requests(self):
        for bad in ({"lesson": "nope"}, {"lesson": "pairs", "example": 9}, {"lesson": "pairs", "example": True}):
            with self.assertRaises(LabError):
                self.lessons.result(bad)


@unittest.skipIf(torch is None, "PyTorch is not installed")
class LearningLessonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.store = service.CorpusStore(root / "u", datasets_home=None)
        cls.lessons = lessons.Lessons(cls.store, root / "runs")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_learning_lessons_use_trained_networks(self):
        for lid in lessons.LEARN:
            r = self.lessons.result({"lesson": lid, "example": 0})
            self.assertIn(r["prediction"]["answer"], r["prediction"]["options"], lid)
        r = self.lessons.result({"lesson": "learning", "example": 0})
        self.assertGreater(r["pAfter"], 0.9)  # the abc rule is learned
        self.assertLess(r["pBefore"], 0.5)

    def test_lesson_runs_are_reused_after_a_restart(self):
        a = self.lessons.result({"lesson": "loss", "example": 0})
        again = lessons.Lessons(self.store, self.lessons.root).result({"lesson": "loss", "example": 0})
        self.assertEqual((a["run"], a["lossAfter"]), (again["run"], again["lossAfter"]))

    def test_tutor_opens_only_after_the_prediction(self):
        for step in ("question", "predict"):
            with self.assertRaises(LabError) as cm:
                assist_lesson.snapshot(self.lessons, {"id": "loss", "step": step, "example": 0})
            self.assertEqual(cm.exception.code, "tutor_after_prediction")
        result = assist_lesson.snapshot(self.lessons, {"id": "loss", "step": "result", "example": 0})
        self.assertTrue(result["facts"]["resultShown"])
        self.assertIn("rightAnswer", result["facts"]["prediction"])
        why = assist_lesson.snapshot(self.lessons, {"id": "loss", "step": "why", "example": 0})
        self.assertNotEqual(result["key"], why["key"])  # changing step marks earlier answers as stale

    def test_tutor_terms_follow_lesson_order(self):
        content = lessons.content()
        snap = assist_lesson.snapshot(self.lessons, {"id": "softmax", "step": "why", "example": 0})
        known = [t["word"] for t in snap["facts"]["termsKnown"]]
        self.assertIn("embedding", known)
        self.assertNotIn("score (logit) and softmax", known)  # its own term comes at the "word for it" step
        self.assertIn("loss (cross-entropy)", snap["facts"]["termsLater"])
        defs = {lsn["term"]["name"]: lsn["term"]["definition"] for lsn in content["lessons"]}
        for t in snap["facts"]["termsKnown"]:
            self.assertEqual(t["definition"], defs[t["word"]])  # only reviewed definitions

    def test_every_lesson_step_leaves_room_for_a_conversation(self):
        # The first tutor run found late lessons over the 2,048-token context; every step must now fit
        # the prompt plus the longest answer, with room for two more turns of about 150 tokens each.
        for lid in lessons.EXAMPLES:
            for step in ("result", "why", "term"):
                snap = assist_lesson.snapshot(self.lessons, {"id": lid, "step": step, "example": 0})
                system = snap["system"] + json.dumps(snap["facts"], ensure_ascii=False, separators=(",", ":"))
                used = assist._estimate_tokens([{"role": "system", "content": system}, {"role": "user", "content": "x" * 300}])
                self.assertLess(used + assist.MAX_TOKENS["explain"] + 2 * 150, assist.CONTEXT_TOKENS, f"{lid}/{step}: {used}")
                self.assertLessEqual(len(snap["facts"]["termsKnown"]), assist_lesson.KEEP_DEFINITIONS)

    def test_a_missing_dataset_is_explained_not_crashed(self):
        snap = assist_lesson.snapshot(self.lessons, {"id": "training", "step": "result", "example": 0})
        self.assertIn("isn't available on this computer", snap["example"])  # this store has no medium dataset
        with self.assertRaises(LabError) as cm:
            self.lessons.result({"lesson": "training", "example": 1})
        self.assertEqual(cm.exception.code, "dataset_missing")

    def test_tutor_is_off_for_the_check(self):
        with self.assertRaises(LabError) as cm:
            assist_lesson.snapshot(self.lessons, {"id": "loss", "step": "check", "example": 0})
        self.assertEqual(cm.exception.code, "tutor_locked")

    def test_a_lesson_request_gets_the_tutor_prompt(self):
        a = assist.Assistant(self.store, assist.AssistConfig(model="qwen3-4b-instruct-2507-q4km"), lessons=self.lessons)
        conv, messages, user, _ = a.prepare({"action": "example", "lesson": {"id": "pairs", "step": "why", "example": 0}})
        self.assertTrue(messages[0]["content"].startswith(assist_lesson.SYSTEM_PROMPT))
        self.assertIn("Another example, computed by the app", user)
        self.assertNotIn("Made-up example", user)


@unittest.skipIf(torch is None, "PyTorch is not installed")
class RecordedTrainingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.store = service.CorpusStore(root / "u", datasets_home=None)
        self.svc = mlp_service.MLPService(self.store, root / "mlp")

    def train(self, steps=200):
        s = self.svc.start({"corpus": "ds-tiny-abc", "context": 2, "embed": 2, "hidden": 8, "steps": steps, "batch": 8, "lr": 0.3, "seed": 2})
        run = self.svc.get(s["id"])
        while run.state == "training":
            time.sleep(0.02)
        return run

    def test_fixed_parts_are_used_as_given(self):
        run = self.train(20)
        self.assertEqual(run.parts, self.store.parts("ds-tiny-abc"))
        self.assertTrue(run.summary()["split"]["how"].startswith("fixed"))

    def test_recorded_steps_are_real_saved_states(self):
        run = self.train(200)
        self.assertEqual(run.recorded_steps(), [0, 1, 2, 4, 5, 9, 10, 19, 20, 49, 50, 99, 100, 199, 200])
        trained = self.svc.inspect({"run": run.id, "checkpoint": "trained", "split": "train", "index": 1})
        final = self.svc.inspect({"run": run.id, "checkpoint": "step:200", "split": "train", "index": 1})
        self.assertEqual(trained["fingerprint"], final["fingerprint"])
        with self.assertRaises(LabError) as cm:
            self.svc.inspect({"run": run.id, "checkpoint": "step:3", "split": "train", "index": 1})
        self.assertEqual(cm.exception.code, "not_recorded")  # never interpolated

    def test_replayed_update_matches_the_recording(self):
        run = self.train(200)
        for step in (1, 10, 200):
            rep = self.svc.replay_update({"run": run.id, "step": step})
            self.assertTrue(rep["check"]["matches"], step)
            self.assertAlmostEqual(rep["batchLoss"], rep["batchLossRecomputed"], places=4)
            e = rep["embedding"]
            for b, g, a in zip(e["before"], e["grad"], e["after"]):
                self.assertAlmostEqual(a, b - rep["lr"] * g, places=3)

    def test_history_survives_save_and_reload(self):
        run = self.train(100)
        before = self.svc.history({"run": run.id, "split": "val", "index": 0})
        fresh = mlp_service.MLPService(self.store, self.svc.root)
        after = fresh.history({"run": run.id, "split": "val", "index": 0})
        self.assertEqual(before["steps"], after["steps"])
        self.assertTrue(fresh.replay_update({"run": run.id, "step": 100})["check"]["matches"])


if __name__ == "__main__":
    unittest.main()
