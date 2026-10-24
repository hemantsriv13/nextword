# Learning log

## 2026-10-25 · Increment 1.1: character bigram

**Concepts introduced:** token, character tokenization, bigram, counts, conditional probability,
normalization, sampling, seed, unseen context.

**Experiments performed:** E0 smoke test (see EXPERIMENTS.md).

**Understanding check:** Why do `"The rain"` and `"A different start, rain"` give the same suggestion with the same seed?
- My answer: both end in "n", the model only uses the last character, and the seed makes the random
  choices repeatable. It learns which characters follow each other, not earlier words or meaning. ✅ (verified by running)
  Formulated with help, so recorded as "explained with assistance".
- **Pending:** independent recheck of bigram context and seeds, using a different example.
- Refinement: reproducibility needs seed + data + code + settings; changing the training text changes output for the same seed.

**Unresolved questions:**
- (add yours here)

## 2026-10-25 · NextWord Lab built (by the assistant, at your request)

The plan changed: you asked for the full interactive learning interface now, rather than after Stage 5.
It is built (see docs/LAB.md). Nothing about your understanding changed because of it:

- Your evidence carries over: bigram model and sampling are "practiced with assistance" in the Lab
  (GLOSSARY.md calls this "explained with assistance").
- **Still pending:** the independent recheck of bigram context and seeds with a new example. The Lab's
  Playground comparison uses “The rain” vs “Spain” for exactly this.
- **Still open:** your `--show-probs` modification (step 1 of 3: add the switch in `nextword/__main__.py`).
  `__main__.py` was not touched.
- Code you haven't been taught yet now exists: `sample_next()`/`generate_steps()` in `bigram.py`
  (same outputs as before, so draws can be traced) and the Lab's evaluation code (increment 1.4).
  Treat both as something to read and question, not as things you've learned.

**Unresolved questions:**
- (add yours here, or in the Lab's Notebook)
