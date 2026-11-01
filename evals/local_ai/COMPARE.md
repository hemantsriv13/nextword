# Explanation model comparison: Qwen3-4B vs Qwen3.5-9B (2026-11-01)

Both models ran through the same Colibri v2.1.0, on the same laptop, with the same prompt (`dacabff5fab1`),
the same backend-built facts, temperature 0 and the same limits (2,048-token context, the same answer
lengths). One model was loaded at a time.

| | Qwen3-4B-Instruct-2507 Q4_K_M | Qwen3.5-9B Q4_K_M |
|---|---|---|
| File | 2.50 GB, `D:\LocalAI\models\qwen3-4b-instruct-2507` | 5.68 GB, `D:\LocalAI\models\qwen3.5-9b` |
| License | Apache-2.0 | Apache-2.0 |
| Placement (Colibri's log) | all 36 layers and the output layer on the GPU (fast "chain" path) | 4.0 GB of weights on the GPU, the rest on the CPU; "the chain stays off" (slower mixed path) |
| Thinking mode | none | switched off with `--no-think` (verified: no reasoning block) |

Three kinds of judgement, reported separately:
- **Automatic checks**: narrow (numbers, phrases, known mistakes, trace claims). They miss errors and raise false alarms.
- **AI review**: Claude, the AI assistant that ran the comparison, read every answer in every turn against the facts.
  It is not independent and not a human review.
- **Human review**: the project owner's. **None recorded.**

## Accuracy

| Set (cases) | Automatic checks: 4B | Automatic checks: 9B | AI review: 4B | AI review: 9B | Human review |
|---|---|---|---|---|---|
| **Comparison set** (16; frozen before either model saw it) | 13 pass | 13 pass | **13 correct**, 1 wrong (C11), 2 minor (C02, C14) | **12 correct**, 2 wrong (C07, C13), 2 minor (C10, C15) | – |
| Round-2 fresh set (16; frozen earlier, already seen with the 4B) | 12 pass | 13 pass | **13 correct**, 3 wrong (F05 minor, F12 minor, F15) | **9 correct**, 5 wrong (F07, F12, F13, F15 refused, F16), 2 minor (F02, F14) | – |
| Development cases (19; used to design the prompt with the 4B, so they favour it) | 19 pass | 16 pass | 17 correct (T2 misquote, H4 first answer) | 18 correct (H4 contradicts itself) | – |

The 4B on the comparison set ran 3 repeats: every answer was identical across repeats except one wording of
C08's follow-up (both correct). The 9B ran once per case (about 45 s per conversation turn), so its run-to-run
variation was not measured.

Notable mistakes:
- 9B, C07: "Yes, your first probabilities would change … with the prompt 'pi', it would read the row for 'p'." The
  last character of "pi" is "i"; nothing changes. The 4B answered this one correctly.
- 9B, F07 and F13: "In this run, it picked the space character because it had the highest probability." The engine's
  trace shows ',' and 's' were picked, and the random draw decides, not the highest probability.
- 9B, C13 and F16 (both "more simply"): "followed by a six times total" (it was 4 of 6).
- 4B, C11: "picks the most likely next character" (it sampled; 'p' was not the most likely).
- Both: H4/C07-type questions ("would a different prompt change it?") produced self-contradicting answers in the 9B twice.

## Speed (medians, ranges in brackets)

| | 4B | 9B |
|---|---|---|
| First words, new question | 0.58 s (0.52–0.96) | 24.3 s (22.3–28.4) |
| Total, new question | 3.44 s (2.84–3.98) | 44.8 s (37.9–51.4) |
| First words, follow-up | 0.72 s (0.06–0.82) | 28.3 s (1.2–39.6) |
| Total, follow-up | 2.73 s (1.42–4.04) | 38.4 s (15.6–58.0) |
| Server start to ready | 5.1 s | 11.0 s (weights loaded in 5.3 s) |

(Comparison set; the other two sets give the same picture.) The 9B's follow-ups were about as slow as new
questions: unlike the 4B, it did not reuse the conversation's already-read beginning in this setup.

## Memory (sampled once a second during the evaluation runs)

| | 4B | 9B |
|---|---|---|
| Colibri process, peak resident RAM | 4.02 GB | 6.03 GB |
| Colibri process, peak reserved (private) memory | 7.51 GB | 10.34 GB |
| GPU memory in use, peak (of 6,144 MiB; about 1,530 MiB is Windows and apps) | 4,599 MiB | 5,777 MiB |
| Lowest free system RAM | 3.76 GB | **0.98 GB** |

## Follow-up capacity

The backend stops a conversation before it would overflow the 2,048-token context.

| | 4B | 9B |
|---|---|---|
| Real prompt size, 3 lesson steps (each model's own tokenizer) | 931–1,055 tokens | 966–1,090 tokens |
| Answers before "start a new conversation" (3 steps) | 4, 3, 4 | 3, 3, 3 |
| Typical answer length | 571 characters | 645 characters |
| Refused in the evaluations | 0 | 1 (F15's "Show a small example" after a long first answer) |

## Decision

**The 4B stays the default explanation model.** On the questions neither model had seen, the 9B was not more
accurate (12 vs 13 correct on the comparison set, 9 vs 13 on the round-2 set), it was about 12 times slower to
finish an answer, it fits fewer follow-ups, and it leaves under 1 GB of RAM free. The 9B stays installed and
selectable (`local-ai\start-colibri.cmd 9b`) for anyone who wants to compare. These results are from one laptop,
one prompt and small case sets; they don't show that model size causes or doesn't cause these errors.
