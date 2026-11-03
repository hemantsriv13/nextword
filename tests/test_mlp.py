"""Checks for the character MLP (nextword/mlp.py) and its Lab service (nextword/lab/mlp_service.py).

Every test trains a real, tiny model on the CPU; nothing here is mocked.
"""

import math
import secrets
import tempfile
import time
import unittest
from pathlib import Path

from nextword.lab import service
from nextword.lab.service import LabError

try:
    import torch

    from nextword import mlp
    from nextword.lab import assist_mlp, mlp_service
except ImportError:  # PyTorch not installed: the MLP is optional
    torch = None

PATTERN = "abcabcabcabcabcabcabcabcabcabc" * 20  # 600 characters with one rule: a→b→c→a


def wait(run, timeout=60):
    end = time.time() + timeout
    while run.state == "training" and time.time() < end:
        time.sleep(0.02)


@unittest.skipIf(torch is None, "PyTorch is not installed")
class MLPTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.store = service.CorpusStore(root / "uploads")
        self.svc = mlp_service.MLPService(self.store, root / "mlp")
        self.pattern = self.store.add("pattern", PATTERN)["id"]

    def train(self, corpus=None, **cfg):
        settings = {"context": 2, "embed": 4, "hidden": 16, "steps": 300, "batch": 32, "lr": 0.5, "seed": 3, **cfg}
        summary = self.svc.start({"corpus": corpus or self.pattern, **settings})
        run = self.svc.get(summary["id"])
        wait(run)
        return run


class LearningTests(MLPTestCase):
    def test_it_learns_a_controlled_pattern(self):
        run = self.train()
        self.assertEqual(run.state, "done")
        first, last = run.curve[0], run.curve[-1]
        self.assertAlmostEqual(first["val"], math.log(run.summary()["vocabSize"]), delta=0.6)  # random start ≈ uniform
        self.assertLess(last["val"], 0.05)
        self.assertLess(last["train"], 0.05)
        gen = self.svc.generate({"run": run.id, "checkpoint": "trained", "prompt": "ab", "length": 9, "seed": 1})
        self.assertEqual(gen["text"], "cabcabcab")

    def test_probabilities_and_loss_are_consistent(self):
        run = self.train()
        ins = self.svc.inspect({"run": run.id, "checkpoint": "initial", "split": "train", "index": 5})
        self.assertAlmostEqual(ins["probs"]["sum"], 1.0, places=5)
        self.assertAlmostEqual(ins["loss"], -math.log(ins["probs"]["target"]), places=3)
        self.assertAlmostEqual(ins["uniformLoss"], math.log(ins["model"]["vocab"]), places=4)
        self.assertEqual(len(ins["embeddings"]), 2)
        self.assertEqual(ins["joined"]["size"], 2 * 4)
        # One gradient step on this example raises the probability of its correct character.
        self.assertGreater(ins["update"]["pTargetAfter"], ins["probs"]["target"])
        e = ins["update"]["embedding"]
        for b, g, a in zip(e["before"], e["grad"], e["after"]):
            self.assertAlmostEqual(a, b - run.cfg.lr * g, places=3)

    def test_same_seed_same_weights(self):
        a, b = self.train(seed=7), self.train(seed=7)
        self.assertEqual(a.fingerprints(), b.fingerprints())
        c = self.train(seed=8)
        self.assertNotEqual(a.fingerprints()["initial"], c.fingerprints()["initial"])


