"""Run an Ask local AI evaluation against the real local model.

    .venv\\Scripts\\python evals\\local_ai\\run_eval.py --cases dev_cases.json --split all --repeats 3
    .venv\\Scripts\\python evals\\local_ai\\run_eval.py --cases fresh_cases.json --split all --repeats 3 --sealed

Each case builds a real journey run (in a temporary copy of the corpus store), sends the same requests
the Lab's page would send through nextword/lab/assist.py, and records every answer in the
conversation, its timing and the automatic checks. Multi-turn cases are checked turn by turn.

The checks are deliberately narrow: required numbers and phrases appear, forbidden ones don't, a few
known mistakes are detected, and claims about which row a character came from are compared with the
engine's trace. Passing them does not make an explanation correct or clear. The AI review and the
human review are recorded separately, by hand, in the report.

--sealed records results without printing answers or check outcomes, so a run can be measured now
and read later without it influencing work in between.
"""

import argparse
import hashlib
import json
import re
import sys
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from nextword.lab import assist, service  # noqa: E402
from nextword.lab.service import LabError  # noqa: E402

RESULTS = HERE / "results"


# ----------------------------------------------------------------------------- building the runs

def make_store(tmp: Path, corpora: dict) -> tuple[service.CorpusStore, dict]:
    store = service.CorpusStore(tmp)
    ids = {}
    for name, text in corpora.items():
        ids[name] = name if text is None else store.add(name, text)["id"]
    return store, ids


def find_seed(store, corpus_id, prompt, length, want) -> int:
    for seed in range(5000):
        g = service.journey(store, corpus_id, prompt, length, seed)["generation"]
        if len(g["steps"]) <= want["step"]:
            continue
        st = g["steps"][want["step"]]
        ranked = sorted(st["candidates"], key=lambda c: (-c["p"], c["token"]))
        if [c["token"] for c in ranked].index(st["token"]) + 1 >= want["rank_at_least"]:
            return seed
    raise RuntimeError("no seed found for " + json.dumps(want))


# ----------------------------------------------------------------------------- checks

def norm(text: str) -> str:
    t = text.lower().replace("÷", "/").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s*/\s*", "/", t)


def has_number(text: str, value: str) -> bool:
    return re.search(r"(?<![\d.])" + re.escape(value) + r"(?![\d])", text) is not None


def prob_forms(p: float) -> list[str]:
    forms = {f"{p:.4f}".rstrip("0").rstrip("."), f"{p:.3f}", f"{p:.2f}", f"{p:.1f}", f"{round(p * 100)}%", f"{p * 100:.1f}%"}
    if p in (0.0, 1.0):
        forms |= {str(int(p))}
    return sorted(forms)


def bare(label: str) -> str:
    return label.split(" (U+")[0]


SYMBOL_NAMES = {"␣": ["space", "␣"], "↵": ["line break", "newline", "new line", "↵"], "⇥": ["tab", "⇥"]}
VISIBLE = {" ": "␣", "\n": "↵", "\t": "⇥"}


def char_mentioned(text: str, label: str) -> bool:
    c = bare(label)
    if c in SYMBOL_NAMES:
        return any(n in text for n in SYMBOL_NAMES[c])
    c = c.lower()
    return any(q in text for q in (f"'{c}'", f'"{c}"', f"`{c}`", f" {c} ", f"({c})", f"{c}:", f"'{c}", f"{c}'"))


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<!\d)[.!?](?:\s|$)|\n+", text) if s.strip()]


QUOTED = r"""['"‘“`]([^\s'"’”`])['"’”`]"""
TOKEN = r"""(?:['"‘“`]([^\s'"’”`])['"’”`]|(space|␣|newline|line break|↵))"""


def token_of(m_quoted: str | None, m_named: str | None) -> str:
    if m_quoted:
        return {"␣": " ", "↵": "\n", "⇥": "\t"}.get(m_quoted, m_quoted)
    return " " if m_named in ("space", "␣") else "\n"


