"""Checks for the bigram engine. Run: .venv\\Scripts\\python -m unittest"""

import json
import random
import unittest
from pathlib import Path

from nextword.bigram import (
    UnseenContextError,
    complete,
    count_bigrams,
    generate_steps,
    next_token_probabilities,
    sample_next,
    tokenize,
)

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = (ROOT / "data" / "sample.txt").read_text(encoding="utf-8")


class BigramTests(unittest.TestCase):
    def setUp(self):
        self.counts = count_bigrams(tokenize(SAMPLE))

    def test_outputs_unchanged_from_recorded_baseline(self):
        # Recorded before generate_steps/sample_next replaced rng.choices; must stay identical.
        baseline = json.loads((ROOT / "tests" / "bigram_baseline.json").read_text(encoding="utf-8"))
        for key, expected in baseline.items():
            prompt, seed = key.rsplit("|", 1)
            self.assertEqual(complete(self.counts, prompt, 60, random.Random(int(seed))), expected, key)

    def test_sample_next_matches_rng_choices(self):
        probs = next_token_probabilities(self.counts, "e")
        for seed in range(200):
            ours, _ = sample_next(probs, random.Random(seed))
            theirs = random.Random(seed).choices(list(probs), weights=list(probs.values()))[0]
            self.assertEqual(ours, theirs)

    def test_rows_sum_to_one(self):
        for context in self.counts:
            self.assertAlmostEqual(sum(next_token_probabilities(self.counts, context).values()), 1.0)

    def test_counts_match_corpus(self):
        self.assertEqual(sum(sum(row.values()) for row in self.counts.values()), len(SAMPLE) - 1)
        self.assertEqual(self.counts["n"][" "], SAMPLE.count("n "))

    def test_steps_and_full_generation_agree(self):
        steps = list(generate_steps(self.counts, "The rain", 40, random.Random(7)))
        self.assertEqual("".join(s.token for s in steps), complete(self.counts, "The rain", 40, random.Random(7)))
        # A shorter run is a prefix of a longer one with the same seed.
        short = complete(self.counts, "The rain", 10, random.Random(7))
        self.assertEqual(short, "".join(s.token for s in steps)[:10])

    def test_draw_lands_in_chosen_tokens_interval(self):
        for step in generate_steps(self.counts, "a", 50, random.Random(3)):
            low = 0.0
            for token, p in step.probabilities.items():
                if token == step.token:
                    self.assertTrue(low <= step.draw < low + p + 1e-12)
                    break
                low += p

    def test_inspecting_probabilities_consumes_no_randomness(self):
        rng = random.Random(5)
        next_token_probabilities(self.counts, "t")
        self.assertEqual(rng.random(), random.Random(5).random())

    def test_unseen_and_empty_input(self):
        with self.assertRaises(UnseenContextError):
            complete(self.counts, "Hello!", 10, random.Random(0))
        with self.assertRaises(ValueError):
            complete(self.counts, "", 10, random.Random(0))


if __name__ == "__main__":
    unittest.main()
