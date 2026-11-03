"""Beginner lessons: the real results behind each lesson's prediction, computed by the engines.

The lesson text (questions, explanations, terms) is authored in web/src/content/lessons.json, which the page
shows offline and the tutor reads. This module computes what each lesson's example actually does:

    counting lessons   the bigram engine (nextword/bigram.py) on a short text
    learning lessons   a small character MLP (nextword/mlp.py) trained on a tiny teaching text

Each result also carries the prediction the learner is asked to make, with its options and the right answer,
worked out from the computed numbers, so the page never decides an answer by itself and the language model
never decides one at all. MLP lesson runs are trained once with fixed settings and seed, and kept on disk
(data/lab/mlp-lessons, ignored by Git).
"""

import json
import math
import random
import threading
from pathlib import Path

from nextword import bigram
from nextword.lab import service
from nextword.lab.service import LabError, visible

CONTENT_PATH = service.ROOT / "web" / "src" / "content" / "lessons.json"
LESSON_RUN_DIR = service.UPLOAD_DIR / "mlp-lessons"

# Small enough to show every number: 2 numbers per character, 8 hidden values.
LESSON_MLP = {"tiny": {"context": 2, "embed": 2, "hidden": 8, "steps": 1000, "batch": 16, "lr": 0.3, "seed": 1},
              "medium": {"context": 3, "embed": 8, "hidden": 64, "steps": 2000, "batch": 32, "lr": 0.1, "seed": 1},
              "large": {"context": 3, "embed": 8, "hidden": 64, "steps": 2000, "batch": 32, "lr": 0.1, "seed": 1}}

# Each lesson's examples. The first is the lesson's own; "Show another example" moves to the next one.
EXAMPLES = {
    "characters": [{"text": "the cat"}, {"text": "hello"}, {"text": "a b c"}],
    "pairs": [{"text": "banana"}, {"text": "hello"}, {"text": "abab"}],
    "counts": [{"text": "banana", "context": "a"}, {"text": "the cat ate the hat", "context": "t"}, {"text": "mississippi", "context": "i"}],
    "probability": [{"text": "ab ac ab", "context": "a", "target": "b"}, {"text": "banana", "context": "n", "target": "a"},
                    {"text": "the cat ate the hat", "context": "t", "target": "h"}],
    "sampling": [{"text": "ab ac ab", "context": "a", "seed": 4}, {"text": "the cat sat on the mat", "context": "t", "seed": 2},
                 {"text": "mississippi", "context": "s", "seed": 7}],
    "generation": [{"text": "banana", "prompt": "b", "length": 5, "seed": 3}, {"text": "the cat sat on the mat", "prompt": "t", "length": 6, "seed": 1},
                   {"text": "mississippi", "prompt": "m", "length": 6, "seed": 5}],
    "learning": [{"dataset": "tiny-abc", "index": 4}, {"dataset": "tiny-cat", "index": 5}, {"dataset": "tiny-banana", "index": 3}],
    "embeddings": [{"dataset": "tiny-cat", "index": 5}, {"dataset": "tiny-abc", "index": 4}, {"dataset": "tiny-banana", "index": 3}],
    "hidden": [{"dataset": "tiny-cat", "index": 5}, {"dataset": "tiny-abc", "index": 4}, {"dataset": "tiny-banana", "index": 3}],
    "softmax": [{"dataset": "tiny-cat", "index": 5}, {"dataset": "tiny-abc", "index": 4}, {"dataset": "tiny-banana", "index": 3}],
    "loss": [{"dataset": "tiny-cat", "index": 5}, {"dataset": "tiny-abc", "index": 4}, {"dataset": "tiny-banana", "index": 3}],
    "update": [{"dataset": "tiny-cat"}, {"dataset": "tiny-abc"}, {"dataset": "tiny-banana"}],
    "training": [{"dataset": "tiny-cat"}, {"dataset": "medium-alice"}, {"dataset": "large-austen-doyle"}],
}

_content_cache: tuple[float, dict] | None = None


def content() -> dict:
    """The authored lesson text (reloaded when the file changes)."""
    global _content_cache
    mtime = CONTENT_PATH.stat().st_mtime
    if _content_cache is None or _content_cache[0] != mtime:
        _content_cache = (mtime, json.loads(CONTENT_PATH.read_text(encoding="utf-8")))
    return _content_cache[1]


def lesson_ids() -> list[str]:
    return [lesson["id"] for lesson in content()["lessons"]]


