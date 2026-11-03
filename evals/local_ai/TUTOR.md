# Beginner tutor evaluation (2026-11-01)

The tutor is the local model (Qwen3-4B-Instruct-2507 Q4_K_M through Colibri, temperature 0) answering inside
the Beginner lessons. The app decides the lesson order, computes every result, keeps progress and grades the
checks; the tutor only rewords. Runner: `run_tutor_eval.py`. Case sets are frozen (`FROZEN.md`).

Three kinds of review, kept apart:

- **Automatic checks**: narrow pattern checks (required phrase present, forbidden phrase absent, word and
  sentence limits, every number from the facts, no later lesson's term, never certifying understanding).
  Passing them doesn't make an answer correct or clear.
- **AI review**: my reading of every answer against the case's `expected` text and the facts sent.
- **Human clarity review**: yours. Blank until you fill it in.

## Round 1: first run (prompt `ccb9d00d97a8`, 17:49, development set `tutor_cases.json`, 20 cases × 3 repeats)

Written and frozen before the tutor had answered anything. Repeats were identical at temperature 0.

| | Result |
|---|---|
| Automatic checks | 42/60 case runs passed (14 of 20 cases) |
| Refused, so never answered | T08 and T20 (lesson 12): `conversation_full`, the prompt alone was over the context. T14 (lesson 13): `unknown_corpus`, the "another example" for the tutor needed the medium dataset, which the test store didn't have |
| AI review, 17 answered | 16 correct on the point asked; 1 wrong (T19 listed pairs that aren't in "banana"); a wording problem in 6 answers: "the learner will meet … in a later lesson", third person, and twice promising lessons that don't exist (T16, T17) |
| Automatic false alarms | T05 (correct, said "small" not "smaller"), T11 (correct, 75 words against a 70-word case limit) |

## What changed (found with round 1, so `tutor_cases.json` became a development set at 17:51)

1. **Late lessons no longer overflow the context.** Only the two most recent terms keep their definitions
   (earlier ones are listed by name), and the setup text is dropped once the result is shown. A test checks
   every lesson step leaves room for the first answer plus two follow-ups.
2. **A missing dataset no longer crashes the tutor**; it says the other example isn't available. The lesson
   says how to prepare the dataset.
3. **Prompt wording**: talk to the learner as "you"; never say what later lessons cover; mention only
   characters and pairs that appear in the facts.

A second set, `tutor_fresh_cases.json` (12 cases), was written and frozen **before** these changes ran.

## Round 2: fixed tutor (prompt `e8124029442d`, 17:53–17:54)

| | Fresh set (12 cases × 3 repeats) | Development set (20 cases × 1) |
|---|---|---|
| Automatic checks | 33/36 (all failures: F10 didn't say "saved/recorded") | 16/20 |
| Refused | none | none (T08, T14, T20 now answered) |
| AI review: correct | 7 (F03 F04 F05 F06 F07 F08 F12) | 15 |
| AI review: correct, minor issue | 3: F01 adds an unsupported claim ("might jump over good solutions"); F10 omits that the numbers are saved moments; F11 ends with a stray "This lesson doesn't show that." | 3: T04 stray closing line; T11 filler ("No math words."); T20 omits the weight values |
| AI review: wrong | 2: **F02** contradicts itself ("not quite right … so, yes, it's better at new text"); **F09** asked before predicting, named an answer, and the wrong one ("the trained network has the bigger loss") | 2: **T12** calls the random draw 0.2380 a "probability"; **T19** lists banana's pairs with one missing, which would mislead the count |
| Human clarity review | | |

Timing: first words in 0.3–0.8 s, answers in 0.5–2.6 s.

## What changed after round 2 (a product decision, not prompt tuning)

F09 showed that a prompt rule doesn't stop the 4B giving away, or getting wrong, the answer to a prediction.
So **the app now keeps the tutor off until the result is shown** (the backend refuses the `question` and
`predict` steps with `tutor_after_prediction`; the page explains why and points to "What should I look at?"
and "Explain more simply"). The tutor is also off for the check. This was not measured again on a new set:
with the tutor unavailable before the result, F09, T18 and T19 can no longer happen by construction, and the
other answers are unchanged. No prompt change was made from the fresh set.

## Known weaknesses (not fixed)

- About 1 answer in 6 still contains a real error on the development set, and 2 of 12 on the fresh set. The
  written lesson text, the engine's fact lines next to every answer, and the app-graded checks are the
  reference; the tutor is labelled "Experimental AI explanation".
- Answers often repeat the engine's fact lines rather than explain them.
- Contradictions (F02) and mislabelled numbers (T12) are not caught by any automatic check.

## Human clarity review: to fill in

For each answer in `results/tutor_fresh_cases-4b-fixed-20261101-175354.json`: was it clear to you as a
beginner (yes / partly / no), and what was unclear?

| Case | Clear? | What was unclear |
|---|---|---|
| F01 | | |
| F02 | | |
| F03 | | |
| F04 | | |
| F05 | | |
| F06 | | |
| F07 | | |
| F08 | | |
| F10 | | |
| F11 | | |
| F12 | | |
