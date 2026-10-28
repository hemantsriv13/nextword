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
