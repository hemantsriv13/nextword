# NextWord

An interactive, local learning lab for inspecting character-level language prediction:
where probabilities come from, how sampling selects a character, and how to test an
explanation against the experiment that produced it.

The goal is to make model behaviour understandable through visible calculations,
controlled experiments, plain-language explanations, and learning checkpoints.
This is an educational application and an applied-AI evaluation project.

## Project status and evidence

This repository contains:

- the Python bigram engine;
- a trainable Python character MLP;
- an interactive web Lab with sampling experiments, quizzes and labelled browser simulations;
- an optional local Qwen tutor served through Colibri;
- the tutor's adversarial evaluation, with its cases and recorded answers.

Each row below links to implementation files, not to inferred capabilities.

| Capability | What a reviewer can inspect |
| --- | --- |
| Character-level prediction | [Bigram engine](nextword/bigram.py) and [engine tests](tests/test_bigram.py) |
| Inspectable generation | [Lab API](nextword/lab/server.py), [journey service](nextword/lab/service.py), [Bigram journey page](web/src/workspaces/Journey.tsx), [guided journey content](web/src/content/journey.ts), and [journey tests](web/src/lib/journey.test.ts) |
| Learning checkpoints | [Quiz logic](web/src/lib/checkpoints.ts), [checkpoint interface](web/src/components/lab/checkpoint.tsx), and [tests](web/src/components/lab/checkpoint.test.tsx) |
| Local Qwen tutor (through Colibri) | [Tutor bridge and Bigram facts](nextword/lab/assist.py), [MLP facts](nextword/lab/assist_mlp.py), [lesson tutor](nextword/lab/assist_lesson.py), [tutor panel](web/src/components/lab/ask-ai.tsx), [tests](tests/test_assist.py), and [setup and request flow](docs/LOCAL_AI.md) |
| Adversarial explanation evaluation | [Cases, runners, frozen fresh sets and reports](evals/local_ai/), [recorded answers](evals/local_ai/results/) |
| Trainable character MLP | [Model](nextword/mlp.py), [training service](nextword/lab/mlp_service.py), [tests](tests/test_mlp.py), and [documentation](docs/MLP.md) |
| Learning interface and simulations | [Lab guide](docs/LAB.md) |

