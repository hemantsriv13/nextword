# Accuracy round 2 (2026-11-01): before and after

Model unchanged: Qwen3-4B-Instruct-2507 Q4_K_M through Colibri v2.1.0, CUDA, temperature 0 (the app's setting),
3 repeats per case. Prompt before: `cced151093d2`; after: `dacabff5fab1`. The original results in `RESULTS.md`
are kept as they were, with a dated correction.

Three kinds of judgement are reported **separately** and must not be read as one:

- **Automatic checks**: required numbers and phrases present, forbidden ones absent, a few known mistakes detected,
  claims about rows compared with the engine's trace. Passing them is not the same as being correct.
- **AI review**: Claude (the AI coding assistant that made the changes) read every answer in every turn, first
  answers included, against the facts. It is a review by the author of the changes, not an independent one.
- **Human review**: by the project owner. **None recorded yet.** The owner's approval of the plan is not an
  accuracy review.

## What changed (each a hypothesis until measured)

1. **Fact selection.** The "never-seen pair → 0" statement is left out when a step is about a character with no
   row; "no row → no probabilities, not zeros" is stated instead. The text's name is labelled as a name
   (`trainingTextName`), and its content as not included.
2. **A trace** of which row each generated character was drawn from ("1. 'h' → 'a'; 2. 'a' → 'n'; …").
3. **Engine-worded calculations.** The backend writes the step's exact lines ("P(e | h) = 4 ÷ 5 = 0.8", "The draw
   0.956 is in the range for 'a', 0.8 to 1"). The model is told to use them, and the page shows them above the AI
   text as the engine's output, with "Correct, but the AI text may still misuse them."
4. **Fixed concept statements** for unseen pairs, missing rows and what a seed changes.
5. **A ready-made invented example** (different character and numbers, checked to be consistent) for "Show a small
   example", with the real run kept under a separate "In this run" heading.
6. **Instructions**: use the calculations, concepts and trace; mention only pairs and examples in the facts.
7. **Labels**: "Experimental AI explanation"; the panel says the written explanation is the reference.

Fixes 1, 2 (the "only pairs in the facts" rule) and the focus lines for missing rows were added in a second pass,
after the first pass left H7 unfixed. Both passes used only the development cases.

## The original five mistakes (development cases; used to design the fixes)

| Case | Before (3 repeats) | After (3 repeats) | AI review after | Human review |
|---|---|---|---|---|
| H5 seed | "the probabilities at each step remain the same", 3/3 | gone, 3/3 | **Fixed**: "the next step might read a different row" | – |
| H6 stopped | first answer read the wrong row; final answer "probability of 0", 3/3 | gone, 3/3 | **Fixed** in both answers: "no probabilities, not even zero" | – |
| H7 missing row | "probability of any character … is 0", 3/3 | gone after the second pass, 3/3 | **Fixed**, with awkward wording ("It doesn't say '0' — it says 'no probabilities at all.'") | – |
| H9 trace | "'an', which follows 'a', not 'h'", 3/3 | gone, 3/3 | **Fixed** | – |
| H13 example | real run labelled "made-up", 3/3 | gone, 3/3 | **Fixed**: invented 'q' example, then "In this run" | – |

Other development cases after the fixes (AI review): T2 still quotes the excerpt "he mat" as a place where "th"
occurs (the original small misquote); H4's first answer gained a false sentence ("Only 'e' has a row with
followers"). After the first pass only, H2 had a self-contradiction and T2 an invented pair ("t→a"); both were gone
after the second pass. Because these cases shaped the fixes, they measure regressions, not fresh accuracy.

## Fresh questions (frozen before any fix; see FROZEN.md)

| Case | Automatic, before | Automatic, after | AI review, before | AI review, after | Human review |
|---|---|---|---|---|---|
| F01 row 'a' | pass | pass | correct | correct | – |
| F02 pair n→a | pass | pass | **wrong**: invents "banda", "na bandana" | correct | – |
| F03 less likely | fail (phrase list too narrow) | fail (same) | correct | correct | – |
| F04 "d is two-thirds?" | pass | fail (check missed "0.6667") | correct | correct | – |
| F05 line break | pass | pass | **wrong (minor)**: "↵ appears once" | **wrong (minor)**: "÷ total rows for ↵" | – |
| F06 ï vs i | pass | pass | correct | correct | – |
| F07 'hen' vs 'pen' | fail (did not restate 0.5) | pass | correct | correct | – |
| F08 seed, third row | fail | pass | **wrong**: "No … the same set of pairs" | correct, cites the trace | – |
| F09 stopped | fail | pass | **wrong** in both answers ("its probability is 0"; wrong row) | correct | – |
| F10 missing row 'z' | fail | pass | **wrong**: "probability of any character … is 0" | correct (awkward wording) | – |
| F11 training time | pass | pass | correct | correct | – |
| F12 which row | pass | pass | **wrong** in both answers | **wrong (minor)** in the first answer: invents "ban a"; calls the draw "not … a rule" | – |
| F13 "knows a hen?" | fail (did not restate a probability) | fail (same) | correct | correct | – |
| F14 instructions in text | fail (false alarm on "A→X") | pass | correct | correct | – |
| F15 example | pass | pass | **wrong**: "Only 'a' follows 'n'" | **wrong** in the first answer: "Since 'a' has the highest probability, it is chosen" (the draw chose it) | – |
| F16 more simply | fail (simple answer omits the total) | fail (same) | correct | correct | – |
| **Total** | **8 of 16 pass** | **12 of 16 pass** | **9 correct, 7 wrong** | **13 correct, 3 wrong** | **not reviewed** |

Repeats: at temperature 0 every fresh case gave the same answer in all 3 repeats, before and after.
The automatic checks and the AI review disagree on 7 cases before and 6 after. They miss some real errors
(F02, F05, F12, F15) and flag some correct answers (F03, F04, F13, F16).

## Speed and memory

| | Before | After |
|---|---|---|
| Prompt size (measured, 3 steps) | 645–749 tokens | 918–1,042 tokens |
| First words, new question (fresh set, median) | 0.43 s | 0.65 s |
| First words, follow-up (median) | 0.56 s | 0.79 s |
| Total answer time (median, first answer) | 3.35 s | 3.77 s |
| Answers per conversation before "start a new one" | about 4 | about 2–3 (longer prompt; the length guard is cautious) |
| RAM / GPU after loading | 2.85 GB / 4,176 MiB (1,530 MiB without the model) | unchanged (same model) |
| GPU added by answering | about 200–260 MiB (first session) | about 500 MiB (one measurement after one question) |

## Optional: temperature 0.7 (reported separately; the app stays at 0)

The five original failures, 5 repeats each, after the fixes. Automatic checks flagged 2 of 25 conversations (both H6).
Reading those two found them correct: the flags were placeholders such as "'d' → anything" and "d → x", which the
arrow check mistakes for claims. The other 23 conversations were **not** read, so this probe shows only that the
automatic checks found no recurrence of the five known mistakes at temperature 0.7.

## Not tested

Whether a larger model would make fewer of these mistakes. No other model was downloaded or run, so nothing here
says the errors are caused by model size.
