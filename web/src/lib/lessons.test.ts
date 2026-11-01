import { describe, expect, it } from "vitest"
import { GLOSSARY } from "@/content/glossary"
import { CHECKPOINT_BY_ID, isCorrect, recordOutcome, type CheckpointRecord } from "./checkpoints"
import { LESSON_CHECKS } from "./lesson-checks"
import { checkpointId, LESSONS, lessonStatus, resumePlace, STEPS, termsSoFar } from "./lessons"

// The texts each counting lesson uses itself (nextword/lab/lessons.py EXAMPLES): checks must use others.
const LESSON_TEXTS = ["the cat", "hello", "a b c", "banana", "abab", "the cat ate the hat", "mississippi", "ab ac ab", "the cat sat on the mat"]
const at = "2026-11-01T10:00:00Z"
const rec = (...outcomes: Parameters<typeof recordOutcome>[3][]): CheckpointRecord =>
  outcomes.reduce<CheckpointRecord | undefined>((r, o) => recordOutcome(r, 1, "q", o, at), undefined)!

describe("lesson content", () => {
  it("has a check and a real glossary term for every lesson, in order", () => {
    expect(LESSONS.map((l) => l.id)).toEqual(["characters", "pairs", "counts", "probability", "sampling", "generation", "learning", "embeddings", "hidden", "softmax", "loss", "update", "training"])
    const ids = new Set(GLOSSARY.map((g) => g.id))
    for (const l of LESSONS) {
      expect(CHECKPOINT_BY_ID.get(checkpointId(l.id)), l.id).toBeDefined()
      expect(ids.has(l.term.glossary), l.term.glossary).toBe(true)
    }
    expect(STEPS.map((s) => s.id)).toEqual(["question", "predict", "result", "why", "term", "check"])
  })

  it("introduces each term only after its idea", () => {
    expect(termsSoFar("characters", 0)).toEqual([])
    expect(termsSoFar("characters", 4).map((t) => t.name)).toEqual(["character (token)"])
    expect(termsSoFar("pairs", 3).map((t) => t.name)).toEqual(["character (token)"]) // pairs' own term comes at step 5
    expect(termsSoFar("training", 0)).toHaveLength(12)
  })
})

describe("lesson checks", () => {
  it("every variant has a valid answer, a different example and no answer in its hints", () => {
    for (const def of LESSON_CHECKS) {
      for (let v = 0; v < 3; v++) {
        const qn = def.build({}, v)!
        expect(qn.source).toBe("Worked example")
        if (qn.kind === "choice") expect(qn.choices!.map((c) => c.id)).toContain(qn.answer)
        else expect(Number.isFinite(qn.answer as number)).toBe(true)
        for (const t of LESSON_TEXTS) expect(qn.prompt, def.id).not.toContain(`“${t}”`)
        expect(qn.hints).toHaveLength(3)
      }
    }
  })

  it("computes its answers from the stated values", () => {
    const counts = CHECKPOINT_BY_ID.get("learn.counts")!.build({}, 0)!
    expect(counts.prompt).toContain("to too tot")
    expect(counts.answer).toBe(3)
    const p = CHECKPOINT_BY_ID.get("learn.probability")!.build({}, 0)!
    expect(isCorrect(p, "3/4")).toBe(true)
    expect(isCorrect(p, "0.75")).toBe(true)
    expect(isCorrect(p, "1/4")).toBe(false)
    const u = CHECKPOINT_BY_ID.get("learn.update")!.build({}, 0)!
    expect(isCorrect(u, "0.48")).toBe(true)
    const s = CHECKPOINT_BY_ID.get("learn.sampling")!.build({}, 0)!
    expect(s.choices!.find((c) => c.id === s.answer)!.label).toBe("‘a’") // 0.81 is past u's 0.75
  })
})

describe("lesson status", () => {
  it("only the check decides completion, and help is told apart", () => {
    expect(lessonStatus(undefined, undefined)).toBe("Not started")
    expect(lessonStatus({ reached: 2, started: at }, undefined)).toBe("In progress")
    expect(lessonStatus({ reached: 0, skipped: at }, undefined)).toBe("Skipped")
    expect(lessonStatus({ reached: 5, started: at }, rec("skipped"))).toBe("Check skipped")
    expect(lessonStatus({ reached: 5, started: at }, rec("passed"))).toBe("Completed on your own")
    expect(lessonStatus({ reached: 5, started: at }, rec("passed-with-hints"))).toBe("Completed with help")
    expect(lessonStatus({ reached: 5, started: at }, rec("solution-viewed"))).toBe("Reviewed with the solution")
    // Simpler wording and the tutor are recorded on the lesson, but don't make a pass "with help".
    expect(lessonStatus({ reached: 5, started: at, helpUsed: ["simpler", "tutor"] }, rec("passed"))).toBe("Completed on your own")
  })

  it("resumes at the saved place, else the first unfinished lesson", () => {
    expect(resumePlace({ lesson: "loss", step: 3, example: 1 }, {}, {})).toEqual({ lesson: "loss", step: 3, example: 1 })
    expect(resumePlace(null, {}, { "learn.characters": rec("passed") })).toEqual({ lesson: "pairs", step: 0, example: 0 })
  })
})