def _v(c: str) -> str:
    return visible(c) if c not in ("⟨start⟩", "⟨?⟩") else c


def _q(c: str) -> str:
    return f"‘{_v(c)}’"


def _frac(n: int, d: int) -> str:
    return f"{n}/{d}"


def _options(correct, others, seed: str) -> list:
    """The correct answer and up to two distinct wrong ones, in an order fixed by the lesson."""
    opts = [correct]
    for o in others:
        if o not in opts:
            opts.append(o)
    opts = opts[:3]
    random.Random(seed).shuffle(opts)
    return opts


# ----------------------------------------------------------------------------- counting lessons (bigram)

def _characters(ex: dict) -> dict:
    tokens = bigram.tokenize(ex["text"])
    n, words = len(tokens), len(ex["text"].split())
    return {"text": ex["text"], "tokens": [_v(t) for t in tokens], "count": n, "distinct": sorted({_v(t) for t in tokens}),
            "prediction": {"prompt": f"How many characters does “{ex['text']}” have?", "kind": "choice",
                           "options": [str(o) for o in _options(n, [n - ex["text"].count(" ") if " " in ex["text"] else n - 1, words if words != n else n + 1, n + 1], ex["text"])],
                           "answer": str(n)},
            "facts": [f"“{ex['text']}” has {n} characters: " + " ".join(_q(t) for t in tokens) + ".",
                      "A space counts as a character (shown as ␣)." if " " in ex["text"] else "There are no spaces in this text.",
                      f"{len(set(tokens))} of them are different."]}


def _pairs(ex: dict) -> dict:
    tokens = bigram.tokenize(ex["text"])
    pairs = list(zip(tokens, tokens[1:]))
    n = len(pairs)
    return {"text": ex["text"], "tokens": [_v(t) for t in tokens], "pairs": [[_v(a), _v(b)] for a, b in pairs], "count": n,
            "prediction": {"prompt": f"“{ex['text']}” has {len(tokens)} characters. How many neighbouring pairs (one character, then the next) does it have?",
                           "kind": "choice", "options": [str(o) for o in _options(n, [len(tokens), n - 1, len(set(pairs))], ex["text"])], "answer": str(n)},
            "facts": [f"“{ex['text']}” has {len(tokens)} characters and {n} neighbouring pairs: " + ", ".join(f"{_q(a)} → {_q(b)}" for a, b in pairs) + ".",
                      "Each pair starts where the previous one ended, so there is one pair fewer than characters."]}


def _row(text: str, context: str) -> list[dict]:
    row = bigram.count_bigrams(bigram.tokenize(text)).get(context, {})
    return [{"token": _v(t), "raw": t, "count": c} for t, c in sorted(row.items(), key=lambda kv: (-kv[1], kv[0]))]


def _counts(ex: dict) -> dict:
    text, a = ex["text"], ex["context"]
    row = _row(text, a)
    top = row[0]
    if len(row) > 1 and row[1]["count"] == top["count"]:
        raise LabError("this lesson example has a tie; it needs one most common follower", 500, "bad_lesson")
    others = [r["raw"] for r in row[1:]] + [c for c in dict.fromkeys(text) if c != top["raw"]]
    total = sum(r["count"] for r in row)
    return {"text": text, "context": _v(a), "row": [{k: r[k] for k in ("token", "count")} for r in row], "total": total,
            "places": [i for i in range(len(text) - 1) if text[i] == a],
            "prediction": {"prompt": f"In “{text}”, which character comes most often right after {_q(a)}?", "kind": "choice",
                           "options": [_v(o) for o in _options(top["raw"], others, text + a)], "answer": top["token"]},
            "facts": [f"In “{text}”, {_q(a)} is followed by another character {total} times."] +
                     [f"{_q(a)} → {_q(r['raw'])}: {r['count']} time{'s' if r['count'] != 1 else ''}" for r in row] +
                     [f"The most common follower of {_q(a)} is {_q(top['raw'])}."]}


