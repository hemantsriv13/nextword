// Attention simulation with toy numbers. The vectors and weight matrices are made up
// (seeded random values), not learned; the arithmetic is the real scaled dot-product attention.

import { mulberry32, randomMatrix } from "./rng"

export type Matrix = number[][]

export function shape(m: Matrix): [number, number] {
  return [m.length, m[0]?.length ?? 0]
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const [n, k] = shape(a)
  const [k2, m] = shape(b)
  if (k !== k2) throw new Error(`cannot multiply ${n}×${k} by ${k2}×${m}`)
  return a.map((row) => Array.from({ length: m }, (_, j) => row.reduce((s, x, t) => s + x * b[t][j], 0)))
}

export function transpose(a: Matrix): Matrix {
  const [n, m] = shape(a)
  return Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => a[i][j]))
}

export function add(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((x, j) => x + b[i][j]))
}

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619)
  return h >>> 0
}

/** A toy embedding: the same token always gets the same made-up vector. */
export function toyEmbedding(token: string, d: number): number[] {
  return randomMatrix(1, d, mulberry32(hash(token)), 0.8)[0]
}

/** Sinusoidal positional encoding (as in the original transformer paper). */
export function positional(position: number, d: number): number[] {
  return Array.from({ length: d }, (_, i) => {
    const angle = position / Math.pow(10000, (2 * Math.floor(i / 2)) / d)
    return i % 2 === 0 ? Math.sin(angle) : Math.cos(angle)
  })
}

export interface HeadWeights {
  wq: Matrix
  wk: Matrix
  wv: Matrix
}

export function toyHeadWeights(d: number, dk: number, seed: number): HeadWeights {
  const rng = mulberry32(seed)
  const scale = 1 / Math.sqrt(d)
  return { wq: randomMatrix(d, dk, rng, scale * 1.6), wk: randomMatrix(d, dk, rng, scale * 1.6), wv: randomMatrix(d, dk, rng, scale) }
}

export interface HeadResult {
  q: Matrix
  k: Matrix
  v: Matrix
  scores: Matrix // Q·Kᵀ
  scaled: Matrix // divided by √dk
  masked: Matrix // future positions set to -Infinity when causal
  weights: Matrix // softmax of each row
  out: Matrix // weights · V
}

export function softmaxRow(row: number[]): number[] {
  const max = Math.max(...row.filter((x) => x !== -Infinity))
  const exps = row.map((x) => (x === -Infinity ? 0 : Math.exp(x - max)))
  const total = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / total)
}

export function attentionHead(x: Matrix, w: HeadWeights, causal: boolean): HeadResult {
  const q = matmul(x, w.wq)
  const k = matmul(x, w.wk)
  const v = matmul(x, w.wv)
  const dk = shape(q)[1]
  const scores = matmul(q, transpose(k))
  const scaled = scores.map((row) => row.map((s) => s / Math.sqrt(dk)))
  const masked = scaled.map((row, i) => row.map((s, j) => (causal && j > i ? -Infinity : s)))
  const weights = masked.map(softmaxRow)
  return { q, k, v, scores, scaled, masked, weights, out: matmul(weights, v) }
}

export interface SequenceInput {
  tokens: string[]
  d: number
  usePositions: boolean
}

export function inputMatrix({ tokens, d, usePositions }: SequenceInput): { embeddings: Matrix; positions: Matrix; x: Matrix } {
  const embeddings = tokens.map((t) => toyEmbedding(t, d))
  const positions = tokens.map((_, i) => (usePositions ? positional(i, d) : Array(d).fill(0)))
  return { embeddings, positions, x: add(embeddings, positions) }
}

export function multiHead(x: Matrix, heads: HeadWeights[], wo: Matrix, causal: boolean) {
  const results = heads.map((h) => attentionHead(x, h, causal))
  const concat = x.map((_, i) => results.flatMap((r) => r.out[i]))
  return { results, concat, out: matmul(concat, wo) }
}

export function layerNorm(row: number[], eps = 1e-5): number[] {
  const mean = row.reduce((a, b) => a + b, 0) / row.length
  const variance = row.reduce((a, b) => a + (b - mean) ** 2, 0) / row.length
  return row.map((x) => (x - mean) / Math.sqrt(variance + eps))
}

/** One pre-norm transformer block: x + MHA(LN(x)), then + FFN(LN(·)). Toy weights throughout. */
export function transformerBlock(x: Matrix, heads: HeadWeights[], wo: Matrix, w1: Matrix, w2: Matrix, causal: boolean) {
  const ln1 = x.map((r) => layerNorm(r))
  const attn = multiHead(ln1, heads, wo, causal)
  const afterAttn = add(x, attn.out)
  const ln2 = afterAttn.map((r) => layerNorm(r))
  const hidden = matmul(ln2, w1).map((r) => r.map((v) => Math.max(0, v))) // ReLU
  const ffn = matmul(hidden, w2)
  return { ln1, attn, afterAttn, ln2, hidden, ffn, out: add(afterAttn, ffn) }
}
