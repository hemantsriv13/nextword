"""Command line: python -m nextword "Your text" [--length N] [--seed S] [--data PATH]"""

import argparse
import random
import sys
from pathlib import Path

from nextword.bigram import UnseenContextError, complete, count_bigrams, tokenize

DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data" / "sample.txt"


def main() -> int:
    parser = argparse.ArgumentParser(prog="nextword", description="Suggest a continuation for your text.")
    parser.add_argument("prompt", help="the text to continue")
    parser.add_argument("--length", type=int, default=40, help="characters to generate (default 40)")
    parser.add_argument("--seed", type=int, help="random seed; the same seed gives the same suggestion")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="training text file")
    args = parser.parse_args()

    if args.length < 1:
        parser.error("--length must be at least 1")
    seed = args.seed if args.seed is not None else random.randrange(10_000)

    text = args.data.read_text(encoding="utf-8")
    tokens = tokenize(text)
    counts = count_bigrams(tokens)

    try:
        suggestion = complete(counts, args.prompt, args.length, random.Random(seed))
    except (UnseenContextError, ValueError) as err:
        print(f"No suggestion: {err}.", file=sys.stderr)
        return 1

    print(f"prompt:     {args.prompt!r}")
    print(f"suggestion: {suggestion!r}")
    print(f"engine: char-bigram | data: {args.data.name} ({len(tokens)} chars, "
          f"{len(set(tokens))} distinct) | seed: {seed}")
    if len(suggestion) < args.length:
        print(f"note: stopped after {len(suggestion)} chars; reached a character with no known successor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
