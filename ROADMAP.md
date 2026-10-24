# Roadmap

**Current position: Stage 1, increment 1.1 done; waiting on understanding check.**

## Stage 1: Count-based autocomplete
| # | Increment | Done when | Status |
|---|---|---|---|
| 1.1 | Char-bigram baseline CLI | Prompt → seeded suggestion; unseen input refused | ✅ implemented |
| 1.2 | Inspect probabilities | Can print top next-char probabilities for a context | — |
| 1.3 | Save / reload counts | Suggestions identical before and after reload | — |
| 1.4 | Train/validation/test split + held-out loss | Loss reported on text the model never counted | — |
| 1.5 | Longer-context n-gram | n configurable; compared with bigram on the same split | — |

## Stage 2: Small neural LM (fixed context, embeddings, MLP; PyTorch)
Done when: readable training loop, checkpoints, train/val curves, a controlled overfitting demo.

## Stage 3: Tiny causal transformer
Done when: attention worked by hand first, causal mask verified by test, trains locally.

## Stage 4: Generation and evaluation
Done when: greedy/temperature/top-k/top-p, fair engine comparison, error analysis, one ablation.

## Stage 5: Usable local app
Done when: small API + writing UI (accept / regenerate / model selector), logs, latency, regression checks.

## Stage 6: Optional extensions (not started; chosen later)
A. Continued training on a separate collection · B. "Write using my notes" (RAG, separate model) ·
C. Inference optimization, only after measuring a bottleneck.