def trace_claims(answer: str, ctx: dict) -> list[str]:
    """Claims of the form 'X came from the row for Y' / 'X was drawn after Y', compared with the trace,
    and 'X follows Y' compared with the count table. Returns the claims that are false."""
    wrong = []
    a = answer.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    pairs_in_trace = {(s["context"], s["token"]) for s in ctx["steps"]}
    rows = ctx["rows"]
    drawn = re.compile(TOKEN + r"[^.\n]{0,40}?\b(?:came|comes|was drawn|was chosen|was picked)\s+from\s+the\s+row\s+(?:for|of)\s+" + TOKEN, re.IGNORECASE)
    for m in drawn.finditer(a):
        x, y = token_of(m.group(1), m.group(2)), token_of(m.group(3), m.group(4))
        if (y, x) not in pairs_in_trace:
            wrong.append(m.group(0))
    # The subject may be a short quoted string ("an"): its first character is the one that follows.
    follows = re.compile(r"""(?:['"‘“`]([^\s'"’”`]{1,3})['"’”`]|(space|␣|newline|line break|↵)),?\s+(?:which\s+)?(?:follows|comes after|came after)\s+""" + TOKEN, re.IGNORECASE)
    for m in follows.finditer(a):
        x, y = token_of(m.group(1)[0] if m.group(1) else None, m.group(2)), token_of(m.group(3), m.group(4))
        if not rows.get(y, {}).get(x):
            wrong.append(m.group(0))
    # Pairs written with an arrow ("t→a", "'t' -> 'a'") must exist in the count table. Invented examples are skipped.
    invented = made_up_section(a) or ""
    arrow = re.compile(r"""(?<![\w'"‘“])['"‘“]?([^\s'"’”→>|()])['"’”]?\s*(?:→|->)\s*['"‘“]?([^\s'"’”.,;)])['"’”]?""")
    for m in arrow.finditer(a.replace(invented, "") if invented else a):
        y, x = ({"␣": " ", "↵": "\n"}.get(m.group(1), m.group(1)), {"␣": " ", "↵": "\n"}.get(m.group(2), m.group(2)))
        if not rows.get(y, {}).get(x):
            wrong.append(m.group(0))
    return wrong


ZERO = re.compile(r"\b(probabilit\w*|chance)\b[^.\n]*\b(0|zero)\b|\b(0|zero)\b[^.\n]*\bprobabilit", re.IGNORECASE)
ALL = re.compile(r"\b(any|every|all|each)\b", re.IGNORECASE)


NOT_ZERO = re.compile(r"(not|n't|never)\b[^.\n]{0,25}\b(0|zero)\b|\bnot even zero|\bno probabilities\b[^.\n]{0,15}\b(not|nor)\b", re.IGNORECASE)


def unseen_called_zero(answer: str, char: str) -> list[str]:
    """Sentences that give a character with no row a probability of 0 ("its probability is 0", "every
    character after 'z' has probability 0"). Negated sentences ("not 0", "doesn't say 0") are fine."""
    out = []
    for s in sentences(answer.replace("’", "'")):
        if not ZERO.search(s) or NOT_ZERO.search(s):
            continue
        about_char = char_mentioned(" " + norm(s) + " ", char)
        if about_char and (ALL.search(s) or re.search(r"\b(its|the) probabilit\w* (is|are|would be|becomes?) (0|zero)\b", s, re.IGNORECASE)):
            out.append(s)
    return out


SEED_CLAIM = re.compile(r"\b(each|every|all|later)\s+(?:the\s+)?steps?\b[^.\n]*\b(same|remain|stay|unchanged|do not change|don't change|doesn't change)\b|"
                        r"\bprobabilities\s+at\s+(?:each|every)\s+step\s+(?:remain|stay|are the same)", re.IGNORECASE)


def seed_overclaim(answer: str) -> list[str]:
    return [s for s in sentences(answer) if SEED_CLAIM.search(s) and not re.search(r"\b(can|may|might|could)\b[^.]*\b(differ|change)", s, re.IGNORECASE)]


MADE_UP = re.compile(r"made[- ]up|invented|imaginary|hypothetical", re.IGNORECASE)


def made_up_section(answer: str) -> str | None:
    m = MADE_UP.search(answer)
    if not m:
        return None
    rest = answer[m.start():]
    end = re.search(r"\n\s*\n[^\n]*(this run|in this run|from this run|your run|real run|back to)", rest, re.IGNORECASE)
    return rest[: end.start()] if end else rest


