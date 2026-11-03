import { describe, expect, it } from "vitest"
import { WORKSPACE_BY_ROUTE } from "@/content/journey"
import { FOUNDATION, PATHS } from "@/content/paths"
import { recordOutcome, type CheckpointRecord } from "./checkpoints"
import { LESSONS, type LessonRecord } from "./lessons"
import { missingBefore, recommend, sessionPlan, stepState, tally, type Saved } from "./paths"

const at = "2026-11-02T10:00:00Z"
// Each event a minute after the last, as in real use (a pass counts only if it comes after a viewed solution).
const check = (...o: Parameters<typeof recordOutcome>[3][]): CheckpointRecord =>
  o.reduce<CheckpointRecord | undefined>((r, x, i) => recordOutcome(r, 1, "q", x, `2026-11-02T10:0${i}:00Z`), undefined)!
const started = (reached = 2): LessonRecord => ({ started: at, reached })
const saved = (records: Record<string, LessonRecord> = {}, checks: Record<string, CheckpointRecord> = {}, place: Saved["place"] = null): Saved => ({ records, checks, place })
const passedAll = (ids: string[], outcome: "passed" | "passed-with-hints" = "passed") =>
  saved(Object.fromEntries(ids.map((id) => [id, started(5)])), Object.fromEntries(ids.map((id) => [`learn.${id}`, check(outcome)])))

describe("the curriculum is built from what exists", () => {
  it("puts every beginner lesson in exactly one foundation step, in order", () => {
    const listed = FOUNDATION.flatMap((s) => s.lessons)
    expect(listed).toEqual(LESSONS.map((l) => l.id))
    expect(FOUNDATION).toHaveLength(12)
  })
  it("links only to pages that exist", () => {
    for (const s of FOUNDATION) for (const t of s.tools) expect(WORKSPACE_BY_ROUTE.has(t.route), `${s.id} → ${t.route}`).toBe(true)
    for (const p of PATHS) for (const r of p.routes) expect(WORKSPACE_BY_ROUTE.has(r), r).toBe(true)
    for (const s of FOUNDATION) for (const b of s.builds) expect(FOUNDATION.some((x) => x.id === b)).toBe(true)
  })
})

describe("the next step comes from saved progress only", () => {
  it("a new learner starts lesson 1", () => {
    const r = recommend(saved())
    expect(r).toMatchObject({ kind: "start", lesson: "characters", href: "#/learn?lesson=characters" })
  })
  it("a returning learner continues the lesson they were in, at their step", () => {
    const r = recommend(saved({ characters: started(3) }, {}, { lesson: "characters", step: 3, example: 0 }))
    expect(r.kind).toBe("continue")
    expect(r.why).toContain("“Why”")
  })
  it("after a finished lesson, the next one not started; skipped lessons are not pushed", () => {
    const s = saved({ characters: started(5), pairs: { reached: 0, skipped: at } }, { "learn.characters": check("passed") })
    expect(recommend(s)).toMatchObject({ kind: "next", lesson: "counts" })
  })
  it("when every lesson is done or skipped, it suggests rechecking one whose solution was viewed", () => {
    const ids = LESSONS.map((l) => l.id)
    const s = passedAll(ids)
    s.checks["learn.loss"] = check("solution-viewed")
    expect(recommend(s)).toMatchObject({ kind: "recheck", lesson: "loss" })
    s.checks["learn.loss"] = check("solution-viewed", "passed")
    expect(recommend(s).kind).toBe("beyond")
  })
})

describe("statuses keep skipped, assisted and independent apart", () => {
  it("counts lessons by status, with no percentages", () => {
    const s = saved({ characters: started(5), pairs: started(5), counts: { reached: 0, skipped: at }, probability: started(1) },
      { "learn.characters": check("passed"), "learn.pairs": check("passed-with-hints") })
    const t = tally(s)
    expect(t["Completed on your own"]).toBe(1)
    expect(t["Completed with help"]).toBe(1)
    expect(t["Skipped"]).toBe(1)
    expect(t["In progress"]).toBe(1)
    expect(t["Not started"]).toBe(LESSONS.length - 4)
  })
  it("a step is done only when every one of its lessons' checks was passed", () => {
    const step = FOUNDATION.find((s) => s.id === "pairs")!
    expect(stepState(step, passedAll(["pairs"]))).toBe("in progress")
    expect(stepState(step, passedAll(["pairs", "counts"], "passed-with-hints"))).toBe("done")
    const s = passedAll(["pairs"]); s.records.counts = started(5); s.checks["learn.counts"] = check("skipped")
    expect(stepState(step, s)).toBe("needs a recheck")
    expect(stepState(FOUNDATION.find((x) => x.id === "ai")!, s)).toBe("no lesson yet")
  })
  it("says which earlier steps are not done, without locking anything", () => {
    const loss = FOUNDATION.find((s) => s.id === "loss")!
    expect(missingBefore(loss, saved()).map((s) => s.id)).toEqual(["text", "pairs", "probability", "sampling", "bigram", "examples", "embeddings"])
    expect(missingBefore(FOUNDATION[0], saved())).toEqual([])
  })
})

describe("the optional session plan", () => {
  it("is built from the recommended lesson's own text and saved state", () => {
    const p = sessionPlan(saved())!
    expect(p.lesson).toBe("characters")
    expect(p.concept).toContain("What does a language model actually read?")
    expect(p.checkStatus).toBe("Not started")
    expect(p.recap).toContain("single characters")
    expect(p.next).toEqual({ title: "Lesson 2: Pairs", href: "#/learn?lesson=pairs" })
  })
})
