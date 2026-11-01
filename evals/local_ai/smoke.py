"""Standalone Colibri check: three prompts, each repeated, streamed, with measured timings."""
import json
import sys
import time
import urllib.request

URL = "http://127.0.0.1:8000/v1/chat/completions"
MODEL = "qwen3-4b-instruct-2507-q4km"


def chat(messages, max_tokens=220):
    body = json.dumps({"model": MODEL, "messages": messages, "stream": True, "max_tokens": max_tokens,
                       "temperature": 0}).encode()
    req = urllib.request.Request(URL, body, {"Content-Type": "application/json"})
    t0 = time.perf_counter()
    first = None
    text, finish, usage = [], None, None
    with urllib.request.urlopen(req, timeout=180) as res:
        for raw in res:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            chunk = json.loads(data)
            usage = chunk.get("usage") or usage
            for ch in chunk.get("choices") or []:
                piece = (ch.get("delta") or {}).get("content")
                if piece:
                    if first is None:
                        first = time.perf_counter() - t0
                    text.append(piece)
                finish = ch.get("finish_reason") or finish
    total = time.perf_counter() - t0
    return "".join(text), first, total, finish, usage


EXAMPLE = ("Experiment facts (from a character bigram model):\n"
           "- Context character: 'h'\n"
           "- In the training text, 'h' was followed by 'e' 4 times and by 'a' 1 time (row total 5).\n"
           "- So P(e | h) = 4/5 = 0.8 and P(a | h) = 1/5 = 0.2.\n")
SYSTEM = "You explain a small experiment to a beginner. Use plain language and only the supplied numbers."

CASES = [
    ("instruction", [{"role": "user", "content": "Reply with exactly three words that describe a clear daytime sky. No punctuation."}]),
    ("explain", [{"role": "system", "content": SYSTEM},
                 {"role": "user", "content": EXAMPLE + "\nIn three or four sentences, explain why the model gives 'e' a probability of 0.8 after 'h'."}]),
]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    repeats = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    results = []
    for name, messages in CASES:
        for r in range(repeats):
            text, first, total, finish, usage = chat(messages)
            results.append({"case": name, "run": r + 1, "firstTextS": first, "totalS": total, "finish": finish, "usage": usage, "text": text})
            print(f"--- {name} run {r + 1}: first text {first:.2f} s, total {total:.2f} s, finish {finish}, usage {usage}")
            print(text)
    # Follow-up: the explanation's own answer plus one question about the same facts.
    _, explain_messages = CASES[1]
    answer = next(x["text"] for x in results if x["case"] == "explain")
    follow = explain_messages + [{"role": "assistant", "content": answer},
                                 {"role": "user", "content": "If the text had one more 'ha' pair, what would P(e | h) become? Show the division."}]
    for r in range(repeats):
        text, first, total, finish, usage = chat(follow)
        results.append({"case": "follow-up", "run": r + 1, "firstTextS": first, "totalS": total, "finish": finish, "usage": usage, "text": text})
        print(f"--- follow-up run {r + 1}: first text {first:.2f} s, total {total:.2f} s, finish {finish}, usage {usage}")
        print(text)
    with open(sys.argv[2] if len(sys.argv) > 2 else "smoke-results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
