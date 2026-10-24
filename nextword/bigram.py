"""Character-bigram model: predict the next character from the current one, using counts.

The whole model is one table:

    counts[current_char][next_char] = how many times next_char followed current_char in the training text

To predict, we look up the row for the last character of the input, turn its counts into
probabilities (divide by the row total), and draw one character at random using those probabilities.
"""

import random
from collections import Counter, defaultdict


class UnseenContextError(Exception):
    """The model has no counts for this character, so it cannot predict what comes next."""


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


def complete(counts: dict[str, Counter], prompt: str, length: int, rng: random.Random) -> str:
    """Generate up to `length` characters after `prompt`, one sampled character at a time.

    Stops early if it reaches a character that never had a successor in the training text.
    """
    if not prompt:
        raise ValueError("prompt is empty; a bigram model needs at least one character of context")
    # Fail on the prompt itself before generating anything, so unseen input is reported, not hidden.
    next_token_probabilities(counts, prompt[-1])

    generated = []
    context = prompt[-1]
    for _ in range(length):
        try:
            probs = next_token_probabilities(counts, context)
        except UnseenContextError:
            break
        context = rng.choices(list(probs), weights=list(probs.values()))[0]
        generated.append(context)
    return "".join(generated)
