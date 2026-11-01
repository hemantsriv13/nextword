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
- **Python character MLP (PyTorch, CPU):** A real, small neural network
  (embeddings, a tanh hidden layer, softmax) trained here from random
  weights, with saved runs and recorded training that can be replayed.
- **Neural training simulations:** Compute small examples of embeddings,
  predictions, loss, gradients, and parameter updates.
- **Attention and decoding simulations:** Demonstrate simplified
  mechanisms used in transformer language models.
- **Evaluation, retrieval, and serving tools:** Explore how models are
  tested and used within applications. Retrieval supplies information
  to an input; it does not itself train the model.

The simulations perform actual calculations, but their results are not
outputs from a trained Python transformer engine. Each workspace
identifies its source: your bigram engine, your MLP, a simulation, a
worked example, a recorded-training replay, or the local AI.

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

1. ~~Build and train a small neural language model in Python.~~ Done: the character MLP.
2. Implement a tiny causal transformer.
3. Compare the engines using consistent data splits and evaluation (the MLP and bigram already are).
4. Connect each new engine to the learning interface.

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

Requires Python 3.12 (`py -3.12`). The bigram engine and the Lab backend need no Python packages. The
Neural MLP journey needs PyTorch (CPU build, about 670 MB installed):
`.venv\Scripts\python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch`
(see `requirements-mlp.txt`).

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

### Beginner lessons

Start here if the words are new: thirteen short lessons from characters, pairs and counts to embeddings,
loss and weight updates. Each asks a question, lets you predict, shows what the real engine computed, explains
why, and only then names the idea; a check with a different example closes it. See [docs/LESSONS.md](docs/LESSONS.md).

### Neural MLP journey

A real character-level neural network (embeddings, a tanh hidden layer, softmax), trained here with
PyTorch on the CPU from random weights, with a guided eight-stage lesson that follows one example
through it and compares it with the bigram on the same split. See [docs/MLP.md](docs/MLP.md).
It can train on three levels of text: tiny teaching texts (in the repository), a medium practice passage and
a 1.2-million-character public-domain corpus, downloaded once outside the repository with
`.venv\Scripts\python -m nextword.datasets download` and `... prepare`. See [docs/DATASETS.md](docs/DATASETS.md).

### The explanation panel

Beside each journey step and lesson: **Understand this step** (the written explanation, works offline) and
**Ask your tutor** (the optional local AI). The panel stays beside the experiment and scrolls inside itself,
so long answers never lengthen the page; switching tabs, **Expand** and the full-screen view on narrow
screens keep the conversation and your place. See [docs/LAB.md](docs/LAB.md).

### Optional: Ask local AI

The Bigram and MLP journeys and the Beginner lessons can ask a pretrained model running on this computer
(Qwen3-4B-Instruct through [Colibri](https://github.com/JustVugg/colibri), run separately) to explain the
step on screen. The model is downloaded, not trained here; it only words explanations, and every number
comes from your engines. Answers are experimental and can be wrong: on 16 fresh Bigram questions 3 still
had an error after the accuracy fixes; on 12 fresh tutor questions 2 were wrong. A larger model (Qwen3.5-9B)
was compared and was not more accurate. The written lessons stay the reference, and the AI is off during
quizzes. Setup, request flow, measurements and evaluation: [docs/LOCAL_AI.md](docs/LOCAL_AI.md).

## Current capabilities (implemented)

- Character-bigram engine (`nextword/bigram.py`): predicts the next character from the current one only.
- Character MLP (`nextword/mlp.py`, PyTorch): learns to predict the next character from a window of previous ones.
- Command line: `python -m nextword "<text>" [--length N] [--seed S] [--data PATH]`.
- Same seed + same data + same prompt = same suggestion.
- Input whose last character never appeared in training is refused with a clear message (exit code 1).
- The Lab: a local web app with your engine behind a small API (generation traces, held-out
  evaluation, continued training, timings) and labelled browser simulations for neural networks,
  attention, decoding and retrieval.
- Beginner lessons: 13 lessons, each with a prediction, the real result, the term after the idea, and an
  app-graded check; saved place; skipped / with help / on your own statuses.
- Training texts at three levels (tiny in the repository; medium and large prepared from public-domain
  books outside it), with chapter-level splits and overlap removed; measured timings in `docs/DATASETS.md`.
- Recorded training: saved weight snapshots and batches, replayed and recomputation-checked.
- Ask local AI (optional): a local pretrained model explains journey steps and tutors lessons from facts the
  backend recomputes; evaluated in `evals/local_ai/`.
- Tests: `.venv\Scripts\python -m unittest` and `npm --prefix web test`.

## Limitations

- **The training text (`data/sample.txt`, ~1,200 characters, original) is far too small for useful
  suggestions.** It exists only as a smoke test.
- A bigram model sees one character of context, so output is word-shaped noise, not language.
- Bigram counts are rebuilt (and cached in the Lab server's memory), not saved. MLP runs are saved under
  `data/lab/` (ignored by Git); a run still training when the server stops is lost.
- A transformer engine is not built yet; the Lab simulates attention in the browser and says so. The MLP is
  small and trains on small texts, so it overfits easily (the page shows when).
- Ask local AI's explanations come from a pretrained model this project did not train, and can be
  wrong (about 1 tutor answer in 6 on the evaluation sets; the human clarity review is not done). It needs
  Colibri running separately; the 4B used up to 4.6 GB of GPU memory on a 6 GB laptop GPU.
- The model's 2,048-token context fits only a few answers per conversation (one detailed answer on the MLP
  journey); the panel says when a conversation is full.
- The full-screen view on phones is sized to the visible screen, but has not been tested with a real phone
  keyboard.
- The medium and large training texts must be downloaded and prepared once (`python -m nextword.datasets`).
- Not production software.

See [ROADMAP.md](ROADMAP.md), [LEARNING_LOG.md](LEARNING_LOG.md), [GLOSSARY.md](GLOSSARY.md),
[EXPERIMENTS.md](EXPERIMENTS.md), [docs/LAB.md](docs/LAB.md).
