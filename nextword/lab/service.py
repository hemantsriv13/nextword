"""What the Lab's backend computes. Everything here calls the real engine in nextword/bigram.py.

Kept separate from the HTTP layer (server.py) so it can be tested and reused without a server.
Timings are measured with time.perf_counter and reported in milliseconds.
"""

import hashlib
import math
import random
import re
import time
from collections import Counter
from pathlib import Path

from nextword import bigram

ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_PATH = ROOT / "data" / "sample.txt"
UPLOAD_DIR = ROOT / "data" / "lab"
ENGINE_SOURCE = Path(bigram.__file__)

MAX_CORPUS_CHARS = 2_000_000
MAX_PROMPT_CHARS = 2_000
MAX_LENGTH = 400
MAX_RETURNED_EXAMPLES = 2_000


class LabError(Exception):
    """A request the Lab cannot serve. `status` becomes the HTTP status code."""

    def __init__(self, message: str, status: int = 400, code: str = "bad_request"):
        super().__init__(message)
        self.status = status
        self.code = code


def _fingerprint(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def engine_version() -> str:
    """The engine's version is a hash of its source file, so any code change shows up."""
    return "char-bigram@" + _fingerprint(ENGINE_SOURCE.read_text(encoding="utf-8"))


def visible(token: str) -> str:
    """A printable label for a character token: spaces and newlines become visible symbols."""
    return {" ": "␣", "\n": "↵", "\t": "⇥", "\r": "␍"}.get(token, token)


# ----------------------------------------------------------------------------- corpora

class CorpusStore:
    """Training texts: the bundled sample plus any text uploaded through the Lab (kept in data/lab/)."""

    def __init__(self, upload_dir: Path = UPLOAD_DIR):
        self.upload_dir = upload_dir
        self._tables: dict[str, tuple[str, dict]] = {}  # corpus id -> (fingerprint, counts)

    def _paths(self) -> dict[str, tuple[Path, str]]:
        paths = {"sample": (SAMPLE_PATH, "sample")}
        if self.upload_dir.exists():
            for path in sorted(self.upload_dir.glob("*.txt")):
                paths["upload-" + path.stem] = (path, "upload")
        return paths

    def text(self, corpus_id: str) -> str:
        entry = self._paths().get(corpus_id)
        if entry is None:
            raise LabError(f"no corpus called {corpus_id!r}", 404, "unknown_corpus")
        return entry[0].read_text(encoding="utf-8")

    def describe(self, corpus_id: str) -> dict:
        path, origin = self._paths()[corpus_id]
        text = path.read_text(encoding="utf-8")
        return {
            "id": corpus_id,
            "name": "Sample passage" if origin == "sample" else path.stem.replace("-", " "),
            "origin": origin,
            "file": (str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)).replace("\\", "/"),
            "chars": len(text),
            "distinct": len(set(text)),
            "fingerprint": _fingerprint(text),
        }

    def list(self) -> list[dict]:
        return [self.describe(corpus_id) for corpus_id in self._paths()]

    def add(self, name: str, text: str) -> dict:
        if not isinstance(text, str) or not text.strip():
            raise LabError("the text is empty; paste or upload some plain text", 422, "empty_text")
        if len(text) > MAX_CORPUS_CHARS:
            raise LabError(f"the text has {len(text):,} characters; the limit is {MAX_CORPUS_CHARS:,}", 413, "too_large")
        if len(text) < 2:
            raise LabError("a bigram model needs at least two characters", 422, "too_short")
        slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:40] or "my-text"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        # newline="" keeps the text byte-for-byte, as .gitattributes does for data/.
        (self.upload_dir / f"{slug}.txt").write_text(text, encoding="utf-8", newline="")
        self._tables.pop("upload-" + slug, None)
        return self.describe("upload-" + slug)

    def delete(self, corpus_id: str) -> None:
        entry = self._paths().get(corpus_id)
        if entry is None:
            raise LabError(f"no corpus called {corpus_id!r}", 404, "unknown_corpus")
        if entry[1] != "upload":
            raise LabError("the bundled sample cannot be deleted", 403, "protected")
        entry[0].unlink()
        self._tables.pop(corpus_id, None)

    def counts(self, corpus_id: str) -> tuple[dict, bool, float]:
        """The count table for a corpus, cached by content. Returns (counts, cache_hit, ms spent)."""
        text = self.text(corpus_id)
        fingerprint = _fingerprint(text)
        cached = self._tables.get(corpus_id)
        if cached and cached[0] == fingerprint:
            return cached[1], True, 0.0
        start = time.perf_counter()
        counts = bigram.count_bigrams(bigram.tokenize(text))
        elapsed = (time.perf_counter() - start) * 1000
        self._tables[corpus_id] = (fingerprint, counts)
        return counts, False, elapsed