def _probability(ex: dict) -> dict:
    text, a, b = ex["text"], ex["context"], ex["target"]
    row = _row(text, a)
    total = sum(r["count"] for r in row)
    c = next(r["count"] for r in row if r["raw"] == b)
    probs = bigram.next_token_probabilities(bigram.count_bigrams(bigram.tokenize(text)), a)
    wrong = [_frac(c, len(text)), _frac(1, len(row)) if len(row) > 1 else _frac(c, total + 1), _frac(total - c, total) if total != 2 * c else _frac(c, total + 1)]
    return {"text": text, "context": _v(a), "target": _v(b), "row": [{"token": r["token"], "count": r["count"], "p": round(probs[r["raw"]], 4)} for r in row],
            "count": c, "total": total, "p": round(probs[b], 4), "fraction": _frac(c, total),
            "prediction": {"prompt": f"After {_q(a)}, how likely is {_q(b)} to come next?", "kind": "choice",
                           "options": _options(_frac(c, total), wrong, text + a + b), "answer": _frac(c, total)},
            "facts": [f"In “{text}”, {_q(a)} is followed by something {total} times, and by {_q(b)} {c} of those times.",
                      f"So P({_v(b)} | {_v(a)}) = {c}/{total} = {probs[b]:.4f}.",
                      "The probabilities of all followers of " + _q(a) + " add up to 1: " + ", ".join(f"{_q(r['raw'])} {probs[r['raw']]:.4f}" for r in row) + "."]}


def _sampling(ex: dict) -> dict:
    text, a = ex["text"], ex["context"]
    counts = bigram.count_bigrams(bigram.tokenize(text))
    probs = bigram.next_token_probabilities(counts, a)
    token, draw = bigram.sample_next(probs, random.Random(ex["seed"]))
    lo, intervals = 0.0, []
    for t, p in probs.items():
        intervals.append({"token": _v(t), "from": round(lo, 4), "to": round(lo + p, 4), "p": round(p, 4)})
        lo += p
    return {"text": text, "context": _v(a), "intervals": intervals, "draw": round(draw, 4), "seed": ex["seed"], "token": _v(token),
            "prediction": {"prompt": f"The random number drawn is {draw:.4f}. Which character does the model write?", "kind": "choice",
                           "options": [_v(t) for t in _options(token, list(probs), text + str(ex["seed"]))], "answer": _v(token)},
            "facts": [f"After {_q(a)} the probabilities are laid end to end from 0 to 1: " +
                      ", ".join(f"{_q(i['token'])} from {i['from']:.4f} to {i['to']:.4f}" for i in intervals) + ".",
                      f"With seed {ex['seed']} the random number is {draw:.4f}. It falls in {_q(token)}'s stretch, so the model writes {_q(token)}."]}


def _generation(ex: dict) -> dict:
    text = ex["text"]
    counts = bigram.count_bigrams(bigram.tokenize(text))
    steps = list(bigram.generate_steps(counts, ex["prompt"], ex["length"], random.Random(ex["seed"])))
    out = "".join(s.token for s in steps)
    first = steps[0].token
    second_row = steps[1].context if len(steps) > 1 else first
    return {"text": text, "prompt": ex["prompt"], "seed": ex["seed"], "generated": out,
            "steps": [{"row": _v(s.context), "draw": round(s.draw, 4), "token": _v(s.token),
                       "options": [{"token": _v(t), "p": round(p, 4)} for t, p in s.probabilities.items()]} for s in steps],
            "prediction": {"prompt": f"Starting from {_q(ex['prompt'])}, the model writes {_q(first)} first. Which row of counts does it read to choose the next character?",
                           "kind": "choice", "options": _options(f"the row for {_q(second_row)}",
                                                                 [f"the row for {_q(ex['prompt'])}", "every row at once", f"the row for {_q(text[-1])}"],
                                                                 text + ex["prompt"]),
                           "answer": f"the row for {_q(second_row)}"},
            "facts": [f"Starting from {_q(ex['prompt'])} with seed {ex['seed']}, the model wrote “{out}”."] +
                     [f"Step {i + 1}: read the row for {_q(s.context)}, drew {s.draw:.4f}, wrote {_q(s.token)}." for i, s in enumerate(steps)] +
                     ["Each written character becomes the one the model looks at next."]}


# ----------------------------------------------------------------------------- learning lessons (MLP)

