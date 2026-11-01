# Neural MLP journey

A real, small neural network that learns to predict the next character, trained in this Lab, with a
guided lesson that follows one example through it. Every number on the page is computed from the
network's actual weights.

## Three different models, kept apart

| | What it is | Where it runs | Made by |
|---|---|---|---|
| **Bigram engine** | Counts which character follows which | `nextword/bigram.py`, Python | You (no training, only counting) |
| **Character MLP** (this page) | A neural network: embeddings → tanh hidden layer → softmax, trained by gradient descent | `nextword/mlp.py`, PyTorch on the CPU | You: trained here from random weights |
| **Explaining model** | A pretrained language model (Qwen3-4B or Qwen3.5-9B) | Colibri, on this computer | Downloaded; the Qwen team trained it |

The explaining model only words explanations of the MLP's real numbers. It does not compute them,
and it is not the model being studied. The page and the facts sent to it both say so.

**Why the MLP doesn't run in Colibri.** Colibri is an inference engine for specific large language
model families (Qwen, GLM, DeepSeek, Kimi and others), read from their published files. Its `c/train/`
code trains LoRA adapters for its GLM transformer only. It has no way to define, train or run a
custom character MLP, so this project doesn't force one into it: the MLP is trained and run with
PyTorch in the Lab's Python backend, and Colibri is used only to explain the results.

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
- **Saved runs** are written to `data/lab/mlp/<run>/` (ignored by Git): `initial.pt` and `trained.pt`
  hold the weights, the vocabulary and the settings; `run.json` holds the curve and record. Reloading
  checks the weights against their fingerprints and refuses a run whose training text has changed.
- **Two checkpoints**: *initial* (random weights, before any update) and *trained* (when training
  ended or was stopped), each with a weight fingerprint.
- **Eight stages**: Text → Training examples → Embeddings → Hidden layer → Predictions → Loss →
  Weight update → Generation, for any training or validation example.
- **Weight update** shows one real gradient-descent step on the selected example, computed on a copy
  so the run itself doesn't change.
- **Generation** writes 60 characters with a seed, shows the first steps' windows, probabilities and
  draws, compares initial and trained samples, and scores the MLP against the bigram.
- **Ask local AI** explains the stage on screen from facts the backend recomputes from the run,
  checkpoint and example; answers are bound to the weights' fingerprint and marked as earlier when
  you retrain or change the selection.

## Reproducibility

The seed fixes the initial weights, the order of training batches and generation's random draws.
On this computer the same settings and seed give identical weights (tested). Results can differ on
other computers or PyTorch versions, because floating-point arithmetic and thread scheduling are not
guaranteed to be identical everywhere.

## Measured on this laptop (2026-11-01)

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
- Runs are kept in the Lab server's memory and saved to disk only when training ends or is stopped; a run that is
  training when the server stops is lost.
- Only one run trains at a time. Training uses the CPU only.
- The lesson inspects one example at a time; it shows the first 16 values of long vectors and the first 8 output
  weights, with their sizes.
- The weight-update stage shows one update on one example (computed on a copy); real training averages over batches.
- Explanations come from a separate pretrained model and can be wrong; see `docs/LOCAL_AI.md`.
