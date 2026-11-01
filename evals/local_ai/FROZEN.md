# Frozen evaluation sets

| Set | File | SHA-256 | Frozen | Rule |
|---|---|---|---|---|
| Fresh (accuracy round 2) | `fresh_cases.json` | `f04d442f12a488e588991f3a6ac24aa062328411daa0d8504babe470dd3369c4` | 2026-11-01T12:05:44+05:30 | Written before any accuracy fix; never used to change prompts, facts or code. Run on the old code (sealed, not read until the fixes were final) and once on the fixed code. |
| Model comparison (4B vs 9B) | `compare_cases.json` | `8178eccf919c32f0b6c5dd913e1e03304972addc8b39db5207c4468ee38f935b` | 2026-11-01T13:52:25+05:30 | Written before either model answered any of it; never used to change prompts, facts or code. |
| Beginner tutor, first set (now development) | `tutor_cases.json` | `877c02237be77da0cee22a0f45edde6f22492bef1eb2aa7b0c25b616da792592` | 2026-11-01T17:46+05:30 | Written before the tutor had answered anything. Its first run (17:49) found two crashes and a wording problem, which were then fixed using it, so from 17:51 it is a development / regression set, not a fresh one. |
| Beginner tutor, fresh | `tutor_fresh_cases.json` | `18b58714ace3e17f80ccc5682a76d109b3d5679fde0818b17930bac6c32745ac` | 2026-11-01T17:51+05:30 | Written after the first run and before any fix was made or run. Never used to change the tutor prompt, facts or code. |
| Development / regression | `dev_cases.json` (formerly `cases.json`) | – | – | The original 6 tune + 13 held-out cases. Their failures were used to design the fixes, so they now measure regressions, not fresh accuracy. |

Prompt in use when the fresh set was frozen: `cced151093d2`. Prompt in use for the model comparison: `dacabff5fab1`.
