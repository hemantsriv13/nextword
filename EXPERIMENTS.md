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

## E1 · Held-out loss of the bigram engine (2026-10-25, run by the assistant while building the Lab)
- **Hypothesis:** with no smoothing, at least one validation pair is unseen, so the loss is infinite;
  some add-k value gives the lowest finite loss.
- **Settings:** `data/sample.txt`, split by position 80/10/10 (933 / 117 / 117 characters), pairs made
  inside each part, scored on validation (116 targets). Engine `char-bigram`; smoothing is a Lab-side
  add-k variant with V = training vocabulary + 1.
- **Results (your model):**
  - k = 0: 2 unseen contexts + 9 unseen pairs → loss ∞, perplexity undefined (2.114 nats on the 105
    covered targets, which ignores the failures).
  - k sweep: 0.01 → 2.601, 0.05 → 2.514, **0.1 → 2.499**, 0.25 → 2.518, 0.5 → 2.576, 1 → 2.679, 2 → 2.826 nats.
  - Uniform guess over 38 training characters + 1 unknown slot: log 39 = 3.664 nats.
- **Interpretation:** the counts beat a uniform guess once smoothing makes the loss finite. k = 0.1 was
  chosen *using validation*, so its score is optimistic; the test split is for the final check.
  116 targets is very few: these differences may not survive another split.
- **Next step:** rerun it yourself in the Evaluation bench; increment 1.4 explains the code.

## E2 · Overfitting in the Neural lab (2026-10-25, simulation, not your model)
- **Settings:** browser MLP, context 3, embedding 8, hidden 16, lr 0.1, full batch, 1,000 steps, seed 1;
  fixed validation text (108 pairs); training text small (91 pairs) vs larger (387 pairs), same vocabulary.
- **Results (simulation):** small text: validation lowest ≈ 2.23 at step ≈ 272, then rises to ≈ 2.81
  while training loss falls to ≈ 0.24. Larger text: validation ≈ 2.05 and roughly flat at the end.
  Checked automatically by `web/src/sim/neural.test.ts`.
- **Interpretation:** with ~1,100 parameters and 91 pairs the network memorises. This is a property of
  this toy setup, not evidence about any real model.
