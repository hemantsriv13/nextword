"""Checks for the Lab backend's calculations (nextword/lab/service.py)."""

import math
import random
import tempfile
import unittest
from pathlib import Path

from nextword import bigram
from nextword.lab import service
from nextword.lab.service import LabError

SAMPLE = service.SAMPLE_PATH.read_text(encoding="utf-8")


class SplitAndEvaluationTests(unittest.TestCase):
    def test_split_is_contiguous_and_complete(self):
        parts = service.split_text(SAMPLE, 0.8, 0.1)
        self.assertEqual(parts["train"] + parts["val"] + parts["test"], SAMPLE)

    def test_no_pair_straddles_a_split(self):
        # Every evaluated pair comes from inside the held-out part, never across the boundary.
        result = service.evaluate(SAMPLE, 0.8, 0.1, "val", 0)
        held = service.split_text(SAMPLE, 0.8, 0.1)["val"]
        self.assertEqual(result["targets"], len(held) - 1)

    def test_unsmoothed_loss_matches_formula(self):
        result = service.evaluate(SAMPLE, 0.8, 0.1, "val", 0)
        parts = service.split_text(SAMPLE, 0.8, 0.1)
        counts = bigram.count_bigrams(bigram.tokenize(parts["train"]))
        first = result["examples"][0]
        a, b = parts["val"][0], parts["val"][1]
        row = counts.get(a, {})
        expected = row.get(b, 0) / sum(row.values()) if row else 0
        self.assertAlmostEqual(first["p"], expected)
        if expected > 0:
            self.assertAlmostEqual(first["nll"], -math.log(expected))

    def test_unseen_events_make_unsmoothed_perplexity_undefined(self):
        result = service.evaluate(SAMPLE, 0.8, 0.1, "val", 0)
        if result["unseenContext"] + result["unseenPair"] > 0:
            self.assertIsNone(result["meanNll"])
            self.assertIsNone(result["perplexity"])

    def test_smoothed_distribution_sums_to_one(self):
        train = SAMPLE[:900]
        counts = bigram.count_bigrams(bigram.tokenize(train))
        v = len(set(train)) + 1
        k = 0.5
        for context, row in counts.items():
            total = sum(row.values())
            mass = sum((row.get(t, 0) + k) / (total + k * v) for t in set(train)) + k / (total + k * v)
            self.assertAlmostEqual(mass, 1.0)

    def test_smoothing_gives_finite_perplexity(self):
        result = service.evaluate(SAMPLE, 0.8, 0.1, "val", 1)
        self.assertIsNotNone(result["perplexity"])
        self.assertAlmostEqual(result["perplexity"], math.exp(result["meanNll"]))

    def test_bad_settings_are_refused(self):
        for args in [(0.9, 0.2, "val", 0), (0.8, 0.1, "train", 0), (0.8, 0.1, "val", -1)]:
            with self.assertRaises(LabError):
                service.evaluate(SAMPLE, *args)


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = service.CorpusStore(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_generation_matches_cli_engine(self):
        result = service.generate(self.store, "sample", "The rain", 40, 1)
        counts = bigram.count_bigrams(bigram.tokenize(SAMPLE))
        self.assertEqual(result["suggestion"], bigram.complete(counts, "The rain", 40, random.Random(1)))
        self.assertEqual(result["suggestion"], " Thed we cite se l clod the s t the fit ")

    def test_trace_distributions_are_valid(self):
        result = service.generate(self.store, "sample", "a", 30, 9)
        for step in result["steps"]:
            self.assertAlmostEqual(sum(c["p"] for c in step["candidates"]), 1.0)
            self.assertTrue(0 <= step["draw"] < 1)

    def test_count_cache_is_reported(self):
        first = service.generate(self.store, "sample", "a", 5, 1)
        second = service.generate(self.store, "sample", "a", 5, 1)
        self.assertFalse(first["timingsMs"]["countCacheHit"])
        self.assertTrue(second["timingsMs"]["countCacheHit"])
        self.assertEqual(first["suggestion"], second["suggestion"])

    def test_invalid_requests(self):
        for prompt, length, seed in [("", 5, 1), ("a", 0, 1), ("a", 5, -1), ("Hello!", 5, 1)]:
            with self.assertRaises(LabError):
                service.generate(self.store, "sample", prompt, length, seed)

    def test_emoji_and_combining_marks_are_code_points(self):
        # The engine's character is one code point (Python's list(text)); the web app mirrors this.
        # "🌧" is outside the BMP (two UTF-16 units in JavaScript); "é" is written e + U+0301.
        text = "rain 🌧 rain 🌧 café 🌧 rain"
        info = self.store.add("Weather", text)
        self.assertEqual(info["chars"], len(list(text)))
        result = service.generate(self.store, info["id"], "rain 🌧", 12, 4)
        self.assertEqual(result["contextUsed"], "🌧")
        self.assertEqual(result["steps"][0]["context"], "🌧")
        for step in result["steps"]:
            self.assertEqual(len(step["token"]), 1)
            self.assertEqual(len(step["context"]), 1)
        # Each step reads the previous step's token, and the tokens join into the suggestion.
        for before, after in zip(result["steps"], result["steps"][1:]):
            self.assertEqual(after["context"], before["token"])
        self.assertEqual("".join(s["token"] for s in result["steps"]), result["suggestion"])
        # The combining accent is its own character, with "e" as its only predecessor.
        accent = service.distribution(bigram.count_bigrams(bigram.tokenize(text)), "e")
        self.assertIn("́", [c["token"] for c in accent["candidates"]])
        accent_prompt = service.generate(self.store, info["id"], "café", 3, 1)
        self.assertEqual(accent_prompt["contextUsed"], "́")

    def test_journey_is_one_consistent_snapshot(self):
        result = service.journey(self.store, "example", "a cat sat on th", 10, 2)
        text = result["text"]
        self.assertEqual(text, service.EXAMPLE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(result["corpus"]["fingerprint"], service._fingerprint(text))
        self.assertEqual(result["generation"]["corpus"]["fingerprint"], result["corpus"]["fingerprint"])
        self.assertEqual(result["table"]["pairs"], len(text) - 1)
        # The table is the engine's own count of exactly this text.
        counts = bigram.count_bigrams(bigram.tokenize(text))
        self.assertEqual(result["table"]["rows"], {c: dict(r) for c, r in counts.items()})
        # The run is the same as an ordinary generation with the same settings.
        plain = service.generate(self.store, "example", "a cat sat on th", 10, 2)
        self.assertEqual(result["generation"]["suggestion"], plain["suggestion"])
        self.assertEqual(result["generation"]["steps"], plain["steps"])
        self.assertEqual(result["generation"]["suggestion"], bigram.complete(counts, "a cat sat on th", 10, random.Random(2)))
        # Every step's probabilities are its row's counts divided by the row total.
        for step in result["generation"]["steps"]:
            row = counts[step["context"]]
            total = sum(row.values())
            for c in step["candidates"]:
                self.assertAlmostEqual(c["p"], row[c["token"]] / total)

    def test_example_text_is_built_in_and_protected(self):
        ids = [c["id"] for c in self.store.list()]
        self.assertIn("example", ids)
        self.assertEqual(self.store.describe("example")["name"], "Example passage")
        with self.assertRaises(LabError):
            self.store.delete("example")

    def test_journey_refuses_texts_too_long_to_show(self):
        info = self.store.add("Long", "ab" * 15_000)
        with self.assertRaises(LabError) as err:
            service.journey(self.store, info["id"], "a", 5, 1)
        self.assertEqual(err.exception.code, "too_large_for_journey")

    def test_upload_round_trip(self):
        info = self.store.add("My notes", "abab abba\nbaab")
        self.assertTrue(info["id"].startswith("upload-c"))
        self.assertEqual(info["name"], "My notes")
        self.assertEqual(self.store.text(info["id"]), "abab abba\nbaab")
        with self.assertRaises(LabError):
            self.store.add("x", "   ")
        with self.assertRaises(LabError):
            self.store.delete("sample")
        self.store.delete(info["id"])
        with self.assertRaises(LabError):
            self.store.text(info["id"])
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])  # text and its metadata both removed

    def test_names_that_slugify_alike_never_overwrite(self):
        first = self.store.add("My Notes", "first text, kept")
        second = self.store.add("my-notes", "second text")
        third = self.store.add("My Notes", "third text, same name as the first")
        ids = {first["id"], second["id"], third["id"]}
        self.assertEqual(len(ids), 3)
        self.assertEqual(self.store.text(first["id"]), "first text, kept")
        self.assertEqual(self.store.text(second["id"]), "second text")
        self.assertEqual(self.store.text(third["id"]), "third text, same name as the first")
        self.assertEqual(first["fingerprint"], service._fingerprint("first text, kept"))
        self.assertEqual(len(self.store.list()), 5)  # the sample, the example and three uploads

    def test_repeated_identical_uploads_stay_separate(self):
        a = self.store.add("Same", "identical text")
        b = self.store.add("Same", "identical text")
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(a["fingerprint"], b["fingerprint"])
        self.store.delete(a["id"])
        self.assertEqual(self.store.text(b["id"]), "identical text")

    def test_upload_never_replaces_an_existing_file(self):
        original = self.store.add("Keep me", "original")
        path = Path(self.tmp.name) / (original["id"].removeprefix("upload-") + ".txt")
        before = path.read_bytes()
        for _ in range(20):
            self.store.add("Keep me", "something else")
        self.assertEqual(path.read_bytes(), before)

    def test_files_from_before_ids_still_work(self):
        legacy = Path(self.tmp.name) / "my-old-notes.txt"
        legacy.write_text("old upload text", encoding="utf-8")
        info = self.store.describe("upload-my-old-notes")
        self.assertEqual(info["name"], "my old notes")
        self.assertEqual(self.store.text("upload-my-old-notes"), "old upload text")
        self.store.add("my-old-notes", "a new upload with the same name")
        self.assertEqual(legacy.read_text(encoding="utf-8"), "old upload text")

    def test_counts_cache_follows_content(self):
        legacy = Path(self.tmp.name) / "edited.txt"
        legacy.write_text("aaaa", encoding="utf-8")
        counts, _, _ = self.store.counts("upload-edited")
        self.assertEqual(counts["a"]["a"], 3)
        legacy.write_text("abab", encoding="utf-8")  # changed outside the Lab
        counts, hit, _ = self.store.counts("upload-edited")
        self.assertFalse(hit)
        self.assertNotIn("a", counts["a"])

    def test_adaptation_shifts_counts_without_leaking(self):
        result = service.adapt(SAMPLE, "ee ee ee ee ee ee ee ee ee ee", "e")
        self.assertIsNotNone(result["before"])
        before = {c["token"]: c["count"] for c in result["before"]["candidates"]}
        after = {c["token"]: c["count"] for c in result["after"]["candidates"]}
        self.assertGreater(after["e"], before.get("e", 0))


if __name__ == "__main__":
    unittest.main()
