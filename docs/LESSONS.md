# Beginner lessons

The Lab's starting point for someone new to the words. It teaches how to read an experiment one idea at a
time, before the dense Bigram and MLP journeys. Open it from the sidebar: **Beginner lessons**.

## Thirteen lessons, two parts

| Part 1: Counting (bigram engine) | Part 2: Learning (a small MLP trained here) |
|---|---|
| 1 Characters · 2 Pairs · 3 Counts · 4 Probability · 5 Random selection · 6 Writing text | 7 From counting to learning · 8 Characters as numbers (embeddings) · 9 Combining the numbers (hidden layer, tanh) · 10 Scores to probabilities (softmax) · 11 Measuring mistakes (loss) · 12 Getting better (gradient, update) · 13 Many updates (training, validation) |

Every lesson has the same six steps:

1. **Question**: a plain question and a small example (a text like "the cat", or a window of a tiny text).
2. **Your prediction**: you choose an answer before seeing it. It's a guess, never graded.
3. **What happened**: the real result, computed by the app, next to your prediction.
4. **Why**: a short explanation of why it happened.
5. **The word for it**: the technical term, introduced only now, with its definition.
6. **Check**: one question with a *different* example, graded by the app.

## Help on every step

- **Go back one step.**
- **Explain more simply**: the lesson's own one- or two-sentence version (works offline).
- **Show another example**: the next of the lesson's three examples. After the result, it takes you back to
  the prediction, so you guess again for the new example.
- **What should I look at?**: says where to look, and rings that part of the result.
- **Why does this matter?**
- **More detail (optional)**, in the right-hand panel: the advanced version, and a link to the full page.
- **Words so far**: every term introduced up to this point, with its definition (the three newest shown).

## Who decides what

| Decided by the app | The local AI tutor (Qwen 4B) |
|---|---|
| Lesson order, examples, every result (`nextword/lab/lessons.py`: the bigram engine, or a real trained MLP) | Rewords the step on screen, from facts the backend builds |
| The right answer to each prediction | Is never told it before you have predicted, and is off until then |
| Definitions (`web/src/content/lessons.json`, authored, never generated) | Gets the newest definitions to use, and is told to avoid later lessons' words |
| Checks and their grading (`web/src/lib/lesson-checks.ts`) | Is off while a check is open (even minimised) and never sees checks |
| Progress and statuses | Can't mark anything as understood |

The written text works with the local AI switched off. The tutor's answers are labelled as experimental, show
the engine's own fact lines beside them, and are marked as earlier answers when you change step or example.
The evaluation of the tutor is in `evals/local_ai/TUTOR.md`.

## Progress

Saved in this browser (`localStorage`, the Lab's existing store): your place (lesson, step, example), each
lesson's furthest step, your predictions, which help you asked for, and each check's record. Statuses on the
lesson list:

- **Completed on your own**: you passed the check with no hints.
- **Completed with help**: you passed after using hints.
- **Reviewed with the solution**: you viewed the solution and haven't passed a new question since.
- **Check skipped**: you finished the lesson but skipped its check.
- **Skipped**: you skipped the lesson. **In progress** and **Not started**.

Asking for simpler wording or the tutor is recorded on the lesson but doesn't change its status; only the
check does. You can revisit or skip any lesson, and start the lessons over from the list.

## Fast training, shown honestly

The lesson networks train in under a second, far too fast to watch. So while a network trains, the backend
saves its weights at chosen steps (1, 2, 5, 10, 20, 50, 100 … and the last) and, for the updates that produce
them, the exact batch of examples used. Lessons 12 and 13 (and the MLP journey's **Replay the recorded
training**) show those saved states, labelled **Recorded training (replay)**:

- **A recorded update** is shown in five parts: weights before, the batch, the loss, the gradient, the weights
  after. The update is recomputed from the saved weights and batch and checked against the weights saved
  after it (on this laptop the largest difference is 0).
- **The training replay** is a slider over the saved moments, with the loss on training and validation text
  measured again from each saved state. Steps that weren't saved are not drawn or filled in.

## Training texts

Lessons use the tiny teaching texts by default. Lesson 13's other examples train on the medium practice
passage and the large corpus. Every MLP lesson says that its text trains only the small network, not Qwen.
Sources, licences, sizes, preprocessing and splits: `docs/DATASETS.md`.

## Limitations

- The lesson networks are tiny (2 numbers per character, 8 hidden values) so every number fits on screen;
  their behaviour is a simplified picture of large models.
- The tutor still makes mistakes on about 1 answer in 6 (see the evaluation). It is optional.
- Lessons 12 and 13 replay the recorded first update and the saved moments; they don't record every update.
- Progress lives in this browser only (export it from the Notebook).
- The human clarity review of the tutor is still to do.
