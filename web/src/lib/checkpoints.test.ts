import { describe, expect, it } from "vitest"
import type { Journey } from "@/lib/api"
import example from "@/test/journey-example.json"
import stops from "@/test/journey-stops.json"
import { CHECKPOINT_BY_ID, CHECKPOINTS, isCorrect, parseNumber, questionFor, recordOutcome, shouldAsk, statusOf, type JourneyContext, type Question } from "./checkpoints"
import { engineRow, pairOccurrences } from "./journey"

// Real engine responses: every expected answer must agree with the engine's own numbers.
const EX = example as unknown as Journey
const ctx = (data: Journey = EX, extra: Partial<JourneyContext> = {}): JourneyContext => ({
  run: { config: { corpus: "example", prompt: "a cat sat on th", length: 10, seed: 2 }, result: data },
  pair: { a: "h", b: "a" }, sel: 0, ...extra,
})
const build = (id: string, c: JourneyContext | Record<string, never> = ctx(), v = 0) => questionFor(CHECKPOINT_BY_ID.get(id)!, c, v)!

describe("journey questions use the run's actual values", () => {
  it("count: the answer is the engine's count, and the pair is not the one already on screen", () => {
    const q = build("journey.count")
    const [, a, b] = q.prompt.match(/‘(.+?)’ immediately followed by ‘(.+?)’/)!
    const tok = (s: string) => (s === "␣" ? " " : s === "↵" ? "\n" : s)
    expect(q.answer).toBe(EX.table.rows[tok(a)][tok(b)])
    expect(pairOccurrences(EX.text, tok(a), tok(b))).toHaveLength(q.answer as number)
    expect(`${tok(a)}${tok(b)}`).not.toBe("ha")
  })

  it("context: the correct choice is the prompt's last character, among distinct plausible options", () => {
    const q = build("journey.context")
    expect(q.choices!.find((c) => c.id === q.answer)!.label).toContain("‘h’")
    expect(new Set(q.choices!.map((c) => c.label)).size).toBe(q.choices!.length)
  })

  it("probability: count ÷ row total from the engine's table, rounded as instructed", () => {
    const q = build("journey.probs")
    const [, a, b] = q.prompt.match(/After ‘(.+?)’.*next character is ‘(.+?)’/)!
    const { total, items } = engineRow(EX.table, a)
    const p = items.find((i) => i.token === b)!.count / total
    expect(q.answer).toBeCloseTo(p, 2)
    expect(q.rounding).toMatch(/2 places/)
    expect(total).toBeGreaterThan(0)
  })

  it("sampling: asks why a less likely character was drawn, using that step's draw", () => {
    const q = build("journey.sample")
    expect(q.prompt).toMatch(/^At step 1, after ‘h’, ‘e’ had p = 0\.80 and ‘a’ had p = 0\.20/)
    expect(q.solution.working).toContain(EX.generation.steps[0].draw.toFixed(3))
    expect(build("journey.sample", ctx(), 1).prompt).toMatch(/same training text, prompt, length and seed/)
  })

  it("repetition: the next context is the character the step just chose", () => {
    const q = build("journey.repeat", ctx(EX, { sel: 2 }))
    const s = EX.generation.steps[2]
    expect(q.prompt).toContain("Step 3 read")
    expect(q.choices!.find((c) => c.id === q.answer)!.label).toBe(`‘${s.token === " " ? "␣" : s.token}’`)
  })

  it("questions are frozen: the same snapshot gives the same question; a new variant gives another example", () => {
    const one = build("journey.probs")
    expect(build("journey.probs")).toEqual(one)
    const other = build("journey.probs", ctx(), one.variant + 1)
    expect(other.instance).not.toBe(one.instance)
  })

  it("never builds an invalid question: no steps, a stopped run, empty rows", () => {
    const noSteps = { ...EX, generation: { ...EX.generation, steps: [] } } as Journey
    expect(questionFor(CHECKPOINT_BY_ID.get("journey.repeat")!, ctx(noSteps), 0)).toBeNull()
    expect(questionFor(CHECKPOINT_BY_ID.get("journey.sample")!, ctx(noSteps), 0)?.prompt).toMatch(/same training text/) // falls back to the seed question
    const st = stops as unknown as Journey
    const q = questionFor(CHECKPOINT_BY_ID.get("journey.probs")!, ctx(st), 0)
    if (q) expect(engineRow(st.table, q.prompt.match(/After ‘(.+?)’/)![1]).total).toBeGreaterThan(0)
  })
})

