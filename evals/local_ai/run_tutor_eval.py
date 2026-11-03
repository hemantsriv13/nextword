"""Run the beginner tutor evaluation against the real local model.

    .venv\\Scripts\\python evals\\local_ai\\run_tutor_eval.py --repeats 3

Each case sends the same requests the Beginner lessons page sends (a lesson, a step and an example)
through nextword/lab/assist.py, in a temporary lesson store, and records every answer with its facts,
timing and automatic checks. The lesson networks are retrained in the temporary store with the lessons'
fixed settings and seeds, so their numbers match the page's.

The automatic checks are narrow: required phrases appear, forbidden patterns don't, answers stay short,
every number is one from the facts, no later lesson's term appears, and the tutor never certifies
understanding. Passing them does not make an answer correct or clear. The AI review and the human
clarity review are recorded separately, by hand, in the report.
"""

import argparse
import hashlib
import json
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
sys.path.insert(0, str(HERE))

from run_eval import norm, served_model, unverified_numbers  # noqa: E402

from nextword.lab import assist, assist_lesson, lessons, service  # noqa: E402
from nextword.lab.service import LabError  # noqa: E402

RESULTS = HERE / "results"
DEFAULT_MAX_WORDS = 100  # the prompt asks for at most 80; a little slack before a fail

# Words that would introduce a later lesson's idea early. Only flagged when neither the learner's question
# nor the facts already use them.
TERM_WORDS = {
    "character (token)": ["token"], "pair (bigram)": ["bigram"], "count table (row)": ["count table"],
    "probability, written P(next | current)": ["conditional probability"], "sampling (with a seed)": ["sampling", "seed"],
    "generation (one step at a time)": ["autoregressive"], "neural network, weights and training example": ["neural network", "weights"],
    "embedding": ["embedding"], "hidden layer and activation (tanh)": ["hidden layer", "activation", "tanh"],
    "score (logit) and softmax": ["logit", "softmax"], "loss (cross-entropy)": ["cross-entropy", "cross entropy", "loss"],
    "gradient, learning rate and weight update": ["gradient", "learning rate"], "training and validation": ["validation", "overfitting"],
}
CERTIFY = r"\byou(?:'ve| have)? (?:now )?(?:understood|understand|mastered|passed)\b|\bwell done\b|\bgreat job\b|\byou got it\b"


def words(text: str) -> int:
    return len(re.findall(r"\S+", text))


def sentence_count(text: str) -> int:
    return len([s for s in re.split(r"(?<!\d)[.!?](?:\s|$)", text.strip()) if s.strip()])


def later_terms(answer: str, facts: dict, question: str | None) -> list[str]:
    seen = norm(json.dumps({k: v for k, v in facts.items() if k not in ("termsLater",)}, ensure_ascii=False) + " " + (question or ""))
    a = norm(answer)
    out = []
    for name in facts.get("termsLater", []):
        for w in TERM_WORDS.get(name, []):
            if re.search(rf"\b{re.escape(w)}", a) and not re.search(rf"\b{re.escape(w)}", seen):
                out.append(w)
    return out


def check(c: dict, answer: str, facts: dict, question: str | None) -> dict:
    kind = c["kind"]
    if kind == "text":
        ok = any(norm(x) in norm(answer) for x in c["any"])
        return {"label": c["label"], "pass": ok, "missing": [] if ok else ["one of: " + ", ".join(c["any"][:6])]}
    if kind == "absent":
        hit = re.search(c["pattern"], answer, re.IGNORECASE | re.MULTILINE)
        return {"label": c["label"], "pass": hit is None, "missing": [] if hit is None else [f"found {hit.group(0)!r}"]}
    if kind == "max_words":
        n = words(answer)
        return {"label": f"at most {c['value']} words", "pass": n <= c["value"], "missing": [] if n <= c["value"] else [f"{n} words"]}
    if kind == "max_sentences":
        n = sentence_count(answer)
        return {"label": f"at most {c['value']} sentences", "pass": n <= c["value"], "missing": [] if n <= c["value"] else [f"{n} sentences"]}
    if kind == "no_certify":
        hit = re.search(CERTIFY, answer, re.IGNORECASE)
        return {"label": "doesn't certify understanding", "pass": hit is None, "missing": [] if hit is None else [f"found {hit.group(0)!r}"]}
    if kind == "no_later_terms":
        found = later_terms(answer, facts, question)
        return {"label": "uses no later lesson's term", "pass": not found, "missing": found}
    if kind == "numbers_from_facts":
        found = unverified_numbers(answer, facts, question)
        return {"label": "every number is from the facts", "pass": not found, "missing": found}
    raise ValueError(kind)