class LessonRuns:
    """One small MLP run per teaching dataset, trained once with fixed settings, kept on disk."""

    def __init__(self, store: service.CorpusStore, root: Path = LESSON_RUN_DIR):
        from nextword.lab import mlp_service
        self.svc = mlp_service.MLPService(store, root)
        self.ids: dict[str, str] = {}
        self._lock = threading.Lock()

    def run(self, dataset: str):
        corpus = "ds-" + dataset
        if self.svc.store.parts(corpus) is None:
            raise LabError(f"the dataset {dataset!r} isn't prepared on this computer; run python -m nextword.datasets download, "
                           "then python -m nextword.datasets prepare", 404, "dataset_missing")
        level = dataset.split("-")[0]
        cfg = LESSON_MLP[level]
        with self._lock:
            if dataset in self.ids:
                return self.svc.get(self.ids[dataset])
            for saved in self.svc.saved():
                if saved["corpus"]["id"] == corpus and saved["config"] == cfg and saved["state"] == "done":
                    try:
                        run = self.svc.get(saved["id"])
                    except LabError:
                        continue  # the text or the saved weights changed: train again below
                    self.ids[dataset] = run.id
                    return run
            summary = self.svc.start({"corpus": corpus, **cfg})
            run = self.svc.get(summary["id"])
        while run.state == "training":
            threading.Event().wait(0.02)
        if run.state != "done":
            raise LabError(f"the lesson model could not be trained: {run.error}", 500, "lesson_training_failed")
        self.ids[dataset] = run.id
        return run


def _ins(runs: LessonRuns, ex: dict, checkpoint: str) -> tuple[object, dict]:
    run = runs.run(ex["dataset"])
    index = min(ex.get("index", 0), len(run.data["train"][0]) - 1)
    return run, runs.svc.inspect({"run": run.id, "checkpoint": checkpoint, "split": "train", "index": index})


def _window(ins: dict) -> str:
    return " ".join(_q(c) for c in ins["window"])


def _base(run, ins: dict) -> dict:
    return {"dataset": run.corpus["name"], "datasetId": run.corpus["id"], "level": run.corpus.get("level"), "run": run.id,
            "trainingText": run.parts["train"][:200], "window": ins["window"], "target": ins["target"],
            "vocab": run.summary()["vocab"], "settings": run.summary()["config"], "fingerprint": ins["fingerprint"]}


def _learning(runs, ex) -> dict:
    run, before = _ins(runs, ex, "initial")
    _, after = _ins(runs, ex, "trained")
    v = before["model"]["vocab"]
    p0, p1 = before["probs"]["target"], after["probs"]["target"]
    options = {"uniform": f"About 1 in {v} (roughly {1 / v:.2f}), like a blind guess", "sure": "Almost certain (close to 1)", "zero": "Exactly 0"}
    answer = min(options, key=lambda k: abs({"uniform": 1 / v, "sure": 0.97, "zero": 0.0}[k] - p0))
    return {**_base(run, before), "vocabSize": v, "pBefore": p0, "pAfter": p1, "steps": run.step,
            "prediction": {"prompt": f"Before any training, the network's weights are random. How likely does it think {_q(before['target'])} is after {_window(before)}?",
                           "kind": "choice", "options": _options(options[answer], [o for k, o in options.items() if k != answer], run.id), "answer": options[answer]},
            "facts": [f"The network reads a window of {before['model']['context']} characters: {_window(before)}. The right next character is {_q(before['target'])}.",
                      f"It chooses among {v} possible characters (including ⟨start⟩, which fills the window at the start of a text, and ⟨?⟩ for unknown characters).",
                      f"With random weights it gives {_q(before['target'])} a probability of {p0:.4f}; a blind guess would be 1/{v} = {1 / v:.4f}.",
                      f"After {run.step} training updates it gives {_q(before['target'])} {p1:.4f}."]}


def _embeddings(runs, ex) -> dict:
    run, before = _ins(runs, ex, "initial")
    _, after = _ins(runs, ex, "trained")
    m = before["model"]
    options = ["Random numbers, changed by training", "Their places in the alphabet (a = 1, b = 2, …)", "Numbers for how the letters sound"]
    return {**_base(run, before), "context": m["context"], "embed": m["embed"],
            "before": [{"char": c, "values": v} for c, v in zip(before["window"], before["embeddings"])],
            "after": [{"char": c, "values": v} for c, v in zip(after["window"], after["embeddings"])],
            "joined": m["context"] * m["embed"],
            "prediction": {"prompt": "Before training, what numbers does the network use for each character?", "kind": "choice",
                           "options": _options(options[0], options[1:], run.id), "answer": options[0]},
            "facts": [f"Each character has a list of {m['embed']} numbers, called its embedding."] +
                     [f"Before training, {_q(c)} is ({', '.join(f'{x:.4f}' for x in v)}); after training it is ({', '.join(f'{x:.4f}' for x in w)})."
                      for c, v, w in zip(before["window"], before["embeddings"], after["embeddings"])] +
                     [f"The window's {m['context']} characters × {m['embed']} numbers = {m['context'] * m['embed']} numbers go into the next layer."]}


