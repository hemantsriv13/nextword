# Neural MLP journey

A real, small neural network that learns to predict the next character, trained in this Lab, with a
guided lesson that follows one example through it. Every number on the page is computed from the
network's actual weights.

## Three different models, kept apart

| | What it is | Where it runs | Made by |
|---|---|---|---|
| **Bigram engine** | Counts which character follows which | `nextword/bigram.py`, Python | You (no training, only counting) |
| **Character MLP** (this page) | A neural network: embeddings → tanh hidden layer → softmax, trained by gradient descent | `nextword/mlp.py`, PyTorch on the CPU | You: trained here from random weights |
| **Local AI tutor** | A pretrained language model (Qwen3-4B-Instruct-2507, Q4_K_M) | Colibri v2.1.0, on this computer | Downloaded; the Qwen team trained it. NextWord does not train or change it |

In the app these are called **"Your trainable MLP"** and **"Local AI tutor"**. The tutor only words
explanations of the MLP's real numbers. It doesn't compute them, and it isn't the model being studied. The page
and the facts sent to it both say so.

**Why the MLP doesn't run in Colibri.** The installed Colibri v2.1.0 (Windows build, checked 2026-11-04) is an
inference engine for published model families (Qwen, GLM, DeepSeek, Kimi and others). Its commands are `serve`,
`run`, `chat`, `bench`, `convert`, `import`, `tune` and setup tools. None of them defines or trains a custom
network. So the MLP is trained and run with PyTorch in the Lab's Python backend, and Colibri is used only for the
tutor.

## The model

```
window of n previous characters (token ids)
  → embedding lookup: n vectors of d numbers → joined into n·d numbers
  → hidden layer: h = tanh(x·W1 + b1), H numbers between −1 and 1
  → output layer: one score (logit) per vocabulary token
  → softmax: probabilities that add up to 1
loss = −ln p(correct next character)          (cross-entropy)
update: every weight ← weight − learning rate × gradient   (plain gradient descent, batches of examples)
```

- **Vocabulary**: the characters of the *training* part, plus ⟨start⟩ (fills the window before a
  text part begins) and ⟨?⟩ (a character never seen in training). Generation never samples either.
- **Defaults** (small, bounded): window 3 (1–8), embedding 8 (2–32), hidden 64 (4–256),
  2,000 updates (≤ 20,000), batch 32 (≤ 512), learning rate 0.1 (0.01–1), seed 1.
- **CPU only**: PyTorch's CPU build, limited to 2 threads, so training doesn't compete with the
  explanation model for the GPU.

## Data separation

The three datasets (tiny, medium, large; [DATASETS.md](DATASETS.md)) come with fixed training,
validation and test parts made from whole chapters, with repeated passages removed. Any other text is split
into contiguous parts **before** any example is made: 80% training, 10% validation, 10% test, the same split
as the Evaluation bench. Windows never reach across parts (they
are padded with ⟨start⟩ instead). Training uses only the training part. Validation loss is shown
while training. The test part is used only in the final MLP-vs-bigram comparison; nothing is chosen
by looking at it, and the lesson can't inspect test examples.

## What you can do on the page

- **Train**, **Stop** (keeps the weights reached so far) and **Remove this run** (deletes its files).
  One run trains at a time. Progress and loss curves are measured from the run as it trains.
- **Resume** a stopped or interrupted run, or **Train again from the start** with the same text and settings.
- **Saved runs** are written to `data/lab/mlp/<run>/` (ignored by Git):
  - `initial.pt`, `trained.pt` and `best.pt` hold weights, vocabulary and settings;
  - `history.pt` holds the recorded steps;
  - `resume.pt` holds the step and the batch-order generator's state;
  - `run.json` holds the curve and the record.

  Reloading checks every checkpoint against its fingerprint, and refuses a run whose training text has changed.
- **Three checkpoints**, each with a weight fingerprint:
  - *initial*: random weights, before any update;
  - *trained*: the latest weights, when training ended or was stopped;
  - *selected*: the curve point with the lowest **validation** loss.

  The test part scores the selected checkpoint once, in the comparison.