class RunControlTests(MLPTestCase):
    def test_stop_keeps_a_trained_checkpoint(self):
        summary = self.svc.start({"corpus": self.pattern, "context": 2, "embed": 4, "hidden": 16, "steps": 20000, "batch": 32, "lr": 0.1, "seed": 1})
        run = self.svc.get(summary["id"])
        time.sleep(0.2)
        self.svc.stop(run.id)
        wait(run)
        self.assertEqual(run.state, "stopped")
        self.assertLess(run.step, 20000)
        self.assertIn("trained", run.fingerprints())

    def test_only_one_training_at_a_time(self):
        summary = self.svc.start({"corpus": self.pattern, "steps": 20000, "seed": 1})
        with self.assertRaises(LabError) as cm:
            self.svc.start({"corpus": self.pattern, "steps": 10, "seed": 2})
        self.assertEqual(cm.exception.code, "busy")
        self.svc.stop(summary["id"])
        wait(self.svc.get(summary["id"]))

    def test_save_and_reload_give_identical_weights_and_predictions(self):
        run = self.train()
        before = self.svc.inspect({"run": run.id, "checkpoint": "trained", "split": "val", "index": 3})
        fresh = mlp_service.MLPService(self.store, self.svc.root)  # a new server process, in effect
        again = fresh.get(run.id)
        self.assertEqual(again.fingerprints(), run.fingerprints())
        after = fresh.inspect({"run": run.id, "checkpoint": "trained", "split": "val", "index": 3})
        self.assertEqual(after["probs"], before["probs"])
        self.assertEqual(after["loss"], before["loss"])

    def test_reset_removes_the_run_and_its_files(self):
        run = self.train()
        self.assertTrue((self.svc.root / run.id / "trained.pt").exists())
        self.svc.reset(run.id)
        self.assertFalse((self.svc.root / run.id).exists())
        with self.assertRaises(LabError):
            self.svc.get(run.id)

    def test_settings_are_bounded(self):
        for bad in ({"context": 0}, {"hidden": 10_000}, {"steps": 10**6}, {"lr": 5}, {"embed": 2.5}):
            with self.assertRaises(LabError, msg=str(bad)):
                self.svc.start({"corpus": self.pattern, **bad})


class DataSeparationTests(MLPTestCase):
    def test_vocabulary_comes_from_training_text_only(self):
        # 'z' appears only in the last 20% (validation and test): it must be ⟨?⟩ to the model.
        cid = self.store.add("tail", "ab" * 200 + "zz" * 50)["id"]
        run = self.train(corpus=cid, steps=50)
        self.assertNotIn("z", run.vocab.itos)
        xs, ys = run.data["val_eval"]
        self.assertTrue(all(run.vocab.itos[i] in ("a", "b", mlp.UNKNOWN) for i in ys.tolist()))

    def test_windows_never_cross_a_split(self):
        run = self.train()
        xs, _ = run.data["val_eval"]
        start = run.vocab.stoi[mlp.START]
        self.assertEqual(xs[0].tolist(), [start, run.vocab.id(run.parts["val"][0])])  # padded, not borrowed from train

    def test_test_examples_cannot_be_inspected(self):
        run = self.train(steps=20)
        with self.assertRaises(LabError) as cm:
            self.svc.inspect({"run": run.id, "checkpoint": "trained", "split": "test", "index": 0})
        self.assertEqual(cm.exception.code, "bad_split")

    def test_bigram_comparison_uses_the_same_targets(self):
        run = self.train()
        cmp = self.svc.compare({"run": run.id})
        for row in cmp["rows"]:
            self.assertEqual(row["targets"], row["bigram_targets"])
            self.assertLess(row["mlp_trained"], row["mlp_initial"])


class ExplanationFactTests(MLPTestCase):
    def test_facts_refuse_changed_weights_and_use_real_numbers(self):
        run = self.train()
        fp = run.fingerprints()["trained"]
        with self.assertRaises(LabError) as cm:
            assist_mlp.snapshot(self.svc, {"run": run.id, "checkpoint": "trained", "fingerprint": "000000000000"}, {"stage": "loss"})
        self.assertEqual(cm.exception.code, "snapshot_changed")
        snap = assist_mlp.snapshot(self.svc, {"run": run.id, "checkpoint": "trained", "fingerprint": fp}, {"stage": "loss", "split": "train", "index": 2})
        ins = self.svc.inspect({"run": run.id, "checkpoint": "trained", "split": "train", "index": 2})
        self.assertIn(f"loss = −ln(", snap["calculations"][-1])
        self.assertIn(assist_mlp._n(ins["loss"], 4), snap["calculations"][-1])
        self.assertIn("You (the explainer) are a different, larger model", snap["facts"]["modelBeingStudied"])
        self.assertIn(fp, snap["key"])

    def test_an_mlp_request_gets_the_mlp_prompt_and_its_own_conversation(self):
        from nextword.lab import assist
        run = self.train()
        a = assist.Assistant(self.store, assist.AssistConfig(model="qwen3-4b-instruct-2507-q4km"), mlps=self.svc)
        ref = {"run": run.id, "checkpoint": "trained", "fingerprint": run.fingerprints()["trained"]}
        conv, messages, user, _ = a.prepare({"action": "explain", "mlp": ref, "focus": {"stage": "update", "split": "train", "index": 1}})
        self.assertTrue(messages[0]["content"].startswith(assist_mlp.SYSTEM_PROMPT))
        self.assertIn("Weight update", user)
        self.assertEqual(a.facts_of(conv)["lessonStep"]["name"], "Weight update")
        self.assertEqual(conv["model"], "qwen3-4b-instruct-2507-q4km")


