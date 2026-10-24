# Roadmap

**Current position: Stage 1, increment 1.1 done and understood with assistance. The NextWord Lab
(learning interface) is built. Next: your independent recheck of 1.1 in the Lab, then 1.2.**

## Stage 1: Count-based autocomplete
| # | Increment | Done when | Status |
|---|---|---|---|
| 1.1 | Char-bigram baseline CLI | Prompt → seeded suggestion; unseen input refused | ✅ implemented |
| 1.2 | Inspect probabilities | Can print top next-char probabilities for a context | — your `--show-probs` exercise (step 1 of 3); the Lab shows these already |
| 1.3 | Save / reload counts | Suggestions identical before and after reload | — |
| 1.4 | Train/validation/test split + held-out loss | Loss reported on text the model never counted | Lab code exists (`nextword/lab/service.py`); you haven't walked through it yet |
| 1.5 | Longer-context n-gram | n configurable; compared with bigram on the same split | — |

## NextWord Lab (built 2026-10-25, by the assistant at your request)
A local web app around the engines: see [docs/LAB.md](docs/LAB.md). It shows your bigram engine's
real behaviour and labels everything else as a simulation or a worked example. Having the Lab does
not mark any increment as understood; your evidence is recorded separately, by you.

## Stage 2: Small neural LM (fixed context, embeddings, MLP; PyTorch)
Done when: readable training loop, checkpoints, train/val curves, a controlled overfitting demo.
The Lab's Neural page simulates this in the browser and is ready to show your real training logs.

## Stage 3: Tiny causal transformer
Done when: attention worked by hand first, causal mask verified by test, trains locally.
The Lab's Attention page is the "by hand" part (toy numbers).

## Stage 4: Generation and evaluation
Done when: greedy/temperature/top-k/top-p, fair engine comparison, error analysis, one ablation.

## Stage 5: Usable local app
Done when: small API + writing UI (accept / regenerate / model selector), logs, latency, regression checks.
Partly present in the Lab (API, writing playground, timings); regression checks for model swaps are not.

## Stage 6: Optional extensions (not started; chosen later)
A. Continued training on a separate collection · B. "Write using my notes" (RAG, separate model) ·
C. Inference optimization, only after measuring a bottleneck.