def _hidden(runs, ex) -> dict:
    run, ins = _ins(runs, ex, "trained")
    m = runs.svc.get(run.id).checkpoint_model("trained")
    x = ins["joined"]["values"]
    w = [round(a, 4) for a in m.hidden.weight[0].tolist()]
    b = round(m.hidden.bias[0].item(), 4)
    total = sum(wi * xi for wi, xi in zip(w, x)) + b
    pre, h = ins["hiddenBefore"]["values"][0], ins["hidden"]["values"][0]
    options = ["A number between −1 and 1, with the same sign", "The same number, unchanged", "Always exactly 0"]
    return {**_base(run, ins), "x": x, "weights": w, "bias": b, "sum": round(total, 4), "pre": pre, "h": h,
            "allBefore": ins["hiddenBefore"]["values"], "allAfter": ins["hidden"]["values"], "hiddenSize": ins["model"]["hidden"],
            "prediction": {"prompt": f"For one hidden value, the weighted sum comes to {pre:.4f}. The network then applies tanh. What comes out?",
                           "kind": "choice", "options": _options(options[0], options[1:], run.id + "h"), "answer": options[0]},
            "facts": [f"Hidden value 1 multiplies the {len(x)} input numbers by {len(w)} learned weights, adds them up and adds a bias of {b:.4f}.",
                      f"That sum is {pre:.4f}. tanh({pre:.4f}) = {h:.4f}.",
                      "tanh keeps the sign and squeezes any number into the range −1 to 1.",
                      f"The hidden layer has {ins['model']['hidden']} such values."]}


def _softmax(runs, ex) -> dict:
    run, ins = _ins(runs, ex, "trained")
    logits = {x["token"]: x["logit"] for x in ins["logits"]["top"]}
    probs = {x["token"]: x["p"] for x in ins["probs"]["top"]}
    top3 = ins["probs"]["top"][:3]
    return {**_base(run, ins), "scores": [{"token": t, "score": logits[t], "p": probs[t]} for t in list(probs)[:5]],
            "pTarget": ins["probs"]["target"], "sum": ins["probs"]["sum"],
            "prediction": {"prompt": f"After {_window(ins)}, these are the network's three highest scores. Which character gets the highest probability?",
                           "kind": "choice", "options": _options(top3[0]["token"], [t["token"] for t in top3[1:]], run.id + "s"),
                           "answer": top3[0]["token"], "show": [{"token": t["token"], "score": logits[t["token"]]} for t in top3]},
            "facts": [f"After {_window(ins)} the network's highest scores are " + ", ".join(f"{_q(t)} {logits[t]:.4f}" for t in list(probs)[:3]) + ".",
                      "Softmax turns the scores into probabilities: " + ", ".join(f"{_q(t)} {probs[t]:.4f}" for t in list(probs)[:3]) + ".",
                      f"All {ins['model']['vocab']} probabilities add up to {ins['probs']['sum']:.4f}. A higher score always gives a higher probability.",
                      f"The right next character is {_q(ins['target'])}, with probability {ins['probs']['target']:.4f}."]}


def _loss(runs, ex) -> dict:
    run, before = _ins(runs, ex, "initial")
    _, after = _ins(runs, ex, "trained")
    p0, p1 = before["probs"]["target"], after["probs"]["target"]
    l0, l1 = before["loss"], after["loss"]
    a = f"The random network (p = {p0:.4f})"
    b = f"The trained network (p = {p1:.4f})"
    answer = a if l0 > l1 else b
    return {**_base(run, after), "pBefore": p0, "pAfter": p1, "lossBefore": l0, "lossAfter": l1, "steps": run.step,
            "prediction": {"prompt": f"Both networks must predict {_q(after['target'])} after {_window(after)}. Which one should get the bigger loss (the bigger penalty)?",
                           "kind": "choice", "options": _options(answer, [b if answer == a else a, "Both get the same loss"], run.id + "l"), "answer": answer},
            "facts": [f"The loss is −ln(p), where p is the probability given to the right character {_q(after['target'])}.",
                      f"Random network: p = {p0:.4f}, loss = −ln({p0:.4f}) = {l0:.4f}.",
                      f"Trained network: p = {p1:.4f}, loss = −ln({p1:.4f}) = {l1:.4f}.",
                      "A probability close to 1 gives a loss close to 0; a small probability gives a large loss."]}


