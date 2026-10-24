// Decoding simulation: how a model's scores (logits) become one chosen token.
// Pure functions over plain arrays, so every stage can be shown and tested.

import { mulberry32 } from "./rng"

export const MIN_TEMPERATURE = 0.05
export const MAX_TEMPERATURE = 5

/** Softmax with temperature. Subtracting the max first keeps exp() from overflowing. */
export function softmax(logits: number[], temperature = 1): number[] {
  if (!(temperature > 0)) throw new Error("temperature must be greater than 0; use greedy decoding for the T → 0 limit")
  if (logits.length === 0) return []
  const scaled = logits.map((z) => z / temperature)
  const max = Math.max(...scaled)
  const exps = scaled.map((z) => Math.exp(z - max))
  const total = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / total)
}

/** Indices sorted by probability, highest first; ties keep their original order. */
export function rankOrder(probs: number[]): number[] {
  return probs.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i)
}

/** Keep the k most likely tokens (zero out the rest). Not renormalized. */
export function topK(probs: number[], k: number): number[] {
  if (k <= 0 || k >= probs.length) return probs.slice()
  const keep = new Set(rankOrder(probs).slice(0, k))
  return probs.map((p, i) => (keep.has(i) ? p : 0))
}

/** Keep the smallest set of top tokens whose probability adds up to at least p. Not renormalized. */
export function topP(probs: number[], p: number): number[] {
  if (p >= 1) return probs.slice()
  if (p <= 0) throw new Error("top-p must be greater than 0")
  const total = probs.reduce((a, b) => a + b, 0)
  const keep = new Set<number>()
  let mass = 0
  for (const i of rankOrder(probs)) {
    if (probs[i] <= 0) break
    keep.add(i)
    mass += probs[i] / total
    if (mass >= p - 1e-12) break
  }
  return probs.map((q, i) => (keep.has(i) ? q : 0))
}

export function renormalize(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) throw new Error("nothing left to choose from after filtering")
  return weights.map((w) => w / total)
}

/** Pick the token whose interval on [0, 1) contains `u` (the same rule the bigram engine uses). */
export function pickByDraw(probs: number[], u: number): number {
  let cumulative = 0
  let last = -1
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] <= 0) continue
    cumulative += probs[i]
    last = i
    if (u < cumulative) return i
  }
  return last // u fell past the end because of rounding
}

export function greedy(probs: number[]): number {
  return rankOrder(probs)[0]
}

export interface DecodeSettings {
  temperature: number
  greedy: boolean
  k: number // 0 means off
  p: number // 1 means off
}

export interface Pipeline {
  softmax1: number[] // the distribution at temperature 1
  tempered: number[]
  afterK: number[]
  afterP: number[]
  final: number[] // renormalized distribution that sampling uses
}

export function pipeline(logits: number[], s: DecodeSettings): Pipeline {
  const softmax1 = softmax(logits, 1)
  const tempered = s.greedy ? softmax1 : softmax(logits, s.temperature)
  const afterK = topK(tempered, s.k)
  const afterP = topP(renormalize(afterK), s.p)
  return { softmax1, tempered, afterK, afterP, final: renormalize(afterP) }
}

/** Repeat the draw `n` times with a seeded generator and count how often each token came up. */
export function repeatedDraws(final: number[], n: number, seed: number, useGreedy: boolean): number[] {
  const counts = final.map(() => 0)
  const rng = mulberry32(seed)
  for (let i = 0; i < n; i++) counts[useGreedy ? greedy(final) : pickByDraw(final, rng())]++
  return counts
}
