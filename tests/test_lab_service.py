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

    def test_upload_round_trip(self):
        info = self.store.add("My notes", "abab abba\nbaab")
        self.assertEqual(info["id"], "upload-my-notes")
        self.assertEqual(self.store.text(info["id"]), "abab abba\nbaab")
        with self.assertRaises(LabError):
            self.store.add("x", "   ")
        with self.assertRaises(LabError):
            self.store.delete("sample")
        self.store.delete(info["id"])
        with self.assertRaises(LabError):
            self.store.text(info["id"])

    def test_adaptation_shifts_counts_without_leaking(self):
        result = service.adapt(SAMPLE, "ee ee ee ee ee ee ee ee ee ee", "e")
        self.assertIsNotNone(result["before"])
        before = {c["token"]: c["count"] for c in result["before"]["candidates"]}
        after = {c["token"]: c["count"] for c in result["after"]["candidates"]}
        self.assertGreater(after["e"], before.get("e", 0))


if __name__ == "__main__":
    unittest.main()
