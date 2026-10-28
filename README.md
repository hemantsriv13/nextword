# NextWord

A local writing autocomplete. Its prediction engines are built one at a time, from counting
characters up to a small transformer, so each step can be understood and measured.

## What this project teaches

NextWord Lab is an interactive learning environment for understanding
how language models work—from counting character pairs to exploring
neural training, attention, generation, and evaluation.

It combines a real, simple language model with educational simulations.
It is not a complete modern LLM.

### What is real, and what is simulated?

- **Python character-bigram engine:** Learns character-pair counts from
  text and generates characters using the resulting probabilities.
  This is a real count-based language model, not a neural network.
- **Neural training simulations:** Compute small examples of embeddings,
  predictions, loss, gradients, and parameter updates.
- **Attention and decoding simulations:** Demonstrate simplified
  mechanisms used in transformer language models.
- **Evaluation, retrieval, and serving tools:** Explore how models are
  tested and used within applications. Retrieval supplies information
  to an input; it does not itself train the model.

The simulations perform actual calculations, but their results are not
outputs from a trained Python neural or transformer engine. Each
workspace should identify its source clearly.

### What I can learn

By working through the explanations and experiments, I can learn to:

- Explain how text becomes tokens and numerical inputs.
- Trace how a model produces next-token probabilities.
- Distinguish count-based learning from neural-network training.
- Explain how loss, gradients, and an optimizer update parameters.
- Follow how attention combines information from different positions.
- Understand how decoding turns probabilities into generated text.
- Compare models fairly and recognize data leakage and overfitting.
- Distinguish training, inference, and retrieval.
- Trace a request from the interface to the model and back.

### How to use this project for learning

For each concept:

1. Read the plain-language explanation.
2. Predict what will happen before running the experiment.
3. Change one variable.
4. Run the experiment and inspect the result.
5. Follow the calculation or relevant code.
6. Explain why the result matched or differed from my prediction.
7. Try a fresh example without assistance.

Quizzes are checkpoints, not proof of mastery. Opening a page or
completing a walkthrough does not establish independent understanding.
Keep assisted practice, solution review, and independent explanations
distinct.

### What comes next

The next implementation milestones are:

1. Build and train a small neural language model in Python.
2. Implement a tiny causal transformer.
3. Compare the engines using consistent data splits and evaluation.
4. Connect the trained engines to the existing learning interface.

Update this section as those engines become available. Simulations
prepare me for implementation; they do not replace building, debugging,
and evaluating the models myself.

### Scope and limitations

This project can build foundational working knowledge of language-model
mechanics. It does not cover every kind of AI or reproduce the scale,
training data, instruction tuning, safety work, and infrastructure of a
production LLM.

Small examples demonstrate mechanisms. They do not establish real-world
model quality, factual reliability, or production readiness.

**My progress check:** Can I predict what a change will do, make the
change, and explain the result—including when my prediction was wrong?

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