# ----------------------------------------------------------------------------- inspection

def corpus_stats(text: str) -> dict:
    tokens = bigram.tokenize(text)
    frequency = Counter(tokens)
    vocab = sorted(frequency, key=lambda t: (-frequency[t], t))
    return {
        "chars": len(tokens),
        "distinct": len(vocab),
        "lines": text.count("\n") + 1,
        "words": len(text.split()),
        "frequency": [{"token": t, "label": visible(t), "count": frequency[t]} for t in vocab],
    }


def count_table(counts: dict) -> dict:
    """The whole count table, with rows and columns in one shared order (most frequent first)."""
    totals = {context: sum(row.values()) for context, row in counts.items()}
    seen = Counter()
    for context, row in counts.items():
        seen[context] += totals[context]
        for token, n in row.items():
            seen[token] += n
    vocab = sorted(seen, key=lambda t: (-seen[t], t))
    return {
        "vocab": [{"token": t, "label": visible(t)} for t in vocab],
        "rows": {context: dict(row) for context, row in counts.items()},
        "totals": totals,
        "pairs": sum(totals.values()),
    }


def distribution(counts: dict, context: str) -> dict:
    if len(context) != 1:
        raise LabError("a bigram context is exactly one character", 422, "bad_context")
    try:
        probs = bigram.next_token_probabilities(counts, context)
    except bigram.UnseenContextError as err:
        raise LabError(str(err), 422, "unseen_context") from err
    row = counts[context]
    total = sum(row.values())
    ordered = sorted(probs, key=lambda t: (-probs[t], t))
    return {
        "context": context,
        "label": visible(context),
        "total": total,
        "candidates": [
            {"token": t, "label": visible(t), "count": row[t], "p": probs[t]} for t in ordered
        ],
    }


# ----------------------------------------------------------------------------- generation

def generate(store: CorpusStore, corpus_id: str, prompt: str, length: int, seed: int | None) -> dict:
    """One real generation request, with a trace of every step and a measured timing breakdown."""
    t0 = time.perf_counter()
    if not isinstance(prompt, str) or not prompt:
        raise LabError("type some text first; the bigram model needs at least one character", 422, "empty_prompt")
    if len(prompt) > MAX_PROMPT_CHARS:
        raise LabError(f"the prompt is limited to {MAX_PROMPT_CHARS:,} characters", 413, "prompt_too_long")
    if not isinstance(length, int) or not 1 <= length <= MAX_LENGTH:
        raise LabError(f"length must be a whole number from 1 to {MAX_LENGTH}", 422, "bad_length")
    if seed is None:
        seed = random.randrange(10_000)
    if not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise LabError("seed must be a whole number from 0 to 4,294,967,295", 422, "bad_seed")
    t_validated = time.perf_counter()

    counts, cache_hit, count_ms = store.counts(corpus_id)
    t_counted = time.perf_counter()

    context_char = prompt[-1]
    try:
        steps = list(bigram.generate_steps(counts, prompt, length, random.Random(seed)))
    except bigram.UnseenContextError as err:
        raise LabError(f"no suggestion: {err}", 422, "unseen_context") from err
    t_generated = time.perf_counter()

    suggestion = "".join(step.token for step in steps)
    stopped = None
    if len(steps) < length:
        stopped = f"stopped after {len(steps)} characters: {visible(suggestion[-1])!r} never had a successor in the training text"
    trace = []
    for step in steps:
        ordered = sorted(step.probabilities, key=lambda t: (-step.probabilities[t], t))
        trace.append({
            "context": step.context,
            "contextLabel": visible(step.context),
            "draw": step.draw,
            "token": step.token,
            "tokenLabel": visible(step.token),
            "candidates": [{"token": t, "label": visible(t), "p": step.probabilities[t]} for t in ordered],
            # The draw is compared against the probabilities in the engine's own order (insertion order).
            "intervalOrder": list(step.probabilities),
        })
    t_done = time.perf_counter()

    return {
        "engine": "char-bigram",
        "modelVersion": engine_version(),
        "corpus": store.describe(corpus_id),
        "prompt": prompt,
        "contextUsed": context_char,
        "contextUsedLabel": visible(context_char),
        "seed": seed,
        "length": length,
        "suggestion": suggestion,
        "stopped": stopped,
        "steps": trace,
        "timingsMs": {
            "validate": (t_validated - t0) * 1000,
            "count": (t_counted - t_validated) * 1000,
            "countCacheHit": cache_hit,
            "countOnlyMs": count_ms,
            "generate": (t_generated - t_counted) * 1000,
            "format": (t_done - t_generated) * 1000,
            "total": (t_done - t0) * 1000,
        },
    }


