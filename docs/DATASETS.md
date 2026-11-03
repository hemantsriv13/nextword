# Training texts for the MLP: three levels

These texts train **only the Lab's small character MLP** (and the bigram counts it is compared with). They
do not train, change or fine-tune Qwen, the pretrained model that explains and tutors. The app says so
wherever a dataset can be chosen.

| Level | Id | Where it lives | Size (train / validation / test characters) | Used for |
|---|---|---|---|---|
| Tiny | `ds-tiny-abc`, `ds-tiny-cat`, `ds-tiny-banana` | `data/teaching/tiny.json` (in the repository) | 60/12/12, 133/41/42, 71/18/20 | Beginner lessons (default), reading every example |
| Medium | `ds-medium-alice` | `D:\LocalAI\datasets\prepared\medium-alice` | 31,193 / 13,834 / 11,673 | Practice: a text large enough to show generalising and overfitting |
| Large | `ds-large-austen-doyle` | `D:\LocalAI\datasets\prepared\large-austen-doyle` | 991,720 / 128,554 / 120,172 | A real corpus, about 1.2 million characters |

The folder is `$NEXTWORD_DATASETS` if that environment variable is set; otherwise `LocalAI/datasets` on drive D: if it exists (this laptop), otherwise `~/LocalAI/datasets`. Without the prepared folder the
Lab still works: the tiny texts are always there, and the medium and large lessons say how to prepare them.

## Sources and licence

| Book | Author | Project Gutenberg file | SHA-256 of the downloaded file |
|---|---|---|---|
| Alice's Adventures in Wonderland (1865) | Lewis Carroll (1832–1898) | `pg11.txt` | `01b38ea4…725e` |
| Pride and Prejudice (1813) | Jane Austen (1775–1817) | `pg1342.txt` | `3f6bb9d6…d75` |
| The Adventures of Sherlock Holmes (1892) | Arthur Conan Doyle (1859–1930) | `pg1661.txt` | `922e2a12…cd0` |

All three are public domain in the United States (Project Gutenberg). The authors died more than 90 years
ago, so the texts are also public domain in India, the UK and the EU. Gutenberg's header, footer and
licence text are removed, which its licence allows for public-domain texts; the downloaded originals stay
untouched in `D:\LocalAI\datasets\gutenberg\raw` with a `SHA256SUMS` file. The tiny texts were written for
this project. Full checksums are in each `manifest.json` and in `nextword/datasets.py`.

## Preprocessing (`nextword/datasets.py`, recorded in each manifest)

1. Keep only the text between Gutenberg's `*** START …` and `*** END …` markers.
2. Drop the front matter before chapter 1 (title pages, contents, the illustrated edition's preface).
3. Remove illustration captions and their copyright notes, chapter headings, Alice's `* * *` scene breaks,
   Holmes's section numbers, and the `/* … */` layout markers around letters in Pride and Prejudice (the
   letters' words are kept).
4. Join wrapped lines: one line per paragraph. Remove `_italic_` underscores.
5. Map curly quotes to straight quotes, dashes to `-`, accented letters to plain ones (é → e); 0 other
   characters needed removing. The large set has 76 distinct characters, the medium 64.

## Splits: whole chapters, no shared passages

Splits are made from whole chapters (whole stories for Holmes), never from the middle of one, and the end of
each book is held out:

- **Medium:** Alice chapters 1–3 train, chapter 4 validation, chapter 5 test.
- **Large:** Pride and Prejudice chapters 1–49 and Holmes stories 1–10 train; chapters 50–55 and story 11
  validation; chapters 56–61 and story 12 test.

After splitting, any validation or test paragraph that repeats a training paragraph, or shares a run of 12
words with one, is removed (and the test part is also checked against validation). Removed: 7 validation and
9 test paragraphs in the large set (short repeated lines of dialogue); none in the medium set. A test in
`tests/test_lessons.py` checks that no prepared validation or test line also appears in training.

The MLP builds its vocabulary from the training part only, and windows never cross from one part into
another. The MLP-versus-bigram comparison uses the same parts and the same targets for both models.

## Measured on this laptop (2,000 updates, 2 CPU threads, Qwen 4B loaded)

From `evals/mlp/measure.py` (each row a fresh process; results in `evals/mlp/results/`):

| Text | Window / embedding / hidden / batch | Training time | Peak memory | Validation loss: MLP start → end; bigram (add-1) |
|---|---|---|---|---|
| Tiny (cat) | 3 / 8 / 64 / 32 | 0.87 s | 194 MB | 2.91 → 1.24; 1.81 |
| Medium | 3 / 8 / 64 / 32 | 1.41 s | 211 MB | 4.16 → 2.28; 2.41 |
| Medium | 5 / 12 / 128 / 64 | 2.14 s | 228 MB | 4.21 → 2.11; 2.41 |
| Large | 3 / 8 / 64 / 32 | 1.59 s | 291 MB | 4.43 → 2.31; 2.37 |
| Large | 5 / 12 / 128 / 64 | 2.63 s | 322 MB | 4.37 → 2.18; 2.37 |
| Large | 8 / 16 / 256 / 128 | 5.31 s | 376 MB | 4.39 → 2.09; 2.37 |
| Large, 20,000 updates | 8 / 16 / 256 / 128 | 24.0 s | 377 MB | 4.39 → 1.55; 2.37 |

Every setting fits easily (at most 377 MB, against about 3.8 GB free with the 4B loaded), so the full large
corpus is used rather than a cut-down version. The first attempt at this measurement exposed a slow step:
building the training windows copied the whole text for every example (quadratic time), which on the large
text did not finish in ten minutes. It now takes 0.19 s for the 991,720 training characters.

The loss curves while training are measured on at most 20,000 examples per part: a fixed sample, the same for
every run on the same text. The comparison with the bigram always uses every example.

## Commands

```
.venv\Scripts\python -m nextword.datasets download    # fetch the three books into D:\LocalAI\datasets\gutenberg\raw, check SHA-256
.venv\Scripts\python -m nextword.datasets prepare     # write prepared\<id>\{train,val,test}.txt and manifest.json
.venv\Scripts\python -m nextword.datasets list
.venv\Scripts\python -m evals.mlp.measure             # repeat the timing and memory table (about 1 minute)
```
