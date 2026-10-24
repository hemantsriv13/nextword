# NextWord Lab: build progress

Working notes for building the Lab, so the work can resume if a session ends. Newest first.

## Status (2026-10-25): all phases done
1. [x] Backend API + tests (`python -m unittest`: 21 passing)
2. [x] Shell, tokens, routing, persistence, glossary (75 terms) and journey content
3. [x] Playground, Data and tokens, Counts (real engine)
4. [x] Simulations: neural (worker), attention, decoding, tokenizers, splits, retrieval (+ tests: 58 passing)
5. [x] Evaluation bench, adaptation and retrieval, serving
6. [x] Review loop: taste lint (0 FAIL) and inspector (0 FAIL on every screen, 1 defended WARN on
   Glossary), Better Design review rules, comprehension checks, measured spacing; docs and guided session

## Decisions
- **Stack:** Python standard-library HTTP server (`nextword/lab/`) wrapping the real engine;
  React + TypeScript + Vite in `web/`, built into `web/dist/` and served by the Python server.
- **Design:** Better Design "Linear" kit components (shadcn, Base UI) and Iconoir icons; colours, type
  and shell from the taste skill's app style `framed-sheet` (seed 585068089), because the Linear kit is
  dark-only with an indigo accent and the Lab needs light and dark themes. Type: IBM Plex Sans and
  IBM Plex Mono, bundled locally.
- **Kit changes for light mode and the rules:** no resting card shadow, sentence-case sidebar group
  labels, light input fields, no blurred overlays, Iconoir instead of runtime Iconify in `select`,
  44px hit area on checkboxes.
- **Sources of behaviour:** "Your model" = Python engine via the API; "Interactive simulation" =
  browser code in `web/src/sim/`; "Worked example" = fixed, stated values.
- **Bigram refactor:** `complete()` uses `generate_steps()`/`sample_next()`; outputs byte-identical
  (`tests/bigram_baseline.json`). `__main__.py` untouched, so the `--show-probs` exercise is still yours.

## Known gaps
- No Python neural or transformer engine (Stages 2 and 3); the Neural page has an adapter contract.
- Comprehension check flags the workspaces as dense (130–170 words). Accepted for a working tool the
  user asked to be deep; copy was trimmed where it didn't carry meaning.

## In progress (2026-10-25): fixes from the review of 75a0941 (branch fix/review-75a0941, not pushed)
1. [x] Issue 2, corpus uploads: unique random IDs (`c<hex>`), exclusive-create writes, name in a
   `.json` beside each file, legacy files keep working. 5 new Python tests (26 passing).
2. [~] Issues 1 and 4, Evaluation: `web/src/lib/evaluation.ts` (`useSnapshotRun`, `sameConfig`,
   `describeConfig`, `splitProblem`, `rerunVerdict`). Results, saves, sweep and reruns are bound to the
   settings that produced them; stale notes; sweep always on validation; rerun checks the corpus
   fingerprint. Component tests in `Evaluation.test.tsx`: 6 of 7 pass. **Next:** the training-text
   test can't operate the Base UI select with fireEvent; try `@testing-library/user-event`.
3. [ ] Issue 3, Playground context highlight (selected-step context vs next-prediction context;
   stale traces; tests with a mocked trace).
4. [ ] Issue 5, code points: Playground `slice` → tokens from the trace; `neural.ts buildDataset`
   windows by code point; Data studio counts/preview; emoji and combining-mark tests (Python + TS).
5. [ ] Then: full Python and frontend suites, `npm run build`, browser checks, docs, final report
   (what changed per issue, test results, limitations, a browser checklist for the user).