def benchmark(store: CorpusStore, corpus_id: str, prompt: str, length: int, runs: int) -> dict:
    """Repeat real generations and report the measured latency spread and throughput."""
    if not isinstance(runs, int) or not 1 <= runs <= 500:
        raise LabError("runs must be from 1 to 500", 422, "bad_runs")
    store.counts(corpus_id)  # warm the cache so every run measures generation, not counting
    latencies, produced = [], 0
    wall_start = time.perf_counter()
    for seed in range(runs):
        result = generate(store, corpus_id, prompt, length, seed)
        latencies.append(result["timingsMs"]["total"])
        produced += len(result["suggestion"])
    wall = time.perf_counter() - wall_start
    ordered = sorted(latencies)

    def percentile(q: float) -> float:
        return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]

    return {
        "runs": runs,
        "length": length,
        "latencyMs": {"p50": percentile(0.5), "p95": percentile(0.95), "max": ordered[-1], "min": ordered[0]},
        "requestsPerSecond": runs / wall if wall > 0 else None,
        "charsPerSecond": produced / wall if wall > 0 else None,
        "wallSeconds": wall,
        "samples": latencies,
        "modelVersion": engine_version(),
    }


# ----------------------------------------------------------------------------- evaluation

def split_text(text: str, train: float, val: float) -> dict:
    """Split the *source text* into three contiguous parts before any pairs are made.

    Pairs are then built inside each part only, so no (context, next) pair straddles two splits.
    """
    if not (0 < train < 1 and 0 <= val < 1 and train + val < 1):
        raise LabError("split fractions must leave room for train, validation and test", 422, "bad_split")
    a = int(len(text) * train)
    b = int(len(text) * (train + val))
    return {"train": text[:a], "val": text[a:b], "test": text[b:], "bounds": [a, b]}