def run_case(case: dict, lesson_store: lessons.Lessons, store, temperature: float, standing: list[str]) -> dict:
    a = assist.Assistant(store, assist.AssistConfig(), lessons=lesson_store)  # fresh conversations per case
    ref = {"id": case["lesson"], "step": case["step"], "example": case["example"]}
    conv_id, turns = None, []
    for n, turn in enumerate(case["turns"], 1):
        req = {"action": turn["action"], "lesson": ref, **({"question": turn["question"]} if "question" in turn else {}),
               **({"conversation": conv_id} if conv_id else {})}
        try:
            conv, messages, user, max_tokens = a.prepare(req)
        except LabError as err:
            turns.append({"turn": n, "action": turn["action"], "question": turn.get("question"), "refused": err.code, "answer": "", "checks": [
                {"label": "the turn was answered", "pass": False, "missing": [err.code]}]})
            break
        result = assist.stream_answer(a.cfg, messages, max_tokens, lambda piece: None, temperature=temperature)
        if result["answer"]:
            a.conversations.add(conv, user, result["answer"])
        conv_id = conv["id"]
        facts = a.facts_of(conv)
        answer = result["answer"]
        q = turn.get("question")
        checks = [check({"kind": k, "value": DEFAULT_MAX_WORDS} if k == "max_words" else {"kind": k}, answer, facts, q) for k in standing]
        # A case check applies to the turn it names, or to the last turn if it names none.
        checks += [check(c, answer, facts, q) for c in case["checks"] if c.get("turn", len(case["turns"])) == n]
        turns.append({"turn": n, "action": turn["action"], "question": q, "answer": answer, "words": words(answer),
                      "finish": result.get("finish"), "timingsMs": result.get("timingsMs"), "usage": result.get("usage"), "checks": checks,
                      "facts": facts})
    passed = all(c["pass"] for t in turns for c in t["checks"])
    return {"id": case["id"], "category": case["category"], "lesson": case["lesson"], "step": case["step"], "example": case["example"],
            "expected": case["expected"], "pass": passed, "turns": turns}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--cases", default="tutor_cases.json")
    p.add_argument("--repeats", type=int, default=1)
    p.add_argument("--only", help="comma-separated case ids")
    p.add_argument("--temperature", type=float, default=assist.TEMPERATURE)
    p.add_argument("--label", default="")
    a = p.parse_args()
    path = HERE / a.cases
    raw = path.read_bytes()
    data = json.loads(raw)
    cases = [c for c in data["cases"] if not a.only or c["id"] in a.only.split(",")]
    cfg = assist.AssistConfig()
    model = assist.resolve_model(cfg)
    with tempfile.TemporaryDirectory() as tmp:
        store = service.CorpusStore(Path(tmp) / "u", datasets_home=None)
        lesson_store = lessons.Lessons(store, Path(tmp) / "runs")
        runs = []
        for r in range(a.repeats):
            for case in cases:
                out = run_case(case, lesson_store, store, a.temperature, data["standing"])
                out["repeat"] = r + 1
                runs.append(out)
                print(f"{case['id']} r{r + 1} {'PASS' if out['pass'] else 'FAIL'} " +
                      "; ".join(f"{c['label']}: {c['missing']}" for t in out["turns"] for c in t["checks"] if not c["pass"]), flush=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    record = {"cases": a.cases, "casesSha256": hashlib.sha256(raw).hexdigest(), "model": model, "served": served_model(assist.AssistConfig(model=model)),
              "temperature": a.temperature, "repeats": a.repeats, "when": stamp,
              "promptFingerprint": hashlib.sha256((assist_lesson.SYSTEM_PROMPT + json.dumps(assist_lesson.INSTRUCTIONS, sort_keys=True)).encode()).hexdigest()[:12],
              "runs": runs}
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{Path(a.cases).stem}{('-' + a.label) if a.label else ''}-{stamp}.json"
    out.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    n = len(runs)
    print(f"{sum(r['pass'] for r in runs)}/{n} case runs passed every automatic check. Saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