- **Eight stages**: Text → Training examples → Embeddings → Hidden layer → Predictions → Loss →
  Weight update → Generation, for any training or validation example.
- **Weight update** shows one real gradient-descent step on the selected example, computed on a copy
  so the run itself doesn't change.
- **Generation** writes 60 characters with a seed. It shows the first steps' windows, probabilities and draws,
  compares initial and trained samples, and scores the MLP against the bigram (below).
- **Each stage** shows what you are looking at, why it matters, one thing to try and **what you should see**
  (worded from the run's own numbers), with Info icons beside the terms. "What the eight steps cover" lists every
  stage in one line each.
- **Playground → Write with your MLP** writes with a saved run's trained weights, using the Playground's prompt,
  length and seed. The text is labelled with the run and its weight fingerprint.
- **Ask local AI** explains the stage on screen from facts the backend recomputes from the run,
  checkpoint and example; answers are bound to the weights' fingerprint and marked as earlier when
  you retrain or change the selection.

## Interrupted runs and resume

- While training, a run writes everything needed to continue every 3 seconds. That is one file named by its step
  (`progress-NNNNNN.pt`: weights, selected checkpoint, recordings, batch-order generator state), then `run.json`.
  Each write is atomic, so a crash leaves `run.json` describing a complete file.
- If the Lab stops mid-training, the run reloads as **Interrupted (incomplete)** at its last saved step. A stopped
  run shows **Stopped early (incomplete)**.
- **Resume is offered only when it is exact.** Plain gradient descent has no optimizer state besides the learning
  rate (no momentum, no Adam moments), so the weights, the step and the generator's state are all that continuing
  needs. A run saved without that state, such as runs from before this release, offers only "Train again from the
  start".
- Verified:
  - Unit tests: stop at update 47 and resume, or simulate a server death at update 60, reload and resume. Both give
    weights identical to an uninterrupted run.
  - Real process, 2026-11-04: a Lab was killed at update 12,845 of 20,000. It reloaded as interrupted at 11,974,
    the last save. Resuming took 4.4 s, and the weights (`667c8a3075d0`) were identical to an uninterrupted run
    with the same seed.

## Comparing with the bigram fairly

- **Same targets:** every character from the second of each part on, for every column. The table shows how many,
  and how many are characters never seen in training.
- **Vocabulary:** the characters of the training part only, for both models.
- **Unseen characters:** a character never seen in training counts as one "unknown" outcome for both. The MLP
  predicts ⟨?⟩, the add-1 bigram keeps one extra slot (V = training characters + 1), and the unsmoothed bigram
  gives it probability 0, which makes its loss infinite.
- **Smoothing:** the MLP needs none (softmax is never 0). The bigram is shown unsmoothed (as built) and add-1.
- **Model selection on validation only.** Columns:
  - *MLP, last* is the final weights;
  - *MLP, selected* is the lowest-validation checkpoint;
  - the test row for *selected* is the honest final number.
- **The MLP doesn't have to win.** After 20,000 updates on the Sample passage, the *last* weights overfit: their
  validation loss is 3.976, worse than the add-1 bigram's 2.679. The *selected* checkpoint (update 1,200) scores
  2.262 on validation and 2.294 on test.

## Reproducibility

The seed fixes the initial weights, the order of training batches and generation's random draws.
On this computer the same settings and seed give identical weights (tested). Results can differ on
other computers or PyTorch versions, because floating-point arithmetic and thread scheduling are not
guaranteed to be identical everywhere.

## Measured on this laptop (2026-11-04)

Training time and peak memory of the whole Lab process, each configuration in a fresh process, 2,000 updates
unless stated (`evals/mlp/measure.py`, `evals/mlp/results/measure-20261104.json`). The 4B tutor was loaded on the
GPU at the time.

| Dataset | Window, embedding, hidden, batch | Training time | Peak memory | Validation loss: MLP / bigram add-1 |
|---|---|---|---|---|
| Tiny | 3, 8, 64, 32 | 0.99 s | 193 MB | 1.238 / 1.815 |
| Medium | 3, 8, 64, 32 | 1.59 s | 223 MB | 2.276 / 2.409 |
| Medium | 5, 12, 128, 64 | 2.46 s | 229 MB | 2.113 / 2.409 |
| Large | 3, 8, 64, 32 | 1.91 s | 303 MB | 2.307 / 2.368 |
| Large | 8, 16, 256, 128 | 6.06 s | 374 MB | 2.087 / 2.368 |
| Large, 20,000 updates | 8, 16, 256, 128 | 26.65 s | 378 MB | 1.548 / 2.368 |

Sample passage, page defaults, in the browser: 2,000 updates at 0.50–0.55 ms each (about 1 s); 20,000 updates in
10.1 s.

### Earlier measurement (2026-11-01)

Default settings (window 3, embedding 8, hidden 64, 2,000 updates, batch 32, learning rate 0.1, seed 1) on the
Sample passage (1,167 characters → 933 training, 116 validation and 116 test examples; 40 tokens; 4,520 weights):

| | Result |
|---|---|
| Training time | 1.05 s for 2,000 updates (0.53 ms per update, 2 CPU threads), with the 4B explanation model loaded |
| Loss at the start (random weights) | training 3.74, validation 3.71 (equal guessing over 40 tokens: 3.69) |
| Loss at the end | training 0.96, validation 2.37; validation was lowest (2.23) partway through, then rose: overfitting on this small text |
| Validation loss vs the bigram (same split, same 116 targets) | MLP 2.37; bigram add-1 smoothed 2.68; bigram unsmoothed ∞ (11 pairs never counted) |
| Test loss (reported once, not used to choose anything) | MLP 2.36; bigram add-1 2.65 |
| Sample, random weights | `:tqNgfkr. tdp\ndoMxu  ivcMd NefMNIfO…` |
| Sample, trained weights | ` tirst that t po to anme tallong paet hoxr them vhemere a to` |

Controlled learning test (`tests/test_mlp.py`): on a 600-character "abcabc…" text the MLP reaches training and
validation loss below 0.05 in 300 updates and then writes "cabcabcab" after "ab".

## Recorded training and replay

While a run trains it saves its weights at steps 1, 2, 5, 10, 20, 50, 100, 200, 500, 1,000, 2,000 …
(and the step before each, and the last), with the exact batch of examples used for those updates. Saved runs
keep them in `history.pt`. **Replay the recorded training** (under the curves) shows them again: the loss of
each saved state measured now, and any saved update in five parts, recomputed from the saved weights and batch
and checked against the weights saved after it. Nothing between saved steps is drawn or filled in. Lessons 12
and 13 of the Beginner lessons use the same recordings ([LESSONS.md](LESSONS.md)).

While training, the curves are measured on at most 20,000 examples per part (a fixed sample, the same for
every run on a text), so a large text stays fast; the bigram comparison always uses every example.

## Limitations

- On the tiny and small texts the MLP memorises quickly; even on the large corpus its output is word-shaped,
  not language.
- A run interrupted by a server stop keeps its last progress save (at most about 3 seconds of training is lost).
  Samples and before/after predictions are made when training ends, so an interrupted run shows them only after it
  is resumed.
- Only one run trains at a time. Training uses the CPU only.
- The lesson inspects one example at a time; it shows the first 16 values of long vectors and the first 8 output
  weights, with their sizes.
- The weight-update stage shows one update on one example (computed on a copy); real training averages over batches.
- Explanations come from a separate pretrained model and can be wrong. The tutor evaluation is in
  `evals/local_ai/MLP_TUTOR.md` (fresh set: 9 correct, 6 minor issues, 0 wrong by AI review; human review not done).
- The model-selection checkpoint is chosen among the curve's points (about 50 per run), not after every update.
