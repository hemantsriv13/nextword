"""The MLP journey's backend: train the character MLP (nextword/mlp.py) on a Lab text, in a background
thread, and answer questions about the run with numbers computed from its real weights.

A run has three checkpoints:
    initial   the random weights before any update (step 0)
    trained   the weights when training finished or was stopped (the latest weights)
    best      the weights at the curve point with the lowest validation loss: model selection uses the
              validation part only, and the test part then scores this checkpoint once (compare())
Each is identified by a fingerprint of its weights, so an explanation can name exactly which weights
it describes. Runs are saved under data/lab/mlp/<id>/ (ignored by Git) and can be reloaded.

Recorded history: while it trains, a run also keeps the weights at a few chosen steps (step:N) and, for
the updates that produce them, the exact batch of examples used. Training is far too fast to watch, so
the page replays these recordings: each replayed state is a real saved state, never an interpolation.

Interruption and resume: while training, a run writes its latest weights and everything needed to
continue (step, the batch-order generator's state, curve, recordings, best checkpoint) every few seconds,
atomically. If the server stops mid-training, the run reloads as "interrupted" at its latest saved step.
Plain gradient descent has no optimizer state besides the learning rate, so a stopped or interrupted run
can be resumed exactly: resuming gives the same weights as training without the interruption (tested).

Data separation: a dataset (nextword/datasets.py) has fixed train / validation / test parts; any other
text is split into contiguous 80/10/10 parts *before* any example is made (the same split as the
Evaluation bench), so no window crosses two parts. Training uses only the train part. Validation loss is
shown while training. The test part is used only by compare(), which reports it once; nothing is chosen
by looking at it.
"""

import copy
import json
import math
import os
import secrets
import shutil
import threading
import time
from pathlib import Path

from nextword.lab import service
from nextword.lab.service import LabError, visible

try:
    import warnings
    warnings.filterwarnings("ignore", message="Failed to initialize NumPy")  # NextWord doesn't need NumPy
    import torch
    from torch.nn import functional as F

    from nextword import mlp
    torch.set_num_threads(2)  # leave CPU for the Lab and the explanation model
    TORCH_ERROR = None
except ImportError as err:  # the rest of the Lab works without PyTorch
    torch = None
    TORCH_ERROR = str(err)

MLP_DIR = service.UPLOAD_DIR / "mlp"
TRAIN_FRACTION, VAL_FRACTION = 0.8, 0.1
MAX_TEXT_CHARS = 200_000          # pasted or uploaded texts
MAX_DATASET_CHARS = 1_500_000     # prepared datasets (the large one is 1.24 million characters)
CURVE_POINTS = 50
# The curve's losses are measured on at most this many examples per part (a fixed sample, the same for every
# run on the same text), so measuring stays fast on a large text. compare() always uses every example.
CURVE_SAMPLE = 20_000
SHOW = 16  # values shown per vector in an inspection; the rest are summarised
# Steps whose weights are recorded for replay (plus the step before each, so that update can be replayed).
RECORD_STEPS = (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000)
RECORD_BATCH_SHOWN = 8
PROGRESS_SECONDS = 3.0  # how often a training run writes its latest state to disk
INCOMPLETE = ("stopped", "interrupted")


def _require_torch():
    if torch is None:
        raise LabError("the MLP needs PyTorch, which isn't installed: "
                       ".venv\\Scripts\\python -m pip install --index-url https://download.pytorch.org/whl/cpu torch",
                       503, "torch_missing")


def _label(c: str) -> str:
    return c if c in ("⟨start⟩", "⟨?⟩") else visible(c)


def _r(x: float, places: int = 4) -> float:
    return round(float(x), places)


def _atomic(path: Path, write) -> None:
    """Write a file so that a crash leaves either the old file or the new one, never half of one."""
    tmp = path.with_name(path.name + ".tmp")
    write(tmp)
    os.replace(tmp, path)


def _sample(xs, ys, cap: int):
    if len(xs) <= cap:
        return xs, ys
    idx = torch.randperm(len(xs), generator=torch.Generator().manual_seed(12345))[:cap].sort().values
    return xs[idx], ys[idx]


