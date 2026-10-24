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