def evaluate(text: str, train: float, val: float, on: str, k: float) -> dict:
    """Held-out next-character loss for the bigram engine, trained on the train part only.

    k is add-k smoothing strength. k = 0 is the engine exactly as implemented (unseen events get
    probability 0, so their loss is infinite). k > 0 is a Lab-side variant: P = (c + k) / (n + kV),
    with V = training vocabulary + 1 slot for characters never seen in training.
    """
    if on not in ("val", "test"):
        raise LabError("evaluate on 'val' or 'test'", 422, "bad_split_name")
    if not isinstance(k, (int, float)) or k < 0 or k > 100:
        raise LabError("smoothing k must be between 0 and 100", 422, "bad_k")
    parts = split_text(text, train, val)
    held = parts[on]
    if len(parts["train"]) < 2:
        raise LabError("the training part is too short to count any pairs", 422, "train_too_short")
    if len(held) < 2:
        raise LabError(f"the {on} part has fewer than two characters; give it a larger share", 422, "held_too_short")

    counts = bigram.count_bigrams(bigram.tokenize(parts["train"]))
    train_vocab = set(parts["train"])
    v = len(train_vocab) + 1

    examples, finite, unseen_context, unseen_pair = [], [], 0, 0
    for context, target in zip(held, held[1:]):
        row = counts.get(context)
        total = sum(row.values()) if row else 0
        c = row.get(target, 0) if row else 0
        if k == 0:
            p = c / total if total else 0.0
        else:
            p = (c + k) / (total + k * v)
        reason = None
        if total == 0:
            unseen_context += 1
            reason = "context never seen in training"
        elif c == 0:
            unseen_pair += 1
            reason = "this pair never seen in training"
        nll = -math.log(p) if p > 0 else None
        if nll is not None:
            finite.append(nll)
        examples.append({
            "context": visible(context), "target": visible(target), "p": p, "nll": nll, "reason": reason,
        })

    n = len(examples)
    all_finite = len(finite) == n
    mean = sum(finite) / n if all_finite else None
    return {
        "split": {"train": len(parts["train"]), "val": len(parts["val"]), "test": len(parts["test"]), "bounds": parts["bounds"]},
        "on": on,
        "k": k,
        "targets": n,
        "unseenContext": unseen_context,
        "unseenPair": unseen_pair,
        "meanNll": mean,
        "meanNllCovered": sum(finite) / len(finite) if finite and k == 0 else mean,
        "covered": len(finite),
        "perplexity": math.exp(mean) if mean is not None else None,
        "uniformBaselineNll": math.log(v),
        "vocabularyWithUnknown": v,
        "examples": examples[:MAX_RETURNED_EXAMPLES],
        "truncated": n > MAX_RETURNED_EXAMPLES,
        "modelVersion": engine_version(),
        "corpusFingerprint": _fingerprint(text),
    }


# ----------------------------------------------------------------------------- adaptation

def adapt(base: str, extra: str, context: str, train: float = 0.8) -> dict:
    """Count-based "continued training": add the counts of a second text to the base model.

    Reports one context's distribution before and after, and held-out loss on the *base* text's
    validation part (add-1 smoothed so it stays finite), to show adaptation and forgetting.
    """
    if len(context) != 1:
        raise LabError("pick exactly one context character", 422, "bad_context")
    if not base or not extra:
        raise LabError("both texts need some characters", 422, "empty_text")
    cut = int(len(base) * train)
    base_counts = bigram.count_bigrams(bigram.tokenize(base[:cut]))
    extra_cut = int(len(extra) * train)
    # Only the first part of each text is counted; the rest is held out, so neither loss leaks.
    extra_counts = bigram.count_bigrams(bigram.tokenize(extra[:extra_cut]))
    merged = {c: Counter(row) for c, row in base_counts.items()}
    for c, row in extra_counts.items():
        merged.setdefault(c, Counter()).update(row)

    def row_of(counts):
        try:
            return distribution(counts, context)
        except LabError:
            return None

    held = base[cut:]
    extra_held = extra[extra_cut:]

    def loss_on(counts, text):
        if len(text) < 2:
            return None
        # Training vocabulary + 1 shared slot for characters never seen in training.
        v = len(set(base[:cut]) | set(extra[:extra_cut])) + 1
        total_nll = 0.0
        for a, b in zip(text, text[1:]):
            row = counts.get(a, {})
            total_nll -= math.log((row.get(b, 0) + 1) / (sum(row.values()) + v))
        return total_nll / (len(text) - 1)

    return {
        "context": visible(context),
        "before": row_of(base_counts),
        "after": row_of(merged),
        "baseHeldOutNll": {"before": loss_on(base_counts, held), "after": loss_on(merged, held)},
        "extraHeldOutNll": {"before": loss_on(base_counts, extra_held), "after": loss_on(merged, extra_held)},
        "basePairs": sum(sum(r.values()) for r in base_counts.values()),
        "extraPairs": sum(sum(r.values()) for r in extra_counts.values()),
        "note": "Losses use add-1 smoothing so unseen pairs stay finite; the engine itself does not smooth.",
    }


# ----------------------------------------------------------------------------- source view

SOURCE_ALLOWED = {"nextword/bigram.py", "nextword/__main__.py", "nextword/lab/service.py", "nextword/lab/server.py"}


def source(path: str) -> dict:
    if path not in SOURCE_ALLOWED:
        raise LabError("that file is not available in the code viewer", 404, "unknown_source")
    return {"path": path, "text": (ROOT / path).read_text(encoding="utf-8")}
