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

## Done (2026-11-01, late): explanation panel layout (not committed, not pushed)
- `components/lab/explanation.tsx`: one panel for the Bigram and MLP journeys, the lessons and the workspaces.
  Tabs "Understand this step" / "Ask your tutor" (both stay mounted), one scroll area, composer pinned at the bottom,
  sticky and window-high but never past the experiment's end (so the page height never changes), Expand overlay,
  full-screen view below the page's wide breakpoint, Escape, focus return and focus kept inside overlays.
- `components/lab/ask-ai.tsx`: transcript + composer split; follows streamed text only at the end, "Jump to latest";
  experimental notice once; engine numbers collapsible; short "Explain this step" + "Explain in more detail";
  backend `room` report, so a full conversation is announced before asking; new conversations keep earlier answers.
- Verified live (4B): page height constant through long answers and follow-ups; scrolling up kept during streaming;
  expand and phone view keep the stream and position; quiz lock in every view; Info popovers unclipped.
- Tests: Python 103, vitest 244 (new `panel.test.tsx`), build OK. Spacing: 0 serious.

## Done (2026-11-01, evening): Beginner lessons, tutor, dataset levels, recorded training (not committed, not pushed)
- Backup before this: `..\local-ai\backups\nextword-uncommitted-20261101-170132.tgz` (+ .patch, .files).
- Beginner lessons (`web/src/workspaces/Learn.tsx`, `content/lessons.json`, `lib/lessons.ts`, `lib/lesson-checks.ts`,
  `nextword/lab/lessons.py`): 13 lessons, 6 steps each, 5 help controls, saved place and predictions, statuses
  skipped / check skipped / with help / reviewed with solution / on your own. Docs: docs/LESSONS.md.
- Tutor (`nextword/lab/assist_lesson.py`): off until the result is shown and during checks; evaluation in
  `evals/local_ai/TUTOR.md` (fresh set: 7 correct, 3 minor, 2 wrong; human review blank).
- Datasets (`nextword/datasets.py`, `data/teaching/tiny.json`; medium/large prepared in D:\LocalAI\datasets from 3
  Gutenberg books, chapter splits, overlap removed): docs/DATASETS.md. Measured: largest setting 24 s / 377 MB.
- Recorded training: weights saved at chosen steps + batches; replayed and recomputation-checked
  (`components/lab/replay.tsx`, MLP page "Replay the recorded training", lessons 12–13).
- Fixed on the way: quadratic window building (`mlp.examples`), curve losses chunked and sampled.
- Tests: Python 102, vitest 237, build OK. Spacing measured (0 serious); comprehension check flags the lesson step's
  7 actions (the 5 requested help controls are kept visible on purpose).

## Done (2026-11-01): larger model comparison and the Neural MLP journey (not committed, not pushed)
- Backups of the uncommitted work before this: `..\local-ai\backups\nextword-uncommitted-20261101-132848.tgz` (+ .patch).
- Models now on D: (`D:\LocalAI\models`); 4B moved (checksum verified, loaded from D:, C: copy deleted); Qwen3.5-9B
  downloaded (5.68 GB, SHA-256 matches). `start-colibri.cmd 4b|9b` runs one model at a time; NextWord uses "auto".
- Comparison (`evals/local_ai/COMPARE.md`, frozen `compare_cases.json`): 9B not more accurate, ~12× slower, near RAM
  limit → 4B stays default. Human review: none yet.
- MLP: `nextword/mlp.py` (PyTorch 2.15 CPU, `requirements-mlp.txt`), `nextword/lab/mlp_service.py` (train/stop/reset,
  saved runs in data/lab/mlp, inspect, generate, bigram comparison), `assist_mlp.py` (MLP facts for Ask local AI),
  `web/src/workspaces/MlpJourney.tsx` (8 stages, quizzes mlp.examples/loss/update, completion card). Docs: docs/MLP.md.
- Tests: Python 79, vitest 226, build OK. Chrome: training, stages, AI explanation of an update, stale after retrain,
  quiz lock incl. minimised, 390 px (no sideways scroll on any stage), light theme. Spacing measured (0 serious).
- Known: lesson pages stay dense (comprehension check); kit controls are 32–36 px (not 44 px touch targets).

## Done (2026-11-01): Ask local AI, accuracy round 2 (not committed, not pushed)
- Correction recorded in `evals/local_ai/RESULTS.md`: round 1 held-out is 8 correct / 5 wrong (AI review).
- Fixes in `assist.py`: engine-worded `calculations`, `trace`, `concepts` (zero-rule left out for missing rows),
  `trainingTextName`, backend-written invented example, rules; page shows the engine lines ("Your model") above
  the "Experimental AI explanation". Prompt 918–1,042 tokens (was 645–749); ~2–3 answers per conversation.
- Eval: `dev_cases.json` (old 19, now development/regression), `fresh_cases.json` (16, frozen in FROZEN.md before
  fixes), new detectors in `run_eval.py` (+ `tests/test_eval_checks.py`). Report: `evals/local_ai/ROUND2.md`.
