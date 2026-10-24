import { describe, expect, it } from "vitest"
import { greedy, pickByDraw, pipeline, renormalize, repeatedDraws, softmax, topK, topP } from "./decoding"

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe("softmax", () => {
  it("sums to one and keeps order", () => {
    const p = softmax([2, 1, 0.5, -1])
    expect(sum(p)).toBeCloseTo(1, 12)
    expect(p[0]).toBeGreaterThan(p[1])
  })
  it("is stable for huge logits", () => {
    const p = softmax([1000, 999, -1000])
    expect(sum(p)).toBeCloseTo(1, 12)
    expect(p.every(Number.isFinite)).toBe(true)
  })
  it("matches the formula", () => {
    const z = [1, 2, 3]
    const e = z.map(Math.exp)
    softmax(z).forEach((p, i) => expect(p).toBeCloseTo(e[i] / sum(e), 12))
  })
  it("low temperature sharpens, high temperature flattens", () => {
    const z = [2, 1, 0]
    expect(softmax(z, 0.5)[0]).toBeGreaterThan(softmax(z, 1)[0])
    expect(softmax(z, 3)[0]).toBeLessThan(softmax(z, 1)[0])
  })
  it("refuses temperature 0", () => {
    expect(() => softmax([1, 2], 0)).toThrow()
  })
})

describe("filters", () => {
  const p = [0.5, 0.2, 0.15, 0.1, 0.05]
  it("top-k keeps exactly k", () => {
    expect(topK(p, 2).filter((x) => x > 0)).toHaveLength(2)
  })
  it("top-p keeps the smallest set reaching p", () => {
    expect(topP(p, 0.7).filter((x) => x > 0)).toHaveLength(2) // 0.5 + 0.2
    expect(topP(p, 0.71).filter((x) => x > 0)).toHaveLength(3)
  })
  it("renormalized result is a distribution", () => {
    expect(sum(renormalize(topK(p, 3)))).toBeCloseTo(1, 12)
  })
  it("pipeline final sums to one", () => {
    const out = pipeline([3, 1, 0.2, -2], { temperature: 0.7, greedy: false, k: 3, p: 0.9 })
    expect(sum(out.final)).toBeCloseTo(1, 12)
  })
})

describe("sampling", () => {
  it("draw lands in the matching interval", () => {
    const p = [0.25, 0.5, 0.25]
    expect(pickByDraw(p, 0.1)).toBe(0)
    expect(pickByDraw(p, 0.3)).toBe(1)
    expect(pickByDraw(p, 0.9)).toBe(2)
  })
  it("never picks a filtered token", () => {
    const p = renormalize(topK([0.4, 0.3, 0.2, 0.1], 2))
    const counts = repeatedDraws(p, 2000, 1, false)
    expect(counts[2] + counts[3]).toBe(0)
  })
  it("observed frequencies approach the distribution", () => {
    const p = [0.6, 0.3, 0.1]
    const counts = repeatedDraws(p, 20000, 42, false)
    counts.forEach((c, i) => expect(c / 20000).toBeCloseTo(p[i], 1))
  })
  it("same seed gives the same draws", () => {
    expect(repeatedDraws([0.5, 0.5], 50, 7, false)).toEqual(repeatedDraws([0.5, 0.5], 50, 7, false))
  })
  it("greedy always picks the most likely", () => {
    expect(greedy([0.1, 0.7, 0.2])).toBe(1)
    expect(repeatedDraws([0.1, 0.7, 0.2], 100, 3, true)).toEqual([0, 100, 0])
  })
})