class EngineStatusTests(MLPTestCase):
    """/api/engines reports the MLP's real state (it needs PyTorch, not the explaining model)."""

    def engines(self):
        from nextword.lab import server
        old = server.mlps
        server.mlps = self.svc
        self.addCleanup(lambda: setattr(server, "mlps", old))
        return {e["id"]: e for e in server.r_engines(None)}

    def test_the_mlp_is_available_when_pytorch_imports(self):
        mlp_engine = self.engines()["char-mlp"]
        self.assertEqual(mlp_engine["status"], "available")
        self.assertTrue(mlp_engine["version"].startswith("PyTorch "))
        self.assertEqual((mlp_engine["route"], mlp_engine["reason"]), ("mlp", None))

    def test_without_pytorch_it_says_why_and_what_to_do(self):
        saved = (mlp_service.torch, mlp_service.TORCH_ERROR)
        mlp_service.torch, mlp_service.TORCH_ERROR = None, "No module named 'torch'"
        self.addCleanup(lambda: setattr(mlp_service, "torch", saved[0]) or setattr(mlp_service, "TORCH_ERROR", saved[1]))
        mlp_engine = self.engines()["char-mlp"]
        self.assertEqual(mlp_engine["status"], "unavailable")
        self.assertIn("No module named 'torch'", mlp_engine["reason"])
        self.assertIn("requirements-mlp.txt", mlp_engine["nextAction"])
        self.assertEqual(self.engines()["tiny-transformer"]["status"], "planned")