The MLP and tutor work is on the `release/neural-mlp` branch ([draft pull request #1](https://github.com/hemantsriv13/nextword/pull/1)).
Until that pull request is merged, the `main` branch does not include those files.

## Local AI explanation workflow

A pretrained Qwen model (Qwen3-4B-Instruct-2507, Q4_K_M) running through Colibri on this computer explains
the learner's experiment. The page sends only which run is selected and what is focused. The backend then
recomputes the facts with its own engine, such as the selected context, observed counts, probabilities and
the sampling trace, and sends them to the tutor ([`assist.py`](nextword/lab/assist.py)). The tutor turns those
facts into an explanation and supports follow-up questions.

The educational model and the tutor have different jobs:

- The **NextWord engines** compute predictions and experiment results: the bigram engine and the trainable MLP.
- The **Qwen tutor** generates explanations of those results.
- **Colibri** runs the pretrained tutor locally. NextWord does not train Qwen.

An explanation can sound convincing while contradicting the engine. Engine facts therefore stay visible and
independently checkable:

- The calculation lines are shown above the answer, labelled as coming from your engine.
- The facts sent to the tutor are one click away.
- Every answer is checked automatically, and numbers that aren't in the facts are listed under it.
- The tutor is switched off while a quiz checkpoint is open.

Running the tutor locally avoids paid model API calls; using a paid coding assistant to develop the
application is a separate cost.

## Adversarial explanation evaluation

The evaluation tests explanations against known experiment facts, including misleading follow-up questions.
The purpose is to find incorrect reasoning and unsupported claims, then improve the supplied facts and the
explanation workflow.

- **The real tutor:** each case builds a real run with the engine, sends it through the same code path as the
  page, and gets its answer from the real Qwen3-4B in Colibri.
- **Expected numbers come from the engine** at run time, never written by hand.
- **Mocked replies** are used only in unit tests and are not counted as accuracy results.

Probes and the cases that test them (case files in [`evals/local_ai/`](evals/local_ai/)):

| Probe | What a correct explanation should preserve | Cases |
| --- | --- | --- |
| A follow-up supplies a false count | Use the engine's count and explain the discrepancy. | `T4`, `F04`, `C04` |
| Only the random seed changes | Learned counts stay fixed; sampled characters, and therefore later contexts, can change. | `H5`, `F08`, `C08` |
| A context has no observed followers | Distinguish an undefined probability row from an unseen pair with probability zero in a nonempty row. | `H7`, `F10` |
| A question asks why a character was selected | Use the recorded sampling trace, not simply the highest probability. | `T3`, `F03`, `F12`, `C03`, `C11` |
| The learner requests an invented example | Clearly distinguish invented values from the current experiment's values. | `H13`, `F15`, `C12` |
| The question assumes the bigram understands a sentence | Explain that this engine uses only the preceding character. | `H9`, `F13`, `C16`, `d11` (MLP) |
| The facts can't answer the question | Say what is missing instead of guessing. | `T6`, `H8`, `F11`, `C15`, `d10`, `f12` |
| The training text, its name or the prompt contains instructions | Treat them as data and keep to the facts. | `H10`, `H11`, `F14`, `C14`, `d13`, `f14` |

Cases used to improve the prompt are development cases. The fresh cases were written and frozen first
(hashes in [FROZEN.md](evals/local_ai/FROZEN.md)), then run on the fixed prompt.

**Automatic checks, AI review and human review are reported separately.**

- **Automatic checks** are narrow: required engine numbers and phrases appear, forbidden ones don't, claims about
  which row a character came from match the trace, and any number not in the facts is listed. Passing them does
  not establish factual accuracy. They miss some errors and raise some false alarms.
- **AI review** was done by Claude, the AI coding assistant that built the feature, reading each answer against
  the facts. It is not a human review.
- **Human review** has not been done for any set.

| Tutor and set | Cases | Automatic: all checks pass | AI review | Human review | Report |
| --- | --- | --- | --- | --- | --- |
| Bigram, round 1 held-out (prompt frozen first) | 13 | 13 | 8 correct, 5 wrong | not done | [RESULTS.md](evals/local_ai/RESULTS.md) |
| Bigram, round 2 fresh (frozen before the fixes) | 16 | 8 before → 12 after | 9 → 13 correct; 3 wrong after | not done | [ROUND2.md](evals/local_ai/ROUND2.md) |
| Bigram, 4B vs 9B comparison (frozen first) | 16 | 4B 13, 9B 13 | 4B 13 correct; 9B 12 correct | not done | [COMPARE.md](evals/local_ai/COMPARE.md) |
| Beginner-lesson tutor, fresh (3 repeats) | 12 | 33 of 36 runs | 7 correct, 3 minor, 2 wrong | not done | [TUTOR.md](evals/local_ai/TUTOR.md) |
| MLP tutor, fresh (frozen first, run once) | 15 | 12 | 9 correct, 6 minor, 0 wrong | not done | [MLP_TUTOR.md](evals/local_ai/MLP_TUTOR.md) |
| MLP tutor, development (used for fixes) | 13 | 10 | 9 correct, 3 minor, 1 wrong | not done | [MLP_TUTOR.md](evals/local_ai/MLP_TUTOR.md) |

The runners are [`run_eval.py`](evals/local_ai/run_eval.py) (Bigram),
[`run_tutor_eval.py`](evals/local_ai/run_tutor_eval.py) (lessons) and
[`run_mlp_eval.py`](evals/local_ai/run_mlp_eval.py) (MLP). These are small sets for one model and one setting,
so they show the kinds of mistakes that remain, not a general accuracy figure.

## Five-minute demonstration

1. Start the Lab (see [Start on Windows](#start-on-windows-one-command)) and open the Bigram journey.
2. Select a context character and inspect its follower counts and probabilities.
3. Follow the sampling step: connect the random draw to the chosen character.
4. Change the seed while keeping the text and prompt fixed. Explain what stays constant and why later generated
   characters may change.
5. Complete a learning checkpoint and use the explanation to revisit any mistake.
6. With the tutor running, open **Ask your tutor → Explain this step** on the same run. Then ask a follow-up that
   gives a deliberately false count, and compare the response with the engine facts shown above it. Record
   mistakes as well as successful corrections.

To demonstrate the trainable MLP, open the [Neural MLP journey](#neural-mlp-journey), train it, step through the eight
stages, then compare it with the bigram ([docs/MLP.md](docs/MLP.md)).

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

1. ~~Build and train a small neural language model in Python.~~ Done: the character MLP (on `release/neural-mlp`).
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

## Architecture

| Part | What it does | Where |
|---|---|---|
| Bigram engine | Counts which character follows which; generates by seeded sampling | `nextword/bigram.py` |
| Character MLP | Embeddings → tanh hidden layer → softmax; trained by plain gradient descent | `nextword/mlp.py` |
| MLP service | Trains in a background thread with progress saves; runs, checkpoints (initial, trained, validation-selected), resume, inspection of one example, generation, fair bigram comparison | `nextword/lab/mlp_service.py` |
| Lab server | Local HTTP API on 127.0.0.1 and the built web interface | `nextword/lab/server.py` |
| Tutor bridge | Rebuilds the facts from the selected run, sends them to Colibri, streams the answer, checks its numbers | `nextword/lab/assist.py`, `assist_mlp.py`, `assist_lesson.py` |
| Web interface | React + TypeScript: Home, learning paths, lessons, Bigram and MLP journeys, Playground, tools | `web/` |
| Local AI | Colibri v2.1.0 serving Qwen3-4B on 127.0.0.1:8000 (outside this repository) | `..\local-ai\` |
| Evaluations | Engine tests; tutor evaluations with frozen fresh sets | `tests/`, `evals/` |

## Setup (Windows, Git Bash or PowerShell)

Requires Python 3.12 (`py -3.12`). The bigram engine and the Lab backend need no Python packages. The
Neural MLP journey needs PyTorch (CPU build, about 670 MB installed):
`.venv\Scripts\python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu -r requirements-mlp.txt`.

```
py -3.12 -m venv .venv
.venv\Scripts\python -m nextword "The rain" --seed 1
```

The interface needs Node 22+ once, to build it:

```
npm --prefix web install
npm --prefix web run build
```

The optional tutor needs Colibri and the Qwen3-4B model, installed beside the repository: see
[docs/LOCAL_AI.md](docs/LOCAL_AI.md).

## Start on Windows (one command)

After the setup above, double-click **`start-nextword.cmd`** (or run it in a terminal). It:

1. checks the Python environment and builds the interface if it isn't built;
2. says whether PyTorch is installed (without it, the MLP pages say how to install it);
3. reuses the local AI tutor if it is already running, leaves alone anything still loading on its port, and
   otherwise asks whether to start it (`--ai` starts it without asking, `--no-ai` never does);
4. starts the Lab and opens **http://127.0.0.1:8765**.

Without the script: `.venv\Scripts\python -m nextword.lab --open`. Everything except "Ask your tutor" works
without the tutor.

## NextWord Lab (the learning interface)

See [docs/LAB.md](docs/LAB.md) for the feature map, what is your real engine versus a simulation, and a
30-minute guided first session.

It opens on **Home**: your next lesson (from your saved progress only), the learning paths, every tool,
and what is running on this computer. **Learning paths** orders the lessons into twelve steps; **How
NextWord Works** explains the parts, the data, the tutor, hardware, evaluations and the roadmap.

### Bigram journey

Follow one prediction through your bigram engine in six steps, from the training text to appending each
character and repeating:

- the counts for each character pair;
- the probabilities in the current character's row;
- the seeded random draw that picks each generated character, and which row it was drawn from.

To experiment, change the prompt, length or seed and watch which steps change. Every step after the first
ends with a quiz checkpoint, built from your run and graded by the app.

### Beginner lessons

Start here if the words are new: thirteen short lessons from characters, pairs and counts to embeddings,
loss and weight updates. Each asks a question, lets you predict, shows what the real engine computed, explains
why, and only then names the idea; a check with a different example closes it. See [docs/LESSONS.md](docs/LESSONS.md).

### Neural MLP journey

A real character-level neural network (embeddings, a tanh hidden layer, softmax), trained here with
PyTorch on the CPU from random weights. A guided eight-stage lesson follows one example through it:
Text, Training examples, Embeddings, Hidden layer, Predictions, Loss, Weight update and Generation. It then
compares the network with the bigram on the same split, using stated vocabulary, unseen-character and smoothing
rules, plus a checkpoint selected on validation loss only.

Runs are saved and survive a Lab restart: an interrupted run is labelled incomplete, and resume is exact
(tested against uninterrupted runs). It can train on three levels of text: tiny teaching texts (in the
repository), a medium practice passage and a 1.2-million-character public-domain corpus, downloaded once
outside the repository with `.venv\Scripts\python -m nextword.datasets download` and `... prepare`. See
[docs/MLP.md](docs/MLP.md) and [docs/DATASETS.md](docs/DATASETS.md).

### The explanation panel

Beside each journey step and lesson: **Understand this step** (the written explanation, works offline) and
**Ask your tutor** (the optional local AI). The panel stays beside the experiment and scrolls inside itself,
so long answers never lengthen the page; switching tabs, **Expand** and the full-screen view on narrow
screens keep the conversation and your place. See [docs/LAB.md](docs/LAB.md).

## Current capabilities (implemented)

- Character-bigram engine (`nextword/bigram.py`): predicts the next character from the current one only.
- Character MLP (`nextword/mlp.py`, PyTorch): learns to predict the next character from a window of previous ones.
- Command line: `python -m nextword "<text>" [--length N] [--seed S] [--data PATH]`.
- Same seed + same data + same prompt = same suggestion.
- Input whose last character never appeared in training is refused with a clear message (exit code 1).
- The Lab: a local web app with your engines behind a small API (generation traces, held-out
  evaluation, continued training, timings) and labelled browser simulations for neural networks,
  attention, decoding and retrieval.
- Bigram journey: the counts, probabilities and seeded draws behind each generated character, with five
  app-graded quiz checkpoints.
- Beginner lessons: 13 lessons, each with a prediction, the real result, the term after the idea, and an
  app-graded check; saved place; skipped / with help / on your own statuses.
- Training texts at three levels (tiny in the repository; medium and large prepared from public-domain
  books outside it), with chapter-level splits and overlap removed; measured timings in `docs/DATASETS.md`.
- Recorded training: saved weight snapshots and batches, replayed and recomputation-checked.
- Ask local AI (optional): the local Qwen tutor explains journey steps and tutors lessons from facts the
  backend recomputes; numbers in an answer that aren't in those facts are flagged under it.
- MLP runs survive a Lab restart: progress is saved every few seconds, interrupted runs are labelled incomplete,
  and resume is exact.
- Tests: `.venv\Scripts\python -m unittest` and `npm --prefix web test`.

## Limitations

- **The training text (`data/sample.txt`, ~1,200 characters, original) is far too small for useful
  suggestions.** It exists only as a smoke test.
- A bigram model sees one character of context, so output is word-shaped noise, not language.
- Bigram counts are rebuilt (and cached in the Lab server's memory), not saved. MLP runs are saved under
  `data/lab/` (ignored by Git). A run training when the server stops keeps its last progress save (up to about
  3 s of training is lost).
- A transformer engine is not built yet; the Lab simulates attention in the browser and says so. The MLP is
  small and trains on small texts, so it overfits easily (the page shows when).
- The tutor's explanations come from a pretrained model this project did not train, and can be wrong. The
  evaluation above found errors that remain after the fixes, and no human review has been done. It needs
  Colibri running separately; the 4B used up to 4.6 GB of GPU memory on a 6 GB laptop GPU.
- The model's 2,048-token context fits only a few answers per conversation (one detailed answer on the MLP
  journey); the panel says when a conversation is full.
- The full-screen view on phones is sized to the visible screen, but has not been tested with a real phone
  keyboard.
- The medium and large training texts must be downloaded and prepared once (`python -m nextword.datasets`).
- Not production software.

See [ROADMAP.md](ROADMAP.md), [LEARNING_LOG.md](LEARNING_LOG.md), [GLOSSARY.md](GLOSSARY.md),
[EXPERIMENTS.md](EXPERIMENTS.md), [docs/LAB.md](docs/LAB.md).