describe("worked-example questions say so", () => {
  for (const id of ["neural.loss", "neural.update", "attention.mask", "decoding.order", "evaluation.validation", "adapt.lexical"]) {
    it(id, () => {
      const q = build(id, {})
      expect(q.source).toBe("Worked example")
      expect(q.basis).toMatch(/simulation|sandbox|bench|worked example/i)
    })
  }
  it("numbers are right", () => {
    expect(build("neural.loss", {}).answer).toBeCloseTo(1.39, 2)
    expect(build("neural.update", {}).answer).toBeCloseTo(0.275, 3)
  })
})

describe("answers are checked fairly", () => {
  it("accepts equivalent forms within the tolerance", () => {
    expect(parseNumber(".2")).toBe(0.2)
    expect(parseNumber("0,2")).toBe(0.2)
    expect(parseNumber("1/5")).toBe(0.2)
    expect(parseNumber("20%")).toBe(0.2)
    expect(parseNumber("1/0")).toBeNull()
    expect(parseNumber("two")).toBeNull()
    const q = { kind: "number", answer: 0.2, tolerance: 0.006 } as Question
    for (const ok of ["0.2", "0.20", ".2", "1/5", "20%", "0.204"]) expect(isCorrect(q, ok), ok).toBe(true)
    for (const bad of ["0.25", "0.8", "", "x"]) expect(isCorrect(q, bad), bad).toBe(false)
  })

  it("hints guide without giving the solution away", () => {
    for (const def of CHECKPOINTS) {
      const q = questionFor(def, def.id.startsWith("journey.") ? ctx() : {}, 0)!
      for (const h of q.hints) {
        expect(h).not.toContain(q.solution.working)
        if (q.kind === "number") expect(h).not.toMatch(new RegExp(`(=|≈)\\s*${String(q.answer).replace(".", "\\.")}\\b`))
      }
      if (q.kind === "choice") expect(q.choices!.some((c) => c.id === q.answer)).toBe(true)
    }
  })
})

describe("progress is recorded honestly", () => {
  const T = (n: number) => `2026-10-27T10:00:0${n}.000Z`
  it("a skip is not a pass, and a visit is only a visit", () => {
    let r = recordOutcome(undefined, 1, "", "visited", T(0))
    expect(statusOf(r, 1)).toBe("Section visited")
    r = recordOutcome(r, 1, "q", "skipped", T(1))
    expect(statusOf(r, 1)).toBe("Checkpoint skipped")
    expect(shouldAsk(r, 1, false)).toBe(true)
  })
  it("hints and solutions are kept apart from an unassisted pass", () => {
    expect(statusOf(recordOutcome(undefined, 1, "q", "passed-with-hints", T(1)), 1)).toBe("Passed with hints")
    let r = recordOutcome(undefined, 1, "q", "solution-viewed", T(1))
    r = recordOutcome(r, 1, "q", "matched-after-solution", T(2))
    expect(statusOf(r, 1)).toBe("Reviewed with solution")
    expect(shouldAsk(r, 1, false)).toBe(true)
    r = recordOutcome(r, 1, "q2", "passed", T(3))
    expect(statusOf(r, 1)).toBe("Passed")
    expect(r.attempts.map((a) => a.outcome)).toEqual(["solution-viewed", "matched-after-solution", "passed"])
  })
  it("passed checkpoints don't block Next, unless practising; old versions are labelled", () => {
    const r = recordOutcome(undefined, 1, "q", "passed", T(1))
    expect(shouldAsk(r, 1, false)).toBe(false)
    expect(shouldAsk(r, 1, true)).toBe(true)
    expect(statusOf(r, 2)).toBe("Answered an earlier version")
    expect(shouldAsk(r, 2, false)).toBe(true)
  })
})