def made_up_check(answer: str, facts: dict) -> dict:
    """An invented example must be labelled, internally consistent, and not simply the real run relabelled.
    Sharing one number with the run is fine; reproducing the run's whole step under a made-up label is not."""
    problems = []
    sec = made_up_section(answer)
    if sec is None:
        return {"label": "invented example is labelled and consistent", "pass": False, "missing": ["no 'made-up' label found"]}
    step = facts["lessonStep"]
    nums = [float(x) for x in re.findall(r"(?<![\d.])(\d+(?:\.\d+)?)(?![\d])", sec)]
    pct = [float(x) / 100 for x in re.findall(r"(\d+(?:\.\d+)?)\s?%", sec)]
    # Consistency: probabilities written as percentages should add up to 100%.
    if len(pct) >= 2 and abs(sum(pct) - 1) > 0.02 and abs(sum(pct[: len(pct) // 2]) - 1) > 0.02:
        problems.append(f"invented percentages add up to {sum(pct) * 100:.0f}%")
    # Consistency: an invented draw must land in the stated range of the character it picks.
    draw = re.search(r"(?:draw|random number|number)[^.\n]{0,30}?(0\.\d+)", sec, re.IGNORECASE)
    picks = re.search(r"\b(?:picks?|chooses?|chosen|selects?|lands? on)\b[^.\n]{0,20}?" + QUOTED, sec, re.IGNORECASE)
    if draw and picks:
        d, c = float(draw.group(1)), picks.group(1)
        rng = re.search(r"""['"‘“]""" + re.escape(c) + r"""['"’”][^.\n]{0,60}?(0(?:\.\d+)?|1(?:\.0+)?)\s*(?:to|-|–)\s*(0(?:\.\d+)?|1(?:\.0+)?)""", sec)
        if rng and not (float(rng.group(1)) <= d < float(rng.group(2)) + 1e-9):
            problems.append(f"invented draw {d} is not in {c}'s stated range {rng.group(1)}–{rng.group(2)}")
    # Not the real run relabelled: the whole step (draw and every probability) reproduced.
    if "randomDraw" in step:
        real = {round(step["randomDraw"], 4)} | {iv["probability"] for iv in step["intervalsInEngineOrder"]}
        if all(any(abs(n - r) < 1e-6 for n in nums + pct) for r in real):
            problems.append("the 'made-up' section reproduces the real run's draw and every probability")
    elif "row" in step and step["row"]["followers"]:
        real = {f["count"] for f in step["row"]["followers"]} | {step["row"]["rowTotal"]}
        if len(real) > 1 and all(any(abs(n - r) < 1e-6 for n in nums) for r in real):
            problems.append("the 'made-up' section reproduces the real row's counts")
    return {"label": "invented example is labelled, consistent and separate from the run", "pass": not problems, "missing": problems}


def run_check(check: dict, answer: str, facts: dict, ctx: dict) -> dict:
    a = norm(answer)
    step = facts["lessonStep"]
    kind = check["kind"]
    if kind == "row":
        row = step["row"]
        missing = []
        if not has_number(a, str(row["rowTotal"])):
            missing.append(f"row total {row['rowTotal']}")
        for f in row["followers"][: check["top"]]:
            if not char_mentioned(a, f["next"]):
                missing.append(f"character {f['next']}")
            if not has_number(a, str(f["count"])):
                missing.append(f"count {f['count']} for {f['next']}")
            fraction = f"{f['count']}/{row['rowTotal']}"
            if not (fraction in a or any(has_number(a, x.rstrip("%")) for x in prob_forms(f["probability"]))):
                missing.append(f"probability of {f['next']} ({f['probability']} or {fraction})")
        return {"label": f"states the row: total and top {check['top']} counts and probabilities", "pass": not missing, "missing": missing}
    if kind == "pair_count":
        n = step["selectedPair"]["count"]
        ok = has_number(a, str(n)) or (n == 0 and any(w in a for w in ("zero", "never", "no times")))
        return {"label": f"states the pair count {n}", "pass": ok, "missing": [] if ok else [f"count {n}"]}
    if kind == "draw":
        d = step["randomDraw"]
        draw_ok = any(has_number(a, f"{d:.{k}f}") for k in (2, 3, 4)) or has_number(a, str(d))
        chosen_ok = char_mentioned(a, step["chosen"])
        missing = ([] if draw_ok else [f"draw {d}"]) + ([] if chosen_ok else [f"chosen {step['chosen']}"])
        return {"label": "states the random draw and the chosen character", "pass": not missing, "missing": missing}
    if kind == "step_context":
        st = ctx["steps"][check["step"]]
        want = VISIBLE.get(st["context"], st["context"])
        ok = char_mentioned(a, want)
        return {"label": f"names {want!r}, the row step {check['step'] + 1} was drawn from", "pass": ok, "missing": [] if ok else [f"row {want}"]}
    if kind == "text":
        ok = any(norm(x) in a for x in check["any"])
        return {"label": check["label"], "pass": ok, "missing": [] if ok else ["one of: " + ", ".join(check["any"][:6])]}
    if kind == "absent":
        hit = re.search(check["pattern"], answer, re.IGNORECASE | re.MULTILINE)
        return {"label": check["label"], "pass": hit is None, "missing": [] if hit is None else [f"found {hit.group(0)!r}"]}
    if kind == "max_sentences":
        n = len([s for s in re.split(r"(?<!\d)[.!?](?:\s|$)", answer.strip()) if s.strip()])
        return {"label": f"at most {check['value']} sentences", "pass": n <= check["value"], "missing": [] if n <= check["value"] else [f"{n} sentences"]}
    if kind == "unseen_not_zero":
        found = unseen_called_zero(answer, check["char"])
        return {"label": f"does not call {check['char']!r}'s missing row 'probability 0'", "pass": not found, "missing": found}
    if kind == "no_seed_overclaim":
        found = seed_overclaim(answer)
        return {"label": "does not say every step's probabilities stay the same", "pass": not found, "missing": found}
    if kind == "made_up":
        return made_up_check(answer, facts)
    raise ValueError(kind)


ALWAYS = ("trace",)


def standing_checks(answer: str, ctx: dict) -> list[dict]:
    """Checks applied to every answer in every turn: claims about rows compared with the engine's trace and
    table, and no 'probability 0' for a character that has no row (the focused one, or where generation stopped)."""
    wrong = trace_claims(answer, ctx)
    checks = [{"label": "claims about which row a character came from match the trace", "pass": not wrong, "missing": wrong}]
    for c in sorted(ctx.get("noRow", ())):
        label = {" ": "␣", "\n": "↵"}.get(c, c)
        found = unseen_called_zero(answer, label)
        checks.append({"label": f"does not give {label!r}, which has no row, a probability of 0", "pass": not found, "missing": found})
    return checks


def no_row_chars(focus: dict, steps: list, rows: dict, stopped) -> set:
    out = set()
    if focus.get("stage") == "probs" and not rows.get(focus.get("context")):
        out.add(focus["context"])
    if stopped and steps:
        out.add(steps[-1]["token"])
    return out


def facts_numbers(facts: dict) -> set[str]:
    found = set()
    for raw in re.findall(r"\d+(?:\.\d+)?", json.dumps(facts, ensure_ascii=False)):
        found.add(raw)
        if "." in raw:
            found |= {x.rstrip("%") for x in prob_forms(float(raw))}
    found |= {str(i) for i in range(0, 11)}
    return found


def unverified_numbers(answer: str, facts: dict, question: str | None) -> list[str]:
    allowed = facts_numbers(facts) | set(re.findall(r"\d+(?:\.\d+)?", question or ""))
    out = []
    for n in re.findall(r"(?<![\w.])\d+(?:\.\d+)?", answer):
        if n not in allowed and n.rstrip("0").rstrip(".") not in allowed:
            out.append(n)
    return sorted(set(out), key=lambda x: float(x))


# ----------------------------------------------------------------------------- running

def ask(a: assist.Assistant, request: dict, temperature: float) -> dict:
    conv, messages, user, max_tokens = a.prepare(request)
    result = assist.stream_answer(a.cfg, messages, max_tokens, lambda piece: None, temperature=temperature)
    if result["answer"]:
        a.conversations.add(conv, user, result["answer"])
    return {"conversation": conv["id"], "facts": a.facts_of(conv), "maxTokens": max_tokens, **result}


def served_model(cfg: assist.AssistConfig) -> dict:
    with urllib.request.urlopen(cfg.url + "/models", timeout=5) as res:
        data = json.loads(res.read().decode("utf-8"))
    return next((m for m in data.get("data", []) if m.get("id") == cfg.model), {})


def prompt_fingerprint() -> str:
    return hashlib.sha256((assist.SYSTEM_PROMPT + json.dumps(assist.INSTRUCTIONS, sort_keys=True)).encode("utf-8")).hexdigest()[:12]


def run_case(case: dict, store, ids, temperature: float) -> dict:
    a = assist.Assistant(store, assist.AssistConfig())  # a fresh conversation store for every case and repeat
    corpus = ids[case["corpus"]]
    seed = case["seed"]
    if isinstance(seed, dict):
        seed = find_seed(store, corpus, case["prompt"], case["length"], seed["find"])
    run = {"corpus": corpus, "fingerprint": store.describe(corpus)["fingerprint"], "prompt": case["prompt"], "length": case["length"], "seed": seed}
    j = service.journey(store, corpus, case["prompt"], case["length"], seed)
    ctx = {"steps": j["generation"]["steps"], "rows": j["table"]["rows"]}
    ctx["noRow"] = no_row_chars(case["focus"], ctx["steps"], ctx["rows"], j["generation"]["stopped"])
    turns = [{"action": "explain", **ask(a, {"action": "explain", "run": run, "focus": case["focus"]}, temperature)}]
    if case["action"] != "explain":
        follow = {"action": case["action"], "run": run, "focus": case["focus"], "conversation": turns[0]["conversation"]}
        if case.get("question"):
            follow["question"] = case["question"]
        try:
            turns.append({"action": case["action"], "question": case.get("question"), **ask(a, follow, temperature)})
        except LabError as err:
            # A refused follow-up (e.g. the conversation no longer fits the context) is a result, not a crash.
            turns.append({"action": case["action"], "question": case.get("question"), "answer": "", "finish": None,
                          "refused": err.code, "facts": turns[0]["facts"], "maxTokens": 0,
                          "timingsMs": {"queue": None, "firstText": None, "total": 0}})
    checked = []
    for i, t in enumerate(turns):
        last = i == len(turns) - 1
        specs = case["checks"] if last else case.get("first_checks", [])
        checks = [run_check(c, t["answer"], t["facts"], ctx) for c in specs] + standing_checks(t["answer"], ctx)
        if t.get("refused"):
            checks.insert(0, {"label": "the turn was answered", "pass": False, "missing": [f"refused: {t['refused']}"]})
        checked.append({
            "action": t["action"], "question": t.get("question"), "answer": t["answer"], "finish": t["finish"],
            "timingsMs": t["timingsMs"], "maxTokens": t["maxTokens"], "checks": checks, "refused": t.get("refused"),
            "unverifiedNumbers": unverified_numbers(t["answer"], t["facts"], t.get("question")),
        })
    all_checks = [c for t in checked for c in t["checks"]]
    return {
        "id": case["id"], "split": case["split"], "covers": case["covers"], "expect": case.get("expect"), "run": run,
        "focus": case["focus"], "action": case["action"], "question": case.get("question"), "facts": turns[-1]["facts"],
        "turns": checked, "checksPassed": sum(c["pass"] for c in all_checks), "checksTotal": len(all_checks),
        "aiReview": "not yet reviewed", "humanReview": "not reviewed",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="dev_cases.json")
    parser.add_argument("--split", default="all")
    parser.add_argument("--only", help="comma-separated case ids")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--temperature", type=float, default=assist.TEMPERATURE)
    parser.add_argument("--label", default="")
    parser.add_argument("--sealed", action="store_true", help="record without printing answers or outcomes")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    cases_path = HERE / args.cases
    spec = json.loads(cases_path.read_text(encoding="utf-8"))
    cases = [c for c in spec["cases"] if args.split == "all" or c["split"] == args.split]
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    cfg = assist.AssistConfig()
    model = served_model(cfg)
    started = datetime.now().astimezone()
    records = []
    with tempfile.TemporaryDirectory() as tmp:
        store, ids = make_store(Path(tmp), spec["corpora"])
        for case in cases:
            for rep in range(args.repeats):
                r = run_case(case, store, ids, args.temperature)
                r["repeat"] = rep + 1
                records.append(r)
                if args.sealed:
                    print(f"recorded {case['id']} repeat {rep + 1}")
                    continue
                mark = "PASS" if r["checksPassed"] == r["checksTotal"] else "FAIL"
                t = r["turns"][-1]["timingsMs"]
                print(f"{mark} {case['id']:<24} r{rep + 1} checks {r['checksPassed']}/{r['checksTotal']}  first text {t['firstText'] or 0:5.0f} ms  total {t['total']:5.0f} ms")
                for i, turn in enumerate(r["turns"]):
                    for c in turn["checks"]:
                        if not c["pass"]:
                            print(f"     turn {i + 1} failed: {c['label']}: {c['missing']}")
    meta = {
        "cases": args.cases, "casesSha256": hashlib.sha256(cases_path.read_bytes()).hexdigest(), "split": args.split,
        "label": args.label, "repeats": args.repeats, "started": started.isoformat(timespec="seconds"), "model": cfg.model,
        "contextTokens": model.get("context_length"), "engine": "Colibri v2.1.0 (Windows release, CUDA)",
        "temperature": args.temperature, "maxTokens": assist.MAX_TOKENS, "promptFingerprint": prompt_fingerprint(),
        "engineVersion": service.engine_version(), "sealed": args.sealed,
    }
    RESULTS.mkdir(exist_ok=True)
    name = f"{Path(args.cases).stem}-{args.label or 'run'}-{started.strftime('%Y%m%d-%H%M%S')}.json"
    out = RESULTS / name
    out.write_text(json.dumps({"meta": meta, "cases": records}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwrote {out.relative_to(HERE.parent.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
