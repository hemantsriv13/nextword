# NextWord Lab

A local web app for learning how language models work by running experiments. It sits around the
engines in `nextword/` and never replaces them: when a number comes from your engine, the page says
**Your model**; when it comes from a browser simulation, it says **Interactive simulation**; when it is
a fixed calculation, it says **Worked example**.

## Start it

One-time setup (Node 22+ and the Python venv from the README):

```
npm --prefix web install
npm --prefix web run build
```

Then, every time:

```
.venv\Scripts\python -m nextword.lab --open
```

It serves **http://127.0.0.1:8765** on this computer only. Simulations keep working if the Python
backend is stopped; the engine-backed panels say so and show the start command.

For frontend development, run the backend as above and `npm --prefix web run dev` (Vite proxies `/api`).

## Feature map

| Workspace | Your model (Python engine) | Interactive simulation (browser) | Worked example |
|---|---|---|---|
| Home | Engine version | | |
| Writing playground | Suggestions, seeded generation, the step trace (context, distribution, draw, chosen character), accept and regenerate, A/B comparison, request timings | | |
| Data and tokens | Corpus list, upload and paste (saved to `data/lab/`), preview, statistics, character frequency | Character tokens and IDs (same rule as `tokenize()`), word splitter, BPE merges, sliding windows, training pairs, split and leakage demo | |
| Counts and probability | Count table heatmap, one row normalized with real counts, a seeded draw, unseen-context refusal, recounting an edited text | 1,000 repeated draws (browser generator), add-k smoothing | |
| Neural network training | | Gradient descent on one number, one fully visible training step (embeddings, forward pass, loss, backprop, SGD), training runs in a Web Worker with train/validation curves and the overfitting experiment | |
| Attention explorer | | Toy embeddings and positions, Q/K/V, scores, scaling, causal mask, softmax weights, weighted sum, two heads, live mask check, one transformer block | |
| Decoding sandbox | | Softmax, temperature, greedy, top-k, top-p, renormalization, repeated seeded draws | The editable logits |
| Evaluation bench | Held-out loss and perplexity, per-example loss, add-k smoothing (Lab-side variant), smoothing ablation, saved runs, baseline vs candidate, rerun for reproducibility, JSON and CSV export | | |
| Serving and performance | One request's lifecycle with measured timings, count-table cache hits, latency and throughput benchmark | Batching (stated, invented costs), streaming replay | KV-cache operation counts, quantization of eight weights |
| Adaptation and retrieval | Continued training: base counts plus a second text, before/after distributions and held-out losses | Chunking, lexical search (BM25), assembled RAG prompt with source ids | The adaptation-method comparison and "where does the information live" |
| Glossary | | | 75 terms, each with plain and precise definitions, an example, a misconception, an experiment, related terms and code references |
| Notebook | | | Notes, questions, predictions, explanations, bookmarks, evidence table, experiment history, export, import and reset |

**Not built (and not faked):** a neural engine in Python (Stage 2), a transformer engine (Stage 3),
temperature/top-k in your engine (Stage 4), semantic search with a real embedding model, reranking,
answer generation for RAG. Where these appear, the page says they are not built.

## How the pieces fit

```
browser (web/)                          Python (nextword/)
  workspaces/*.tsx  ──fetch /api/*──▶     lab/server.py   (stdlib HTTP, 127.0.0.1 only)
  sim/*.ts  (simulations, tested)           lab/service.py  (generation, evaluation, adaptation, timings)
  lib/store.ts  (localStorage)               bigram.py       (your engine: the source of truth)
```

- The bigram logic exists only in Python. The browser never recomputes your engine's results.
- `bigram.py` gained `sample_next()` and `generate_steps()` so draws can be traced. `complete()` returns
  exactly what it did before (`tests/bigram_baseline.json`), and stepping in the UI replays one
  request's trace, so it never consumes extra random numbers.
- Your Stage 2 engine can plug into the Neural page through `GET /api/neural/runs` (format on that page).

## Checks

- `python -m unittest` (27): engine baseline, sampling = `rng.choices`, rows sum to 1, counts match
  the corpus, step = full generation, splits contiguous with no straddling pair, loss formula,
  smoothing sums to 1, validation errors, uploads (unique IDs, no overwrites, legacy files, cache
  follows content), emoji and combining marks as single characters, adaptation without leakage.
- `npm --prefix web test` (82): softmax/temperature/top-k/top-p, draws follow the distribution, causal
  mask zeroes the future and blocks leaks, weights normalize, gradients match finite differences, the
  update equals −lr × gradient, the overfitting experiment overfits, split-first never leaks, BPE and
  chunking, persistence export/import/reset, glossary links, code-point windows and trace layout.
  Component tests (jsdom) for the Evaluation bench (results, saves and sweeps stay bound to the
  settings that produced them; the sweep never uses the test split) and the Playground (step context
  vs next-prediction context, stale traces, emoji).

## Your data

Notes, evidence, bookmarks, saved runs and history live in this browser's localStorage (about 5 MB,
cleared with site data, not shared across browsers). Export them from the Notebook. Uploaded training
texts live in `data/lab/` (ignored by Git). Each upload gets its own random ID (`c` plus 10 hex
digits) and a `.json` beside it with its name, date and content fingerprint, so two uploads never
overwrite each other, even with the same name. Files from before this change still load, named by
their file name.

## Limitations

- Every model here is tiny and every text is tiny. Numbers describe this toy setup only.
- Simulations use a browser random generator, so their seeds never reproduce Python results.
- The Evaluation bench's smoothing is a Lab-side variant; your engine itself does not smooth.
- Timings are wall-clock on your machine and vary between runs.
- The Lab does not grade free-text explanations. It stores them for you to review.
- A character is one Unicode code point, as in the engine (`list(text)`). An emoji is one character,
  but an accented letter typed as letter + combining accent is two, and multi-part emoji (flags,
  skin tones, families joined with U+200D) are several, each shown as its own token.
- Evaluation results, saved runs and sweeps keep the settings they were measured with. Changing a
  control marks them stale rather than relabelling them; measure again to replace them.

## First guided session (about 30 minutes)

Also on the Home screen, where you can tick steps off.

1. **Playground, 4 min.** Press Step ten times on “The rain” with seed 1. For each step, find where the
   draw u lands in the interval strip.
2. **Playground, 4 min.** In *Compare side by side*, predict whether “The rain” and “Spain” match, run
   both, then write why without help. This is your pending independent recheck.
3. **Counts, 4 min.** Open the row for n, check one division by hand, draw with your engine, ask about “!”.
4. **Data and tokens, 3 min.** In *Splits and leakage*, record windows-first, then split-first.
5. **Evaluation, 5 min.** Measure with k = 0 and read why it is infinite. Run the k sweep. Save two
   runs that differ only in k and compare them.
6. **Decoding, 3 min.** Draw 1,000 times at T = 0.5 and at T = 2. Then try top-k = 2.
7. **Neural training, 5 min.** Apply three updates in *One training step*. Train on the small text,
   then the larger one, and compare validation loss.
8. **Notebook, 2 min.** Review what you saved, tick only what you can explain alone, export your data.
