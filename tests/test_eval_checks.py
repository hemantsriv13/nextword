"""Checks for the evaluation's automatic detectors (evals/local_ai/run_eval.py).

Each detector must catch the real mistakes found by reading answers, and must not flag the correct
wording of the same idea. The sentences below are taken from, or modelled on, recorded answers.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "evals" / "local_ai"))

import run_eval as R  # noqa: E402

ROWS = {"h": {"e": 4, "a": 1}, "a": {"t": 9, " ": 2, "n": 1}, "n": {" ": 1}}
STEPS = [{"context": "h", "token": "a"}, {"context": "a", "token": "n"}]
CTX = {"steps": STEPS, "rows": ROWS}


class DetectorTests(unittest.TestCase):
    def test_probability_zero_for_a_missing_row(self):
        wrong = [
            'Thus, the probability of any character following "z" is 0.',
            "So, when the model tries to predict after 'd', there's no data—its probability is 0.",
        ]
        right = [
            "Without a row, there are no probabilities, not even zero.",
            'It doesn\'t say "0" — it says "no probabilities at all." No pair starts with \'z\'.',
        ]
        for s, c in zip(wrong, ("z", "d")):
            self.assertTrue(R.unseen_called_zero(s, c), s)
        for s in right:
            self.assertFalse(R.unseen_called_zero(s, "z"), s)

    def test_seed_overclaim(self):
        self.assertTrue(R.seed_overclaim("However, the probabilities at each step remain the same."))
        self.assertFalse(R.seed_overclaim("But the first step's probabilities stay fixed."))
        self.assertFalse(R.seed_overclaim("Later steps can differ, because each step may read a different row."))

    def test_trace_claims(self):
        self.assertEqual(R.trace_claims('The generated text starts with "an", which follows "a", not "h".', CTX), ['"an", which follows "a"'])
        self.assertEqual(R.trace_claims('"h" starts 5 pairs (like "h→e", "h→x").', CTX), ['"h→x"'])
        self.assertEqual(R.trace_claims("'a' came from the row for 'h'. 'e' follows 'h'.", CTX), [])

    def test_made_up_example(self):
        facts = {"lessonStep": {"randomDraw": 0.956, "intervalsInEngineOrder": [{"probability": 0.8}, {"probability": 0.2}]}}
        relabelled = ('Made-up example (not from this run):\n"e" with 80% probability (range 0.0 to 0.8)\n"a" with 20% '
                      '(range 0.8 to 1.0)\nA random number is drawn: 0.956. It picks "a".')
        good = ("Made-up example (not from this run)\nIn an invented text, 'q' is followed by 'u' 3 times, 'o' 1 time. "
                "u from 0 to 0.75, o from 0.75 to 1. A draw of 0.88 is in the range for 'o', so 'o' is chosen.\n\n"
                "In this run\nThe draw 0.956 falls in the 'a' range, so 'a' is chosen.")
        inconsistent = ("Made-up example: 'u' from 0 to 0.75, 'o' from 0.75 to 1. A draw of 0.5 picks 'o'.")
        self.assertFalse(R.made_up_check(relabelled, facts)["pass"])
        self.assertTrue(R.made_up_check(good, facts)["pass"])
        self.assertFalse(R.made_up_check(inconsistent, facts)["pass"])
        # Sharing a single number with the run is allowed.
        self.assertTrue(R.made_up_check("Made-up example: 'u' from 0 to 0.8, 'o' from 0.8 to 1. A draw of 0.3 picks 'u'.", facts)["pass"])



class TutorCheckTests(unittest.TestCase):
    def setUp(self):
        import run_tutor_eval as T
        self.T = T
        self.facts = {"result": ["With random weights it gives 'b' 0.1813."], "termsLater": ["embedding", "loss (cross-entropy)"]}

    def test_later_terms_are_flagged_unless_the_learner_or_facts_used_them(self):
        T = self.T
        self.assertEqual(T.later_terms("Each letter has an embedding.", self.facts, None), ["embedding"])
        self.assertEqual(T.later_terms("Each letter has an embedding.", self.facts, "What is an embedding?"), [])
        self.assertEqual(T.later_terms("It gives b 0.1813.", self.facts, None), [])
        self.assertEqual(T.later_terms("The loss is small.", self.facts, None), ["loss"])

    def test_certifying_and_length_checks(self):
        T = self.T
        self.assertFalse(T.check({"kind": "no_certify"}, "Well done, you understand it now.", self.facts, None)["pass"])
        self.assertTrue(T.check({"kind": "no_certify"}, "Count each pair to see it.", self.facts, None)["pass"])
        self.assertFalse(T.check({"kind": "max_sentences", "value": 3}, "One. Two. Three. Four.", self.facts, None)["pass"])
        self.assertTrue(T.check({"kind": "max_sentences", "value": 3}, "p is 0.25. That is small. Fine.", self.facts, None)["pass"])
        self.assertFalse(T.check({"kind": "numbers_from_facts"}, "It is 0.5123.", self.facts, None)["pass"])


if __name__ == "__main__":
    unittest.main()