class Run:
    def __init__(self, run_id: str, corpus: dict, text: str, cfg, created: float, parts: dict | None = None):
        self.id = run_id
        self.corpus = corpus
        self.cfg = cfg
        self.created = created
        self.lock = threading.Lock()
        self.stop_flag = threading.Event()
        self.state = "new"          # new → training → done | stopped | error; "interrupted" after a reload
        self.error = None
        self.step = 0
        self.curve: list[dict] = []
        self.ms_per_step = None
        self.train_seconds = None
        self.fixed_parts = parts is not None
        if parts is None:
            parts = service.split_text(text, TRAIN_FRACTION, VAL_FRACTION)
        self.parts = {k: parts[k] for k in ("train", "val", "test")}
        self.bounds = [len(self.parts["train"]), len(self.parts["train"]) + len(self.parts["val"])]
        self.vocab = mlp.Vocab(self.parts["train"])
        # Training uses every target of the train part (windows padded with ⟨start⟩). Evaluation uses
        # targets from the 2nd character of each part on, the same targets the bigram can be scored on.
        self.data = {"train": mlp.examples(self.parts["train"], self.vocab, cfg.context, 0)}
        xs, ys = self.data["train"]
        self.data["train_eval"] = (xs[1:], ys[1:])  # the same windows from the 2nd target on
        for k in ("val", "test"):
            self.data[k + "_eval"] = mlp.examples(self.parts[k], self.vocab, cfg.context, 1)
        self.curve_data = {k: _sample(*self.data[k + "_eval"], CURVE_SAMPLE) for k in ("train", "val")}
        self.model = mlp.build(self.vocab, cfg)
        self.initial = copy.deepcopy(self.model.state_dict())
        self.trained = None
        self.best = None                     # lowest validation loss so far: state, step and loss
        self.best_step = None
        self.best_val = None
        self.gen = None                      # the batch-order generator, kept so training can resume
        self.resumable = False
        self.history: dict[int, dict] = {}   # step → recorded weights
        self.updates: dict[int, dict] = {}   # step → the recorded update that produced those weights
        self.samples: dict[str, str] = {}
        self.predictions: list[dict] = []

    # ------------------------------------------------------------------ checkpoints
    def state_of(self, name: str) -> dict:
        if name == "initial":
            return self.initial
        if name == "trained":
            if self.trained is None:
                raise LabError("this run has no trained checkpoint yet: train it, or stop the training", 409, "not_trained")
            return self.trained
        if name == "best":
            if self.best is None or self.state == "training":
                raise LabError("this run has no validation-selected checkpoint yet", 409, "not_trained")
            return self.best
        if isinstance(name, str) and name.startswith("step:") and name[5:].isdigit():
            step = int(name[5:])
            if step == 0:
                return self.initial
            if step in self.history:
                return self.history[step]
            raise LabError(f"step {step} was not recorded; recorded steps: {', '.join(map(str, self.recorded_steps()))}", 404, "not_recorded")
        raise LabError("checkpoint must be 'initial', 'trained', 'best' or a recorded 'step:N'", 422, "bad_checkpoint")

    def recorded_steps(self) -> list[int]:
        return sorted({0, *self.history})

    def checkpoint_model(self, name: str):
        state = self.state_of(name)
        m = mlp.CharMLP(len(self.vocab), self.cfg.context, self.cfg.embed, self.cfg.hidden)
        m.load_state_dict(state)
        m.eval()
        return m

    def fingerprints(self) -> dict:
        out = {"initial": mlp.fingerprint(self.checkpoint_model("initial"))}
        if self.trained is not None:
            out["trained"] = mlp.fingerprint(self.checkpoint_model("trained"))
        if self.best is not None and self.state != "training":
            out["best"] = mlp.fingerprint(self.checkpoint_model("best"))
        return out

    def history_fingerprints(self) -> dict:
        return {str(k): mlp.fingerprint(self.checkpoint_model(f"step:{k}")) for k in sorted(self.history)}

    # ------------------------------------------------------------------ training
    def train(self, on_done=None, on_progress=None, until: int | None = None) -> None:
        """Train from the current step to cfg.steps (or to `until`, which behaves like pressing Stop there).
        A run that was stopped or interrupted continues exactly where it left off."""
        cfg = self.cfg
        xs, ys = self.data["train"]
        if self.gen is None:
            self.gen = torch.Generator().manual_seed(cfg.seed)
        gen = self.gen
        every = max(1, cfg.steps // CURVE_POINTS)
        record = {s for s in RECORD_STEPS if s <= cfg.steps} | {cfg.steps}
        first = self.step + 1
        with self.lock:
            self.trained = None  # weights that are still changing are never shown as "trained"
            self.state = "training"
        self.resumable = False
        t0 = time.perf_counter()
        before = self.train_seconds or 0.0
        last_save = t0
        try:
            if first == 1:
                self._point(0)
            for step in range(first, cfg.steps + 1):
                if self.stop_flag.is_set() or (until is not None and step > until):
                    break
                idx = torch.randint(0, len(xs), (min(cfg.batch, len(xs)),), generator=gen)
                with self.lock:
                    if step in record:
                        if step - 1 > 0:
                            self.history[step - 1] = copy.deepcopy(self.model.state_dict())
                        loss, norms = mlp.train_step(self.model, xs[idx], ys[idx], cfg.lr, record=True)
                        self.history[step] = copy.deepcopy(self.model.state_dict())
                        self.updates[step] = {"step": step, "batch": idx.tolist(), "batchLoss": loss,
                                              "gradNorms": {k: _r(v, 6) for k, v in norms.items()}}
                    else:
                        mlp.train_step(self.model, xs[idx], ys[idx], cfg.lr)
                    self.step = step
                if step % every == 0 or step == cfg.steps:
                    self._point(step)
                if on_progress and time.perf_counter() - last_save >= PROGRESS_SECONDS:
                    self.train_seconds = before + time.perf_counter() - t0
                    on_progress(self)
                    last_save = time.perf_counter()
            if self.curve[-1]["step"] != self.step:
                self._point(self.step)
            self.train_seconds = before + time.perf_counter() - t0
            self.ms_per_step = self.train_seconds * 1000 / self.step if self.step else None
            with self.lock:
                self.trained = copy.deepcopy(self.model.state_dict())
            final = "done" if self.step >= cfg.steps else "stopped"
            self.resumable = final == "stopped"
            # Samples and files are written before the run says it is finished, so anything that
            # reacts to "done" (the page, a reload) finds them in place.
            self._finish()
            if on_done:
                on_done(self, final)
            self.state = final
        except Exception as err:  # noqa: BLE001 - shown on the page, never crashes the server
            self.state, self.error = "error", f"{type(err).__name__}: {err}"

    def _point(self, step: int) -> None:
        with self.lock:
            point = {"step": step, "train": _r(mlp.mean_loss(self.model, *self.curve_data["train"]) or 0, 5),
                     "val": None}
            val = mlp.mean_loss(self.model, *self.curve_data["val"])
            point["val"] = None if val is None else _r(val, 5)
            # Model selection on validation only: keep the weights with the lowest validation loss so far.
            if val is not None and (self.best_val is None or val < self.best_val):
                self.best, self.best_step, self.best_val = copy.deepcopy(self.model.state_dict()), step, val
        self.curve.append(point)

    def _finish(self) -> None:
        for name in ("initial", "trained"):
            m = self.checkpoint_model(name)
            prompt = self.parts["train"][: self.cfg.context] or " "
            self.samples[name] = "".join(s["token"] for s in mlp.generate(m, self.vocab, prompt, 60, self.cfg.seed))
        xs, ys = self.data["val_eval"]
        rows = []
        before, after = self.checkpoint_model("initial"), self.checkpoint_model("trained")
        with torch.no_grad():
            for i in range(min(6, len(xs))):
                row = {"window": [_label(self.vocab.itos[j]) for j in xs[i].tolist()], "target": _label(self.vocab.itos[ys[i].item()])}
                for name, m in (("initial", before), ("trained", after)):
                    p = F.softmax(m(xs[i : i + 1]), dim=1)[0]
                    top = torch.topk(p, 3)
                    row[name] = {"pTarget": _r(p[ys[i]].item()),
                                 "top": [{"token": _label(self.vocab.itos[j]), "p": _r(v)} for v, j in zip(top.values.tolist(), top.indices.tolist())]}
                rows.append(row)
        self.predictions = rows

    # ------------------------------------------------------------------ views
    def summary(self) -> dict:
        n = {k: len(self.data[k][1]) for k in ("train", "val_eval", "test_eval")}
        curve_n = {k: len(self.curve_data[k][1]) for k in ("train", "val")}
        return {
            "id": self.id, "state": self.state, "error": self.error, "step": self.step, "config": self.cfg.__dict__,
            "corpus": self.corpus, "created": self.created,
            "split": {"train": len(self.parts["train"]), "val": len(self.parts["val"]), "test": len(self.parts["test"]), "bounds": self.bounds,
                      "how": "fixed dataset parts" if self.fixed_parts else "contiguous 80% / 10% / 10% of the text"},
            "curveSample": curve_n, "recorded": self.recorded_steps(),
            "best": None if self.best_step is None else {"step": self.best_step, "val": _r(self.best_val, 5),
                                                         "how": "the curve point with the lowest validation loss"},
            "complete": self.state == "done", "resumable": self.resumable and self.state in INCOMPLETE,
            "examples": {"train": n["train"], "val": n["val_eval"], "test": n["test_eval"]},
            "vocab": [_label(c) for c in self.vocab.itos], "vocabSize": len(self.vocab),
            "params": mlp.count_params(self.model), "curve": self.curve,
            "msPerStep": self.ms_per_step, "trainSeconds": self.train_seconds,
            "fingerprints": self.fingerprints(), "samples": self.samples, "predictions": self.predictions,
            "engine": "PyTorch " + torch.__version__ + " (CPU)",
        }


class MLPService:
    """Runs in memory, one training at a time, saved to disk when training ends."""

    def __init__(self, store: service.CorpusStore, root: Path = MLP_DIR):
        self.store = store
        self.root = root
        self.runs: dict[str, Run] = {}
        self.training: Run | None = None
        self._lock = threading.Lock()

    def status(self) -> dict:
        return {"available": torch is not None, "error": TORCH_ERROR,
                "torch": torch.__version__ if torch is not None else None,
                "threads": torch.get_num_threads() if torch is not None else None,
                "limits": mlp.LIMITS if torch is not None else None,
                "defaults": mlp.Config().__dict__ if torch is not None else None,
                "training": self.training.id if self.training else None,
                "saved": self.saved()}

    def saved(self) -> list[dict]:
        out = []
        if self.root.exists():
            for meta in self.root.glob("*/run.json"):
                try:
                    d = json.loads(meta.read_text(encoding="utf-8"))
                    row = {k: d.get(k) for k in ("id", "state", "step", "config", "corpus", "created")}
                    live = self.runs.get(row["id"])
                    if live is not None:
                        row["state"], row["step"] = live.state, live.step
                    elif row["state"] == "training":  # written while training, and the server stopped since
                        row["state"] = "interrupted"
                    out.append(row)
                except (OSError, ValueError):
                    continue
        out.sort(key=lambda r: r.get("created") or 0, reverse=True)  # newest first
        return out[:30]

    def start(self, data: dict) -> dict:
        _require_torch()
        corpus_id = data.get("corpus") or "sample"
        text = self.store.text(corpus_id)
        parts = self.store.parts(corpus_id)
        limit = MAX_DATASET_CHARS if parts is not None else MAX_TEXT_CHARS
        if len(text) > limit:
            raise LabError(f"the MLP journey trains on texts up to {limit:,} characters", 413, "too_large")
        defaults = mlp.Config().__dict__
        try:
            cfg = mlp.Config(**{k: data.get(k, v) for k, v in defaults.items()}).check()
        except (TypeError, ValueError) as err:
            raise LabError(str(err), 422, "bad_config") from err
        with self._lock:
            if self.training and self.training.state == "training":
                raise LabError("another run is training; stop it first", 409, "busy")
            run = Run("m" + secrets.token_hex(5), self.store.describe(corpus_id), text, cfg, time.time(), parts)
            if len(run.data["train"][0]) < 2 or len(run.data["val_eval"][0]) < 1:
                raise LabError("this text is too short to split into training and validation parts", 422, "too_short")
            self.runs[run.id] = run
            self.training = run
        self._begin(run)
        return run.summary()

    def _begin(self, run: Run) -> None:
        threading.Thread(target=run.train, args=(self._save, self._progress), daemon=True).start()

    def resume(self, run_id) -> dict:
        """Continue a stopped or interrupted run from its latest saved step, with its saved batch order."""
        _require_torch()
        run = self.get(run_id)
        with self._lock:
            if self.training and self.training.state == "training":
                raise LabError("another run is training; stop it first", 409, "busy")
            if run.state not in INCOMPLETE or not run.resumable:
                raise LabError("only a stopped or interrupted run with its saved training state can be resumed; "
                               "train a new run instead", 409, "not_resumable")
            run.stop_flag.clear()
            run.state = "training"  # set before the thread starts, so a second request is refused
            self.training = run
        self._begin(run)
        return run.summary()

    def get(self, run_id) -> Run:
        run = self.runs.get(run_id) if isinstance(run_id, str) else None
        if run is None:
            run = self._load(run_id)
        return run

    def stop(self, run_id) -> dict:
        run = self.get(run_id)
        run.stop_flag.set()
        return {"id": run.id, "stopping": run.state == "training"}

    def reset(self, run_id) -> dict:
        run = self.get(run_id)
        if run.state == "training":
            raise LabError("stop the training before removing the run", 409, "busy")
        self.runs.pop(run.id, None)
        target = (self.root / run.id).resolve()
        if target.parent == self.root.resolve() and target.exists():
            shutil.rmtree(target)
        return {"removed": run.id}

    # ------------------------------------------------------------------ saving and loading
    def _meta(self, run: Run, state: str, latest) -> dict:
        meta = {**run.summary(), "state": state}
        meta["fingerprints"] = {"initial": meta["fingerprints"]["initial"], "trained": mlp.fingerprint(latest)}
        if run.best is not None:
            meta["fingerprints"]["best"] = mlp.fingerprint(self._model(run, run.best))
        meta["updates"] = list(run.updates.values())
        meta["historyFingerprints"] = run.history_fingerprints()
        return meta

    @staticmethod
    def _model(run: Run, state: dict):
        m = run.checkpoint_model("initial")
        m.load_state_dict(state)
        return m

    def _initial(self, run: Run, d: Path) -> None:
        if not (d / "initial.pt").exists():
            _atomic(d / "initial.pt", lambda p: mlp.save(p, run.checkpoint_model("initial"), run.vocab, run.cfg, {"run": run.id}))

    @staticmethod
    def _drop_progress(d: Path, keep: str | None = None) -> None:
        for f in d.glob("progress-*.pt"):
            if f.name != keep:
                f.unlink(missing_ok=True)

    def _progress(self, run: Run) -> None:
        """Called by the training thread every few seconds. Everything needed to continue goes into ONE file named
        by its step (weights, best checkpoint, recordings, the batch-order generator's state); run.json is
        rewritten only after it, so a crash at any moment leaves run.json describing a complete file."""
        d = self.root / run.id
        d.mkdir(parents=True, exist_ok=True)
        self._initial(run, d)
        weights = copy.deepcopy(run.model.state_dict())
        name = f"progress-{run.step:06d}.pt"
        _atomic(d / name, lambda p: torch.save({"format": "nextword-mlp-progress-1", "step": run.step, "weights": weights,
                                                "best": run.best, "bestStep": run.best_step, "bestVal": run.best_val,
                                                "generator": run.gen.get_state(), "history": dict(run.history)}, p))
        meta = {**self._meta(run, "training", self._model(run, weights)), "progress": name}
        _atomic(d / "run.json", lambda p: p.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8"))
        self._drop_progress(d, keep=name)

    def _save(self, run: Run, final: str) -> None:
        """A finished or stopped run: its checkpoints, recordings and (for a stopped run) what resuming needs."""
        d = self.root / run.id
        d.mkdir(parents=True, exist_ok=True)
        self._initial(run, d)
        latest = run.checkpoint_model("trained")
        meta = self._meta(run, final, latest)
        if run.best is not None:
            best = self._model(run, run.best)
            _atomic(d / "best.pt", lambda p: mlp.save(p, best, run.vocab, run.cfg, {"run": run.id, "step": run.best_step}))
        _atomic(d / "trained.pt", lambda p: mlp.save(p, latest, run.vocab, run.cfg, {"run": run.id, "step": run.step}))
        _atomic(d / "history.pt", lambda p: torch.save({"format": "nextword-mlp-history-1", "states": dict(run.history)}, p))
        # Plain gradient descent keeps no optimizer state besides the learning rate; the batch order comes from a
        # seeded generator, whose state is all that continuing needs beyond the weights and the step.
        _atomic(d / "resume.pt", lambda p: torch.save({"format": "nextword-mlp-resume-1", "step": run.step,
                                                       "generator": run.gen.get_state(), "bestVal": run.best_val,
                                                       "bestStep": run.best_step}, p))
        _atomic(d / "run.json", lambda p: p.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8"))
        self._drop_progress(d)

    def _load(self, run_id) -> Run:
        _require_torch()
        if not isinstance(run_id, str) or not run_id.isalnum():
            raise LabError("no such run", 404, "unknown_run")
        d = self.root / run_id
        if not (d / "run.json").exists():
            raise LabError("no such run", 404, "unknown_run")
        meta = json.loads((d / "run.json").read_text(encoding="utf-8"))
        text = self.store.text(meta["corpus"]["id"])
        if service._fingerprint(text) != meta["corpus"]["fingerprint"]:
            raise LabError("the training text has changed since this run was saved; train a new run", 409, "snapshot_changed")
        initial, _, cfg, _ = mlp.load(d / "initial.pt")
        run = Run(run_id, meta["corpus"], text, cfg, meta["created"], self.store.parts(meta["corpus"]["id"]))
        run.initial = copy.deepcopy(initial.state_dict())
        run.updates = {u["step"]: u for u in meta.get("updates", [])}
        resume = None
        if meta["state"] == "training" and meta.get("progress"):
            # Written while training and the server stopped since: reload the latest progress file, as interrupted.
            blob = torch.load(d / meta["progress"], map_location="cpu", weights_only=True)
            if blob.get("format") != "nextword-mlp-progress-1" or blob["step"] != meta["step"]:
                raise LabError("this run's saved progress is incomplete; train a new run", 409, "corrupt_run")
            run.trained, run.best = blob["weights"], blob["best"]
            run.history = {int(k): v for k, v in blob["history"].items()}
            resume, run.state = blob, "interrupted"
        else:
            run.trained = copy.deepcopy(mlp.load(d / "trained.pt")[0].state_dict())
            if (d / "best.pt").exists():
                run.best = copy.deepcopy(mlp.load(d / "best.pt")[0].state_dict())
            if (d / "history.pt").exists():  # runs saved before recording existed have no history
                blob = torch.load(d / "history.pt", map_location="cpu", weights_only=True)
                run.history = {int(k): v for k, v in blob["states"].items()}
            if (d / "resume.pt").exists():
                resume = torch.load(d / "resume.pt", map_location="cpu", weights_only=True)
            run.state = "interrupted" if meta["state"] == "training" else meta["state"]
        run.model.load_state_dict(run.trained)
        run.step = meta["step"]
        run.curve = [p for p in meta["curve"] if p["step"] <= run.step]
        run.ms_per_step, run.train_seconds = meta.get("msPerStep"), meta.get("trainSeconds")
        run.samples, run.predictions = meta.get("samples", {}), meta.get("predictions", [])
        if resume is not None and resume.get("step") == run.step and resume.get("generator") is not None:
            run.gen = torch.Generator()
            run.gen.set_state(resume["generator"])
            run.best_step, run.best_val = resume.get("bestStep"), resume.get("bestVal")
            run.resumable = run.state in INCOMPLETE and run.step < cfg.steps
        if run.best is not None and run.best_step is None:
            run.best = None  # a best checkpoint without its record isn't used
        if run.fingerprints() != {k: v for k, v in meta["fingerprints"].items() if k != "best" or run.best is not None} \
                or run.history_fingerprints() != meta.get("historyFingerprints", {}):
            raise LabError("the saved weights don't match their record; train a new run", 409, "corrupt_run")
        self.runs[run_id] = run
        return run

    # ------------------------------------------------------------------ one example through the model
    def example(self, run: Run, split: str, index) -> tuple[torch.Tensor, int]:
        key = {"train": "train", "val": "val_eval"}.get(split)
        if key is None:
            raise LabError("inspect a training or validation example (test examples are kept for the final comparison)", 422, "bad_split")
        xs, ys = run.data[key]
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(xs):
            raise LabError(f"example must be from 0 to {len(xs) - 1}", 422, "bad_example")
        return xs[index], ys[index].item()

    def examples_list(self, data: dict) -> dict:
        """A page of (window, next character) examples from the training or validation part."""
        _require_torch()
        run = self.get(data.get("run"))
        key = {"train": "train", "val": "val_eval"}.get(data.get("split", "train"))
        if key is None:
            raise LabError("list training or validation examples", 422, "bad_split")
        xs, ys = run.data[key]
        start, count = data.get("start", 0), data.get("count", 8)
        if not isinstance(start, int) or not isinstance(count, int) or start < 0 or not 1 <= count <= 50:
            raise LabError("start must be 0 or more and count from 1 to 50", 422, "bad_page")
        rows = [{"index": i, "window": [_label(run.vocab.itos[j]) for j in xs[i].tolist()], "target": _label(run.vocab.itos[ys[i].item()])}
                for i in range(start, min(start + count, len(xs)))]
        return {"total": len(xs), "start": start, "rows": rows}

    def inspect(self, data: dict) -> dict:
        _require_torch()
        run = self.get(data.get("run"))
        checkpoint = data.get("checkpoint", "trained")
        split = data.get("split", "train")
        window, target = self.example(run, split, data.get("index", 0))
        m = run.checkpoint_model(checkpoint)
        v, cfg = run.vocab, run.cfg
        with torch.no_grad():
            t = m.trace(window)
        probs = t["probs"]
        top = torch.topk(probs, min(10, len(probs)))
        p_target = probs[target].item()
        loss = -math.log(p_target)
        # One real gradient-descent step on this example alone, on a copy of the weights.
        m2 = copy.deepcopy(m)
        m2.train()
        m2.zero_grad()
        F.cross_entropy(m2(window.unsqueeze(0)), torch.tensor([target])).backward()
        first = window[0].item()
        e_before = m2.emb.weight[first].detach().clone()
        e_grad = m2.emb.weight.grad[first].clone()
        w_before = m2.out.weight[target].detach().clone()
        w_grad = m2.out.weight.grad[target].clone()
        grad_norms = {name: _r(p.grad.norm().item(), 5) for name, p in m2.named_parameters()}
        with torch.no_grad():
            for p in m2.parameters():
                p -= cfg.lr * p.grad
            p_after = F.softmax(m2(window.unsqueeze(0)), dim=1)[0, target].item()

        def vec(x: torch.Tensor) -> dict:
            vals = x.tolist()
            return {"values": [_r(a) for a in vals[:SHOW]], "size": len(vals), "shown": min(SHOW, len(vals))}

        return {
            "run": run.id, "checkpoint": checkpoint, "fingerprint": mlp.fingerprint(m), "split": split,
            "index": data.get("index", 0), "examples": len(run.data[{"train": "train", "val": "val_eval"}[split]][0]),
            "window": [_label(v.itos[i]) for i in window.tolist()], "windowIds": window.tolist(),
            "target": _label(v.itos[target]), "targetId": target,
            "embeddings": [[_r(a) for a in row] for row in t["embeddings"].tolist()],
            "joined": vec(t["x"]), "hiddenBefore": vec(t["pre"]), "hidden": vec(t["h"]),
            "hiddenStats": {"size": cfg.hidden, "saturated": int((t["h"].abs() > 0.97).sum().item())},
            "logits": {"top": [{"token": _label(v.itos[i]), "logit": _r(t["logits"][i].item())} for i in top.indices.tolist()],
                       "target": _r(t["logits"][target].item()), "size": len(v)},
            "probs": {"top": [{"token": _label(v.itos[i]), "p": _r(p)} for p, i in zip(top.values.tolist(), top.indices.tolist())],
                      "target": _r(p_target, 6), "sum": _r(probs.sum().item(), 6), "uniform": _r(1 / len(v), 6)},
            "loss": _r(loss, 5), "uniformLoss": _r(math.log(len(v)), 5),
            "update": {
                "lr": cfg.lr, "gradNorms": grad_norms,
                "embedding": {"token": _label(v.itos[first]), "before": [_r(a) for a in e_before.tolist()],
                              "grad": [_r(a, 5) for a in e_grad.tolist()], "after": [_r(a) for a in (e_before - cfg.lr * e_grad).tolist()]},
                "outputRow": {"token": _label(v.itos[target]), "before": [_r(a) for a in w_before.tolist()[:8]],
                              "grad": [_r(a, 5) for a in w_grad.tolist()[:8]], "after": [_r(a) for a in (w_before - cfg.lr * w_grad).tolist()[:8]],
                              "size": len(w_before)},
                "pTargetAfter": _r(p_after, 6), "lossAfter": _r(-math.log(p_after), 5),
            },
            "model": {"context": cfg.context, "embed": cfg.embed, "hidden": cfg.hidden, "vocab": len(v), "params": mlp.count_params(m)},
        }

    def generate(self, data: dict) -> dict:
        _require_torch()
        run = self.get(data.get("run"))
        checkpoint = data.get("checkpoint", "trained")
        prompt = data.get("prompt") or run.parts["train"][: run.cfg.context]
        length, seed = data.get("length", 40), data.get("seed", 1)
        if not isinstance(prompt, str) or len(prompt) > service.MAX_PROMPT_CHARS:
            raise LabError("the prompt is too long", 413, "prompt_too_long")
        if not isinstance(length, int) or not 1 <= length <= 200:
            raise LabError("length must be from 1 to 200", 422, "bad_length")
        if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed < 2**32:
            raise LabError("seed must be a whole number from 0 to 4,294,967,295", 422, "bad_seed")
        m = run.checkpoint_model(checkpoint)
        steps = mlp.generate(m, run.vocab, prompt, length, seed)
        for s in steps:
            s["window"] = [_label(c) for c in s["window"]]
            s["tokenLabel"] = _label(s["token"])
            s["top"] = [{"token": _label(x["token"]), "p": _r(x["p"])} for x in s["top"]]
            s["p"], s["draw"] = _r(s["p"]), _r(s["draw"])
        return {"run": run.id, "checkpoint": checkpoint, "fingerprint": mlp.fingerprint(m), "prompt": prompt, "seed": seed,
                "text": "".join(s["token"] for s in steps), "steps": steps}

    def compare(self, data: dict) -> dict:
        """MLP vs bigram on the same split and the same targets (2nd character of each part onwards).
        Loss is mean −ln p in nats. The bigram is scored unsmoothed (as the engine is) and add-1 smoothed."""
        _require_torch()
        run = self.get(data.get("run"))
        text = self.store.text(run.corpus["id"])
        parts = run.parts if run.fixed_parts else None
        how = ("the dataset's fixed train, validation and test parts" if run.fixed_parts
               else "contiguous 80% train, 10% validation, 10% test, split before any example is made")
        out = {"run": run.id, "split": how,
               "rule": "mean −ln p over every character from the second of each part on; same targets for both models",
               "uniform": _r(math.log(len(run.vocab)), 5), "rows": []}
        names = ["initial"] + (["trained"] if run.trained is not None else []) + (["best"] if "best" in run.fingerprints() else [])
        known = set(run.vocab.itos)
        for on in ("val", "test"):
            row = {"part": on, "targets": len(run.data[on + "_eval"][1]),
                   "unknownTargets": sum(1 for c in run.parts[on][1:] if c not in known)}
            for name in names:
                loss = mlp.mean_loss(run.checkpoint_model(name), *run.data[on + "_eval"])
                row["mlp_" + name] = None if loss is None else _r(loss, 5)
            for k, label in ((0, "bigram"), (1, "bigram_add1")):
                ev = service.evaluate(text, TRAIN_FRACTION, VAL_FRACTION, on, k, parts)
                row[label] = None if ev["meanNll"] is None else _r(ev["meanNll"], 5)
                if k == 0:
                    row["bigram_unseen"] = ev["unseenContext"] + ev["unseenPair"]
                    row["bigram_targets"] = ev["targets"]
            out["rows"].append(row)
        out["best"] = None if "best" not in names else {"step": run.best_step, "val": _r(run.best_val, 5)}
        out["policy"] = {
            "vocabulary": f"both models use the characters of the training part only ({len(run.vocab) - 2} characters)",
            "unknown": ("a character never seen in training counts as one 'unknown' outcome for both models. "
                        "The MLP predicts ⟨?⟩ and the add-1 bigram keeps one extra slot for it. The unsmoothed bigram gives it 0"),
            "smoothing": "MLP: none needed (softmax is never 0). Bigram: unsmoothed (the engine as built) and add-1",
            "selection": ("the 'selected' MLP checkpoint is chosen by validation loss only; its test loss is the final, "
                          "one-time evaluation"),
            "targets": "every character from the second of each part on, the same targets for every column",
        }
        out["note"] = ("The MLP never gives probability 0 (softmax), so its loss is always finite. The unsmoothed bigram "
                       "gives 0 to any pair it never counted, so its loss can be infinite; the add-1 row smooths it the "
                       "way the Evaluation bench does. Test numbers are shown for comparison only and were not used to "
                       "choose any setting.")
        return out

    # ------------------------------------------------------------------ recorded training, replayed
    def history(self, data: dict) -> dict:
        """Every recorded step of a run, with losses measured now from the weights saved at that step,
        and one example's prediction at each. Nothing is interpolated between recorded steps."""
        _require_torch()
        run = self.get(data.get("run"))
        if run.state == "training":
            raise LabError("wait for the training to finish; the recording is complete only then", 409, "busy")
        window, target = self.example(run, data.get("split", "val"), data.get("index", 0))
        rows = []
        for step in run.recorded_steps():
            m = run.checkpoint_model(f"step:{step}")
            with torch.no_grad():
                p = F.softmax(m(window.unsqueeze(0)), dim=1)[0]
            top = torch.topk(p, 3)
            rows.append({"step": step, "fingerprint": mlp.fingerprint(m),
                         "train": _r(mlp.mean_loss(m, *run.curve_data["train"]), 5),
                         "val": _r(mlp.mean_loss(m, *run.curve_data["val"]), 5),
                         "pTarget": _r(p[target].item(), 6),
                         "top": [{"token": _label(run.vocab.itos[j]), "p": _r(v)} for v, j in zip(top.values.tolist(), top.indices.tolist())],
                         "replayable": step in run.updates})
        return {"run": run.id, "kind": "recorded", "steps": rows, "stepsTrained": run.step,
                "window": [_label(run.vocab.itos[i]) for i in window.tolist()], "target": _label(run.vocab.itos[target]),
                "curveSample": {k: len(run.curve_data[k][1]) for k in ("train", "val")},
                "note": "Each row is the weights saved at that step during training, measured again now. Steps that were not "
                        "recorded are not shown and not filled in."}

    def replay_update(self, data: dict) -> dict:
        """One recorded update, step by step: the weights before it, the batch it used, the loss, the gradients,
        and the weights after. The update is recomputed from the recorded weights and batch and checked against
        the weights recorded after it."""
        _require_torch()
        run = self.get(data.get("run"))
        step = data.get("step")
        if not isinstance(step, int) or step not in run.updates:
            raise LabError(f"update {step} was not recorded; recorded updates: {', '.join(map(str, sorted(run.updates)))}", 404, "not_recorded")
        u = run.updates[step]
        before = run.checkpoint_model(f"step:{step - 1}")
        after = run.checkpoint_model(f"step:{step}")
        xs, ys = run.data["train"]
        idx = torch.tensor(u["batch"])
        bx, by = xs[idx], ys[idx]
        m = copy.deepcopy(before)
        m.train()
        m.zero_grad()
        loss = F.cross_entropy(m(bx), by)
        loss.backward()
        lr = run.cfg.lr
        with torch.no_grad():
            recomputed = {name: p - lr * p.grad for name, p in m.named_parameters()}
        largest = max((recomputed[n] - p).abs().max().item() for n, p in after.named_parameters())
        first = bx[0, 0].item()
        target = by[0].item()
        e_before, e_grad = before.emb.weight[first].detach(), m.emb.weight.grad[first]
        w_before, w_grad = before.out.weight[target].detach(), m.out.weight.grad[target]
        with torch.no_grad():
            p_before = F.softmax(before(bx[:1]), dim=1)[0, target].item()
            p_after = F.softmax(after(bx[:1]), dim=1)[0, target].item()
            batch_after = F.cross_entropy(after(bx), by).item()
        return {
            "run": run.id, "kind": "recorded", "step": step, "lr": lr, "batchSize": len(u["batch"]),
            "fingerprintBefore": mlp.fingerprint(before), "fingerprintAfter": mlp.fingerprint(after),
            "batch": [{"index": i, "window": [_label(run.vocab.itos[j]) for j in xs[i].tolist()], "target": _label(run.vocab.itos[ys[i].item()])}
                      for i in u["batch"][:RECORD_BATCH_SHOWN]],
            "batchLoss": _r(u["batchLoss"], 5), "batchLossRecomputed": _r(loss.item(), 5), "batchLossAfter": _r(batch_after, 5),
            "gradNorms": u["gradNorms"],
            "embedding": {"token": _label(run.vocab.itos[first]), "before": [_r(a) for a in e_before.tolist()],
                          "grad": [_r(a, 5) for a in e_grad.tolist()], "after": [_r(a) for a in after.emb.weight[first].tolist()]},
            "outputRow": {"token": _label(run.vocab.itos[target]), "before": [_r(a) for a in w_before.tolist()[:8]],
                          "grad": [_r(a, 5) for a in w_grad.tolist()[:8]], "after": [_r(a) for a in after.out.weight[target].tolist()[:8]],
                          "size": len(w_before)},
            "firstExample": {"pBefore": _r(p_before, 6), "pAfter": _r(p_after, 6)},
            "check": {"largestDifference": largest, "matches": largest < 1e-5,
                      "how": "the update was recomputed from the recorded weights and batch and compared with the weights recorded after it"},
        }
