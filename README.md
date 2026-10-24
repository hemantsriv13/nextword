# NextWord

A local writing autocomplete. Its prediction engines are built one at a time, from counting
characters up to a small transformer, so each step can be understood and measured.

## Setup (Windows, Git Bash or PowerShell)

Requires Python 3.12 (`py -3.12`). The engine and the Lab backend need no Python packages.

```
py -3.12 -m venv .venv
.venv\Scripts\python -m nextword "The rain" --seed 1
```

## NextWord Lab (the learning interface)

Needs Node 22+ once, to build the interface:

```
npm --prefix web install
npm --prefix web run build
.venv\Scripts\python -m nextword.lab --open
```

Opens **http://127.0.0.1:8765**. See [docs/LAB.md](docs/LAB.md) for the feature map, what is your
real engine versus a simulation, and a 30-minute guided first session.

## Current capabilities (implemented)

- Character-bigram engine (`nextword/bigram.py`): predicts the next character from the current one only.
- Command line: `python -m nextword "<text>" [--length N] [--seed S] [--data PATH]`.
- Same seed + same data + same prompt = same suggestion.
- Input whose last character never appeared in training is refused with a clear message (exit code 1).
- The Lab: a local web app with your engine behind a small API (generation traces, held-out
  evaluation, continued training, timings) and labelled browser simulations for neural networks,
  attention, decoding and retrieval.
- Tests: `.venv\Scripts\python -m unittest` and `npm --prefix web test`.

## Limitations

- **The training text (`data/sample.txt`, ~1,200 characters, original) is far too small for useful
  suggestions.** It exists only as a smoke test.
- A bigram model sees one character of context, so output is word-shaped noise, not language.
- Counts are rebuilt (and cached in the Lab server's memory); there is no saving/loading of a model yet.
- Neural and transformer engines are not built yet; the Lab simulates them in the browser and says so.
- Not production software.

See [ROADMAP.md](ROADMAP.md), [LEARNING_LOG.md](LEARNING_LOG.md), [GLOSSARY.md](GLOSSARY.md),
[EXPERIMENTS.md](EXPERIMENTS.md), [docs/LAB.md](docs/LAB.md).
