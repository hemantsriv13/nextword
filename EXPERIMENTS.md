# Experiments

Only results actually run are recorded. Small-data results describe this toy setup, nothing more.

## E0 · Bigram smoke test (2026-10-25)
- **Hypothesis:** the CLI produces a suggestion, the same seed reproduces it, unseen input is refused.
- **Settings:** `data/sample.txt` (1,167 chars, 39 distinct), prompt `"The rain"`, length 40, seeds 1 and 2.
- **Results:**
  - seed 1 → `' Thed we cite se l clod the s t the fit '`, identical on a second run.
  - seed 2 → `'ey juis whe s ppploke I to bof a Soomane'`.
  - `"Hello!"` → refused: `'!'` never appears in the training text.
  - Row for `'n'`: 75 occurrences; P(' ' | 'n') = 0.253, P('d' | 'n') = 0.160, P('o' | 'n') = 0.160.
- **Interpretation:** mechanics work. Output has plausible letter pairs ("th", "he") but no words,
  as expected from one character of context and a tiny text.
- **Next step:** make the probabilities visible (1.2), then measure quality on held-out text (1.4).
