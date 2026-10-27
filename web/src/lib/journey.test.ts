import { describe, expect, it } from "vitest"
import type { Journey } from "@/lib/api"
import { charTokens } from "@/sim/tokenize"
import example from "@/test/journey-example.json"
import stops from "@/test/journey-stops.json"
import { contextBefore, engineRow, intervals, journeyChanges, landing, pairOccurrences, stepAgrees, topPairs } from "./journey"

// Both fixtures are real responses of nextword/lab/service.py journey(), saved from the Python engine.
const ex = example as unknown as Journey
const st = stops as unknown as Journey

describe("the journey's views agree with the engine's own numbers", () => {
  it("every pair highlighted in the text has exactly the engine's count", () => {
    for (const [a, row] of Object.entries(ex.table.rows)) {
      for (const [b, count] of Object.entries(row)) expect(pairOccurrences(ex.text, a, b).length).toBe(count)
    }
    // And a pair the engine never counted is never highlighted.
    expect(pairOccurrences(ex.text, "z", "q")).toEqual([])
  })

  it("the text has one pair fewer than characters, as the table says", () => {
    expect(ex.table.pairs).toBe(charTokens(ex.text).length - 1)
  })

  it("each row's probabilities are its counts divided by its total, and they add up to one", () => {
    const { total, items } = engineRow(ex.table, "h")
    expect(total).toBe(5)
    expect(items).toEqual([{ token: "e", count: 4, p: 0.8 }, { token: "a", count: 1, p: 0.2 }])
    expect(items.reduce((s, i) => s + i.p, 0)).toBeCloseTo(1, 12)
  })

  it("every generated step matches the count table of the same snapshot, and its draw lands on its choice", () => {
    const g = ex.generation
    g.steps.forEach((step, i) => {
      expect(step.context).toBe(contextBefore(g, i))
      expect(stepAgrees(ex.table, step, contextBefore(g, i))).toBe(true)
      expect(landing(step)?.token).toBe(step.token)
    })
    expect(g.steps.map((s) => s.token).join("")).toBe(g.suggestion)
  })

  it("the first step of the default run picks the less likely character, which the sampling step explains", () => {
    const first = ex.generation.steps[0]
    expect(first.context).toBe("h")
    expect(first.token).toBe("a")
    const ivs = intervals(first)
    expect(ivs.map((iv) => [iv.token, iv.start, iv.end])).toEqual([["e", 0, 0.8], ["a", 0.8, 1]])
    expect(first.draw).toBeGreaterThanOrEqual(0.8)
  })

  it("a step from a different snapshot is caught, not explained", () => {
    const step = { ...ex.generation.steps[0], candidates: [{ token: "e", label: "e", p: 0.5 }, { token: "a", label: "a", p: 0.5 }] }
    expect(stepAgrees(ex.table, step, "h")).toBe(false)
    expect(stepAgrees(ex.table, ex.generation.steps[1], "h")).toBe(false) // wrong context
  })

  it("a run that reaches a character with no successor stops, and the last character has no row", () => {
    const g = st.generation
    expect(g.stopped).toMatch(/never had a successor/)
    expect(g.steps.length).toBeLessThan(g.length)
    const last = g.steps.at(-1)!.token
    expect(engineRow(st.table, last)).toEqual({ total: 0, items: [] })
  })

  it("lists the common pairs from the table, largest first", () => {
    const top = topPairs(ex.table, 3)
    expect(top[0].count).toBeGreaterThanOrEqual(top[1].count)
    for (const p of top) expect(ex.table.rows[p.a][p.b]).toBe(p.count)
  })

  it("names exactly the inputs that changed since a run", () => {
    const run = { corpus: "example", prompt: "a cat", length: 10, seed: 2 }
    expect(journeyChanges(run, run)).toEqual([])
    expect(journeyChanges(run, { ...run, seed: 3, prompt: "b" })).toEqual(["prompt", "seed"])
  })
})
