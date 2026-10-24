"""Character-bigram model: predict the next character from the current one, using counts.

The whole model is one table:

    counts[current_char][next_char] = how many times next_char followed current_char in the training text

To predict, we look up the row for the last character of the input, turn its counts into
probabilities (divide by the row total), and draw one character at random using those probabilities.
"""

import random
from bisect import bisect_right
from collections import Counter, defaultdict
from itertools import accumulate
from typing import Iterator, NamedTuple


class UnseenContextError(Exception):
    """The model has no counts for this character, so it cannot predict what comes next."""


class Step(NamedTuple):
    """One generation step: what the model looked at, what it believed, and what it drew."""

    context: str
    probabilities: dict[str, float]
    draw: float  # the uniform random number in [0, 1) that picked the token
    token: str


def tokenize(text: str) -> list[str]:
    """Character tokenization: every character (including spaces and newlines) is one token."""
    return list(text)


def count_bigrams(tokens: list[str]) -> dict[str, Counter]:
    """Count how often each token is followed by each other token."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for current, following in zip(tokens, tokens[1:]):
        counts[current][following] += 1
    return dict(counts)


def next_token_probabilities(counts: dict[str, Counter], context: str) -> dict[str, float]:
    """P(next | context): one row of counts, normalized so the values add up to 1."""
    row = counts.get(context)
    if not row:
        raise UnseenContextError(f"no training text ever continued after {context!r}")
    total = sum(row.values())
    return {token: n / total for token, n in row.items()}


def sample_next(probs: dict[str, float], rng: random.Random) -> tuple[str, float]:
    """Draw one token. Returns (token, draw) so the choice can be traced.

    The probabilities are laid end to end on [0, 1); the draw lands in one token's interval.
    This is exactly what rng.choices(tokens, weights) does, so results match it seed for seed.
    """
    tokens = list(probs)
    cumulative = list(accumulate(probs.values()))
    draw = rng.random()
    index = bisect_right(cumulative, draw * cumulative[-1], 0, len(tokens) - 1)
    return tokens[index], draw


def generate_steps(counts: dict[str, Counter], prompt: str, length: int, rng: random.Random) -> Iterator[Step]:
    """Yield up to `length` generation steps after `prompt`, one sampled character at a time.

    Stops early if it reaches a character that never had a successor in the training text.
    """
    if not prompt:
        raise ValueError("prompt is empty; a bigram model needs at least one character of context")
    # Fail on the prompt itself before generating anything, so unseen input is reported, not hidden.
    next_token_probabilities(counts, prompt[-1])

    context = prompt[-1]
    for _ in range(length):
        try:
            probs = next_token_probabilities(counts, context)
        except UnseenContextError:
            return
        token, draw = sample_next(probs, rng)
        yield Step(context, probs, draw, token)
        context = token


def complete(counts: dict[str, Counter], prompt: str, length: int, rng: random.Random) -> str:
    """Generate up to `length` characters after `prompt` (see generate_steps)."""
    return "".join(step.token for step in generate_steps(counts, prompt, length, rng))