- Result (AI review, 3 repeats): all 5 original mistakes gone; fresh 9/16 → 13/16 correct; first words +0.2 s.
- Tests: Python 64, vitest 220, build OK. Human review of answers: not done yet.

## Done (2026-11-01): Ask local AI (not committed, not pushed)
- Colibri v2.1.0 + Qwen3-4B-Instruct-2507 Q4_K_M in `../local-ai/` (outside the repo); `start-colibri.cmd`
  serves it on 127.0.0.1:8000 with CUDA, 2,048-token context. Details and measurements: `docs/LOCAL_AI.md`.
- Backend `nextword/lab/assist.py` + streaming route `/api/assist/explain` and `/api/assist/status` in
  `server.py`: recomputes the run from its id (fingerprint checked), step facts only, server-side
  conversations bound to run + selection (4 answers), one request at a time, timeouts, loopback-only URL.
- Frontend `components/lab/ask-ai.tsx` + `lib/assist.ts`, in the journey's explanation panel; checkpoint
  API gained `active` (true while a question is shown or minimised) and the AI is off then.
- Tests: Python 52 (22 new, fake Colibri server incl. cancellation), vitest 220 (8 new); build OK.
  Chrome: stream, follow-up, stale marking, Stop (Colibri counted 1 cancellation), Try again, checkpoint
  lock incl. minimised, Colibri stopped, 390 px, light theme. Better Design: review rules, comprehension
  (one finding kept: 4 actions after an answer, all required), spacing measured at 390/1440/1728.
- Evaluation `evals/local_ai/`: 19 cases; held-out 13/13 automatic, 4 factual errors found on reading.
- Known: the after-answer state has 4 actions; buttons are the kit's 36 px (not 44 px touch targets).
- Housekeeping: every "not committed, not pushed" section below is now on `main` (up to 681213a).

## Done (2026-10-28): term help and expandable code (not committed, not pushed)
- `TermHelp` / `MathHelp` reuse the Info-icon popover (`HelpPopover` in info-tip.tsx). New glossary
  entries: exp, ln, NLL, nats; BPE, perplexity and cross-entropy rewritten. Examples bound to the
  displayed run in Evaluation, Neural, Decoding, Data studio and Adapt. Perplexity shows ∞ (not
  "undefined") when the API returns null for an infinite mean NLL.
- Placed on Evaluation, Neural, Decoding, Data studio, Attention, Adapt, Serving, Playground.
- Tests: glossary examples checked against −ln p, exp and `learnBpe`; term-help behaviour; Evaluation
  examples for finite and infinite runs. 212 tests, build OK, browser-checked (both themes).
- Known: Evaluation and Neural scroll sideways at 390 px (Export button, saved-runs and shapes tables);
  not caused by term help.

## Done (2026-10-28): Info icons replace hover help (not committed, not pushed)
- [x] `components/lab/info-tip.tsx`: Info icon + anchored Base UI popover (500 ms hover, click pins, Esc,
  outside click, one at a time, More details). Buttons with a help id get one beside them automatically
  (`components/ui/button.tsx`; `data-help-info="off"` opts out); fields, switches, groups and table
  columns place one by hand. Removed whole-control hover hints, Help-mode markers and the old popover.
- [x] Tests 191 OK; build OK; Chrome: hover/pin/Esc/outside/flip/scroll, 390 px via an iframe.

## Done (2026-10-27): learning checkpoints (not committed, not pushed)
- [x] `web/src/lib/checkpoints.ts` (11 checkpoints: 5 journey, 6 walkthrough), `components/lab/checkpoint.tsx`
  (shared dialog, revisit/return, hints, solution, success), store `checkpoints` + practice mode, Notebook panel.
- [x] Tests: vitest 188 OK; build OK; Chrome: wrong answer, pass, focus, retake, light and dark.

## Done (2026-10-27): contextual help and Toolkit Guide (not committed, not pushed)
- [x] Inventory `web/src/content/help.ts` (controls, workspace directory, questions, three tours); help layer
  `components/lab/help.tsx` (hints, Learn this control popover, Help mode markers, goTo/revealers);
  tours `components/lab/toolkit-tour.tsx`; Toolkit Guide page `workspaces/Toolkit.tsx`; data-help-id on
  controls across all pages; search finds questions and controls.
- [x] Tests: vitest 158 OK (help inventory coverage, hint/popover/markers, Toolkit and tours); build OK.
- [x] Browser checks in Chrome (one desktop width): hover hint, Help mode markers, disabled markers,
  popover placement, tour across pages with resume after reload, Show me where into a tab, light theme.
  Fixed: tour card covered results under wide targets; reveal raced lazy pages; help link was cancelled.
- [ ] Not verified: touch devices, phone layout of the tour card and popovers, reduced motion.

## Done (2026-10-27): explanation panel (not committed, not pushed)
- [x] `ExplanationPanel` and `TryThis` in `web/src/components/lab/explanation.tsx`; tokens `--companion`,
  `--companion-edge`, `--companion-callout`, `--companion-shadow` (both themes). Used by the journey and by
  `Workspace`'s explanation column. Sticky only while it fits the viewport (no nested scrolling).