def _update(runs, ex) -> dict:
    run = runs.run(ex["dataset"])
    rep = runs.svc.replay_update({"run": run.id, "step": 1})
    e = rep["embedding"]
    i = max(range(len(e["grad"])), key=lambda k: abs(e["grad"][k]))
    before, grad, after = e["before"][i], e["grad"][i], e["after"][i]
    direction = "down" if grad > 0 else "up"
    options = {"down": "It goes down a little", "up": "It goes up a little"}
    return {"dataset": run.corpus["name"], "datasetId": run.corpus["id"], "level": run.corpus.get("level"), "run": run.id,
            "replay": rep, "weight": {"name": f"number {i + 1} of {_q(e['token'])}'s embedding", "before": before, "grad": grad, "after": after},
            "lr": rep["lr"],
            "prediction": {"prompt": f"A weight is {before:.4f} and its gradient is {grad:.5f}. The update rule is: new weight = weight − learning rate × gradient. Does the weight go up or down?",
                           "kind": "choice", "options": _options(options[direction], [options["up" if direction == "down" else "down"], "It stays the same"], run.id + "u"),
                           "answer": options[direction]},
            "facts": [f"This is the recorded first update of the lesson network on “{run.corpus['name']}”, using a batch of {rep['batchSize']} training examples.",
                      f"Number {i + 1} of {_q(e['token'])}'s embedding: {before:.4f} − {rep['lr']} × ({grad:.5f}) = {after:.4f}.",
                      f"Every weight moved this way at once. The batch's loss went from {rep['batchLoss']:.4f} to {rep['batchLossAfter']:.4f}.",
                      f"The recomputed update matches the recorded weights: {'yes' if rep['check']['matches'] else 'no'}."]}


def _training(runs, ex) -> dict:
    run = runs.run(ex["dataset"])
    hist = runs.svc.history({"run": run.id, "split": "val", "index": 0})
    first, last = hist["steps"][0], hist["steps"][-1]
    answer = "Lower" if last["train"] < first["train"] else "Higher"
    best = min(hist["steps"], key=lambda r: r["val"])
    return {"dataset": run.corpus["name"], "datasetId": run.corpus["id"], "level": run.corpus.get("level"), "run": run.id,
            "history": hist, "chars": run.summary()["split"], "settings": run.summary()["config"], "trainSeconds": run.train_seconds,
            "prediction": {"prompt": f"The network makes {run.step:,} updates on “{run.corpus['name']}”. At the end, will its training loss be lower or higher than at the start?",
                           "kind": "choice", "options": _options(answer, ["Higher" if answer == "Lower" else "Lower", "About the same"], run.id + "t"), "answer": answer},
            "facts": [f"Recorded training on “{run.corpus['name']}”: {run.step:,} updates in {run.train_seconds:.2f} seconds.",
                      f"Training loss went from {first['train']:.4f} at step 0 to {last['train']:.4f} at step {last['step']:,}.",
                      f"Validation loss (text the network never trains on) went from {first['val']:.4f} to {last['val']:.4f}; "
                      f"it was lowest, {best['val']:.4f}, at recorded step {best['step']:,}.",
                      "These numbers come from weights saved during training at the recorded steps; nothing between them is filled in."]}


COMPUTE = {"characters": _characters, "pairs": _pairs, "counts": _counts, "probability": _probability, "sampling": _sampling,
           "generation": _generation}
LEARN = {"learning": _learning, "embeddings": _embeddings, "hidden": _hidden, "softmax": _softmax, "loss": _loss,
         "update": _update, "training": _training}


class Lessons:
    def __init__(self, store: service.CorpusStore, root: Path = LESSON_RUN_DIR):
        self.store = store
        self.root = root
        self._runs: LessonRuns | None = None

    def runs(self) -> LessonRuns:
        if self._runs is None:
            from nextword.lab import mlp_service
            mlp_service._require_torch()
            self._runs = LessonRuns(self.store, self.root)
        return self._runs

    def result(self, data: dict) -> dict:
        lesson, example = data.get("lesson"), data.get("example", 0)
        if lesson not in EXAMPLES:
            raise LabError("no such lesson", 404, "unknown_lesson")
        examples = EXAMPLES[lesson]
        if not isinstance(example, int) or isinstance(example, bool) or not 0 <= example < len(examples):
            raise LabError(f"example must be from 0 to {len(examples) - 1}", 422, "bad_example")
        ex = examples[example]
        if lesson in COMPUTE:
            out = COMPUTE[lesson](ex)
            engine = "bigram"
        else:
            out = LEARN[lesson](self.runs(), ex)
            engine = "mlp"
        return {"lesson": lesson, "example": example, "examples": len(examples), "engine": engine, **out}