class ResumeAndSelectionTests(MLPTestCase):
    """Regression tests for the release: runs survive a server stop, resume exactly, and the test part
    scores a checkpoint chosen on validation only."""

    SETTINGS = {"context": 2, "embed": 4, "hidden": 16, "steps": 120, "batch": 16, "lr": 0.5, "seed": 5}

    def fresh_run(self, svc=None):
        svc = svc or self.svc
        run = mlp_service.Run("m" + "0" * 9, self.store.describe(self.pattern), self.store.text(self.pattern),
                              mlp.Config(**self.SETTINGS).check(), 0.0)
        run.id = "m" + secrets.token_hex(5)
        svc.runs[run.id] = run
        return run

    def uninterrupted(self):
        run = self.fresh_run()
        run.train()
        return run

    def test_stop_then_resume_gives_the_same_weights_as_no_stop(self):
        whole = self.uninterrupted()
        part = self.fresh_run()
        part.train(on_done=self.svc._save, until=47)
        self.assertEqual((part.state, part.step), ("stopped", 47))
        self.assertTrue(part.summary()["resumable"])
        self.assertFalse(part.summary()["complete"])
        self.svc.resume(part.id)
        wait(part)
        self.assertEqual(part.state, "done")
        self.assertEqual(part.fingerprints()["trained"], whole.fingerprints()["trained"])
        self.assertEqual(part.history_fingerprints(), whole.history_fingerprints())
        # The same curve, plus the point measured where training stopped.
        self.assertEqual([p for p in part.curve if p["step"] != 47], whole.curve)

    def test_a_run_interrupted_by_a_server_stop_reloads_as_interrupted_and_resumes_exactly(self):
        whole = self.uninterrupted()
        saved = mlp_service.PROGRESS_SECONDS
        mlp_service.PROGRESS_SECONDS = 0  # write progress after every update
        self.addCleanup(setattr, mlp_service, "PROGRESS_SECONDS", saved)
        run = self.fresh_run()
        run.train(on_progress=self.svc._progress, until=60)  # no final save: as if the server died at step 60
        files = sorted(p.name for p in (self.svc.root / run.id).iterdir())
        self.assertEqual([f for f in files if f.startswith("progress-")], ["progress-000060.pt"])  # older ones removed
        restarted = mlp_service.MLPService(self.store, self.svc.root)  # a new server process
        self.assertEqual(restarted.saved()[0]["state"], "interrupted")
        again = restarted.get(run.id)
        self.assertEqual((again.state, again.step), ("interrupted", 60))
        self.assertTrue(again.summary()["resumable"])
        self.assertEqual(again.fingerprints()["trained"], mlp.fingerprint(run.model))  # the weights at step 60
        restarted.resume(run.id)
        wait(again)
        self.assertEqual(again.state, "done")
        self.assertEqual(again.fingerprints()["trained"], whole.fingerprints()["trained"])

    def test_a_partial_progress_file_is_never_described_by_run_json(self):
        saved = mlp_service.PROGRESS_SECONDS
        mlp_service.PROGRESS_SECONDS = 0
        self.addCleanup(setattr, mlp_service, "PROGRESS_SECONDS", saved)
        run = self.fresh_run()
        run.train(on_progress=self.svc._progress, until=10)
        d = self.svc.root / run.id
        (d / "progress-000011.pt.tmp").write_bytes(b"half a file")  # a crash in the middle of the next write
        again = mlp_service.MLPService(self.store, self.svc.root).get(run.id)
        self.assertEqual((again.state, again.step), ("interrupted", 10))

    def test_finished_runs_cannot_be_resumed_and_old_runs_without_state_offer_restart(self):
        run = self.train(steps=30)
        with self.assertRaises(LabError) as cm:
            self.svc.resume(run.id)
        self.assertEqual(cm.exception.code, "not_resumable")
        stopped = self.fresh_run()
        stopped.train(on_done=self.svc._save, until=20)
        (self.svc.root / stopped.id / "resume.pt").unlink()  # saved before resume existed
        old = mlp_service.MLPService(self.store, self.svc.root).get(stopped.id)
        self.assertEqual(old.state, "stopped")
        self.assertFalse(old.summary()["resumable"])

    def test_resuming_hides_the_old_trained_checkpoint_until_training_ends(self):
        saved = mlp_service.PROGRESS_SECONDS
        mlp_service.PROGRESS_SECONDS = 0
        self.addCleanup(setattr, mlp_service, "PROGRESS_SECONDS", saved)
        run = self.fresh_run()
        run.train(on_done=self.svc._save, until=30)
        self.assertEqual(sorted(run.fingerprints()), ["best", "initial", "trained"])
        seen = []
        run.train(on_progress=lambda r: seen.append((r.state, sorted(r.fingerprints()))), until=33)
        self.assertEqual(seen, [("training", ["initial"])] * 3)  # while weights change, only "initial" is offered
        self.assertEqual((run.state, run.step), ("stopped", 33))
        self.assertEqual(sorted(run.fingerprints()), ["best", "initial", "trained"])

    def test_selected_checkpoint_has_the_lowest_validation_loss_and_scores_the_test_part(self):
        run = self.train(steps=200)
        best = run.summary()["best"]
        self.assertEqual(best["val"], min(p["val"] for p in run.curve))
        self.assertIn(best["step"], [p["step"] for p in run.curve if p["val"] == best["val"]])
        cmp = self.svc.compare({"run": run.id})
        test = next(r for r in cmp["rows"] if r["part"] == "test")
        self.assertEqual(test["mlp_best"], round(mlp.mean_loss(run.checkpoint_model("best"), *run.data["test_eval"]), 5))
        self.assertEqual(cmp["best"]["step"], best["step"])
        for key in ("vocabulary", "unknown", "smoothing", "selection", "targets"):
            self.assertIn(key, cmp["policy"])
        reloaded = mlp_service.MLPService(self.store, self.svc.root).get(run.id)
        self.assertEqual(reloaded.fingerprints(), run.fingerprints())

    def test_unknown_targets_are_counted_for_both_models(self):
        cid = self.store.add("tail", "ab" * 200 + "zz" * 50)["id"]
        run = self.train(corpus=cid, steps=30)
        cmp = self.svc.compare({"run": run.id})
        for row in cmp["rows"]:
            self.assertEqual(row["unknownTargets"], run.parts[row["part"]][1:].count("z"))
            self.assertIsNotNone(row["bigram_add1"])


if __name__ == "__main__":
    unittest.main()