- [x] Checks: vitest 130 OK; build OK; inspector 0 FAIL (journey, counts, neural); Chrome dark and light.

## Done (2026-10-27): visual redesign (not committed, not pushed)
1. [x] Tokens in `web/src/index.css`: type scale (page, lesson, section, prose, label), `.measure`,
   `--canvas`/`--canvas-edge` surface, `--action` accent. `Panel` variants: section (default, no box),
   canvas (one per workspace), inset. Workspace header and explanation aside on the scale.
2. [x] Bigram journey rebuilt as the reference lesson (Guided lesson / Explore all, six stages,
   process diagram with the feedback loop, explanation column with three levels, Replay without draws).
3. [x] Shared guide: compact by default (`prefs.flowOpen`, new, false), vertical process rail; walkthrough
   card and Try it section on the scale; canvases assigned in every workspace; Glossary entry canvas.
4. [x] Copy: seed guidance, "replay of what followed what", Unicode code points vs visible emoji.
5. [x] Checks: Python 30 OK; vitest 129 OK; build OK; Taste lint 0 FAIL (UI source); inspector 0 FAIL on
   13 pages at 1440/768/390; Chrome checks at one width in dark and light, keyboard on the journey.

## Done (2026-10-27): teaching experience (not committed, not pushed)
1. [x] Shared teaching layer `web/src/components/lab/teach.tsx`: flow diagram (`Guide`, `FlowNode`),
   walkthrough with three levels, `Panel teach={{ calc, code }}` and `TeachSpot`, tab-aware steps,
   in-guide fallback when a step's panel isn't rendered yet.
2. [x] `/api/journey` (one snapshot: text, table, run) and `data/example.txt`; `Bigram journey` page.
3. [x] Guides for Playground, Counts, Data, Neural, Attention, Decoding, Evaluation, Adaptation, Serving.
   Synchronization fixes: comparison mode stored with its results; Counts engine draw tied to its
   text/context/seed; continued-training results marked stale; Serving states what is timed and how.
4. [x] Tests: Python 30 OK; vitest 125 OK; build OK; Taste lint 0/0 and inspector 0 FAIL on 11 pages at
   1440/768/390; browser checks in Chrome (keyboard, journey tour, tabs, fallback) at one window width.

## Done (2026-10-27): fixes from the review of 75a0941 (branch fix/review-75a0941, not pushed)
1. [x] Issue 1, evaluation snapshots: `web/src/lib/evaluation.ts` (`useSnapshotRun`, `describeConfig`,
   `changedSettings`, `rerunVerdict`). Results, saves, reruns and the guided cycle use the frozen
   config; changed controls show a stale note; superseded requests are ignored.
2. [x] Issue 2, corpus uploads: random IDs, exclusive-create writes, `.json` metadata, legacy files.
3. [x] Issue 3, playground highlight: `web/src/lib/trace.ts` separates the selected step's context
   (fill), its choice (outline) and the next prediction's context (dashed underline); stale traces
   are hidden and the highlight falls back to the current prompt.
4. [x] Issue 4, sweep on validation only: frozen sweep settings, split validated first, separate
   "Run the final test check" action, labels bound to the sweep.
5. [x] Issue 5, code points: revealed text from trace tokens (Playground, Serving stream),
   `buildDataset` windows by code point, Data studio counts and preview, Counts guard.
6. [x] Checks: Python 27 OK; vitest 82 OK; `npm run build` OK; browser checks on the real backend at
   one desktop width (1677 px; window resizing had no effect, so 390/1440/1728 were not measured).

## Done (2026-11-02): Home, Learning paths, How NextWord Works (local, not committed)
1. [x] "Neural MLP not yet active": stale copy written before the MLP existed (Playground engine select,
   Neural page adapter card and note, old Home engine table, help text, ROADMAP). Not a flag, build or
   dependency problem. `/api/engines` now reports the MLP from PyTorch's real status, with the reason and
   install command when unavailable; the tiny transformer is reported as planned.
2. [x] Home rewritten: next step and "Continue learning" from saved records only, status counts (no
   percentages or times), learning paths, tools directory, system status (lists models, never generates),
   links to How NextWord Works, the glossary and `/docs/README.md`.
3. [x] Learning paths (`web/src/content/paths.ts`, `web/src/lib/paths.ts`): 12 foundation steps over the
   13 lessons, prerequisite guidance without locks, optional session plan, deeper paths.
4. [x] How NextWord Works: sections A to H plus roadmap, on-page contents, "More detail" disclosures,
   text alternatives for diagrams, live defaults and limits from the backend.
5. [x] `/docs/<name>` serves an allow-list of project documents as plain text.
6. [x] Lesson deep link `#/learn?lesson=<id>` (sets your place, then clears the link).
7. [x] Checks: Python 106 OK; vitest 262 OK; build OK; spacing measured at 390/1440/1728 (Home 85,
   moderate only, then fixed; Paths and How 100); every link on the three pages resolves; no AI
   generation requests on opening them; Colibri stopped during checks.

