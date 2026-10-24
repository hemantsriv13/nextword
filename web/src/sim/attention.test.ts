import { describe, expect, it } from "vitest"
import { attentionHead, inputMatrix, layerNorm, matmul, multiHead, shape, toyHeadWeights, transpose } from "./attention"
import { mulberry32, randomMatrix } from "./rng"

const tokens = ["the", "cat", "sat", "on", "a", "mat"]
const d = 4

function setup(ts: string[], causal: boolean) {
  const { x } = inputMatrix({ tokens: ts, d, usePositions: true })
  return attentionHead(x, toyHeadWeights(d, d, 11), causal)
}

describe("matrix helpers", () => {
  it("multiplies with the right shape", () => {
    expect(shape(matmul([[1, 2, 3]], transpose([[1, 0, 0], [0, 1, 0]])))).toEqual([1, 2])
    expect(matmul([[1, 2]], [[3], [4]])).toEqual([[11]])
  })
})

describe("attention", () => {
  it("each row of weights sums to one", () => {
    for (const causal of [true, false]) {
      setup(tokens, causal).weights.forEach((row) => expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12))
    }
  })
  it("causal mask gives zero weight to every future position", () => {
    const r = setup(tokens, true)
    r.weights.forEach((row, i) => row.forEach((w, j) => { if (j > i) expect(w).toBe(0) }))
  })
  it("with the mask, changing a later token cannot change earlier outputs", () => {
    const a = setup(tokens, true)
    const b = setup([...tokens.slice(0, 5), "dog"], true)
    for (let i = 0; i < 5; i++) a.out[i].forEach((v, j) => expect(b.out[i][j]).toBeCloseTo(v, 12))
  })
  it("without the mask, a later token does leak into earlier outputs", () => {
    const a = setup(tokens, false)
    const b = setup([...tokens.slice(0, 5), "dog"], false)
    expect(Math.abs(a.out[0][0] - b.out[0][0])).toBeGreaterThan(1e-9)
  })
  it("scaling divides by √dk", () => {
    const r = setup(tokens, false)
    expect(r.scaled[1][2]).toBeCloseTo(r.scores[1][2] / Math.sqrt(d), 12)
  })
  it("output is the weighted sum of value rows", () => {
    const r = setup(tokens, true)
    const manual = r.v[0].map((_, j) => r.weights[2].reduce((s, w, t) => s + w * r.v[t][j], 0))
    manual.forEach((v, j) => expect(r.out[2][j]).toBeCloseTo(v, 12))
  })
  it("multi-head output keeps the model width", () => {
    const { x } = inputMatrix({ tokens, d, usePositions: true })
    const heads = [toyHeadWeights(d, 2, 1), toyHeadWeights(d, 2, 2)]
    const wo = randomMatrix(4, 4, mulberry32(3), 0.5)
    const out = multiHead(x, heads, wo, true)
    expect(shape(out.concat)).toEqual([tokens.length, 4])
    expect(shape(out.out)).toEqual([tokens.length, 4])
  })
  it("layer norm gives mean 0 and variance about 1", () => {
    const r = layerNorm([1, 2, 3, 10])
    expect(r.reduce((a, b) => a + b, 0) / 4).toBeCloseTo(0, 10)
    expect(r.reduce((a, b) => a + b * b, 0) / 4).toBeCloseTo(1, 4)
  })
})
