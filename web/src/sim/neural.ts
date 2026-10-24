// A tiny fixed-context neural language model, written out by hand so every number can be shown.
//
//   context ids (n) ──lookup──▶ embeddings (n × d) ──concat──▶ x (n·d)
//   x ──·W1 + b1──▶ tanh ──▶ h (H) ──·W2 + b2──▶ logits (V) ──softmax──▶ probabilities (V)
//   loss = −log p[target]                          (cross-entropy for one example)
//
// This is an educational simulation in the browser, not the Stage 2 PyTorch engine.

import { gaussian, mulberry32, type Rng } from "./rng"

export interface Params {
  E: number[][] // V × d     one learned vector per token
  W1: number[][] // (n·d) × H
  b1: number[] // H
  W2: number[][] // H × V
  b2: number[] // V
}

export interface Config {
  vocabSize: number
  context: number
  embed: number
  hidden: number
}

export interface Example {
  context: number[]
  target: number
}

function matrix(rows: number, cols: number, rng: Rng, scale: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => gaussian(rng) * scale))
}

export function initParams(c: Config, seed: number): Params {
  const rng = mulberry32(seed)
  return {
    E: matrix(c.vocabSize, c.embed, rng, 0.5),
    W1: matrix(c.context * c.embed, c.hidden, rng, 1 / Math.sqrt(c.context * c.embed)),
    b1: Array(c.hidden).fill(0),
    W2: matrix(c.hidden, c.vocabSize, rng, 1 / Math.sqrt(c.hidden)),
    b2: Array(c.vocabSize).fill(0),
  }
}

export function cloneParams(p: Params): Params {
  return { E: p.E.map((r) => r.slice()), W1: p.W1.map((r) => r.slice()), b1: p.b1.slice(), W2: p.W2.map((r) => r.slice()), b2: p.b2.slice() }
}

export function softmax(z: number[]): number[] {
  const max = Math.max(...z)
  const e = z.map((v) => Math.exp(v - max))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

export interface Forward {
  x: number[]
  pre: number[] // x·W1 + b1, before tanh
  h: number[]
  logits: number[]
  probs: number[]
  loss: number
}

export function forward(p: Params, ex: Example): Forward {
  const x = ex.context.flatMap((id) => p.E[id])
  const pre = p.b1.map((b, j) => b + x.reduce((s, xi, i) => s + xi * p.W1[i][j], 0))
  const h = pre.map(Math.tanh)
  const logits = p.b2.map((b, k) => b + h.reduce((s, hj, j) => s + hj * p.W2[j][k], 0))
  const probs = softmax(logits)
  return { x, pre, h, logits, probs, loss: -Math.log(Math.max(probs[ex.target], 1e-300)) }
}

export function zerosLike(p: Params): Params {
  return {
    E: p.E.map((r) => r.map(() => 0)),
    W1: p.W1.map((r) => r.map(() => 0)),
    b1: p.b1.map(() => 0),
    W2: p.W2.map((r) => r.map(() => 0)),
    b2: p.b2.map(() => 0),
  }
}

/** Backpropagation for one example, adding its gradient (scaled by `weight`) into `g`. */
export interface Backward {
  dLogits: number[] // ∂L/∂logits = p − y
  dH: number[]
  dPre: number[]
  dX: number[]
}

export function backward(p: Params, ex: Example, f: Forward, g: Params, weight = 1): Backward {
  const dLogits = f.probs.map((q, k) => (q - (k === ex.target ? 1 : 0)) * weight) // ∂L/∂logits = p − y
  dLogits.forEach((d, k) => { g.b2[k] += d })
  for (let j = 0; j < f.h.length; j++) for (let k = 0; k < dLogits.length; k++) g.W2[j][k] += f.h[j] * dLogits[k]
  const dH = f.h.map((_, j) => p.W2[j].reduce((s, w, k) => s + w * dLogits[k], 0))
  const dPre = dH.map((d, j) => d * (1 - f.h[j] * f.h[j])) // tanh′ = 1 − tanh²
  dPre.forEach((d, j) => { g.b1[j] += d })
  for (let i = 0; i < f.x.length; i++) for (let j = 0; j < dPre.length; j++) g.W1[i][j] += f.x[i] * dPre[j]
  const d = p.E[0].length
  const dX = f.x.map((_, i) => p.W1[i].reduce((s, w, j) => s + w * dPre[j], 0))
  dX.forEach((dx, i) => { g.E[ex.context[Math.floor(i / d)]][i % d] += dx })
  return { dLogits, dH, dPre, dX }
}

/** Mean loss and mean gradient over a batch. */
export function batchGradient(p: Params, batch: Example[]): { loss: number; grad: Params } {
  const grad = zerosLike(p)
  let loss = 0
  for (const ex of batch) {
    const f = forward(p, ex)
    loss += f.loss
    backward(p, ex, f, grad, 1 / batch.length)
  }
  return { loss: loss / batch.length, grad }
}

/** Gradient descent: move every parameter a small step against its gradient. */
export function sgdStep(p: Params, g: Params, lr: number): Params {
  return {
    E: p.E.map((r, i) => r.map((v, j) => v - lr * g.E[i][j])),
    W1: p.W1.map((r, i) => r.map((v, j) => v - lr * g.W1[i][j])),
    b1: p.b1.map((v, j) => v - lr * g.b1[j]),
    W2: p.W2.map((r, i) => r.map((v, j) => v - lr * g.W2[i][j])),
    b2: p.b2.map((v, j) => v - lr * g.b2[j]),
  }
}

export function meanLoss(p: Params, examples: Example[]): number {
  if (examples.length === 0) return NaN
  return examples.reduce((s, ex) => s + forward(p, ex).loss, 0) / examples.length
}

export function countParams(c: Config): number {
  return c.vocabSize * c.embed + c.context * c.embed * c.hidden + c.hidden + c.hidden * c.vocabSize + c.vocabSize
}

// ----------------------------------------------------------------------------- data

export interface Dataset {
  vocab: string[]
  train: Example[]
  val: Example[]
  trainText: string
  valText: string
}

/** Split the text first, then build windows inside each part, so no window spans both. */
export function buildDataset(text: string, context: number, trainFraction: number, vocabFrom = text): Dataset {
  const vocab = [...new Set(vocabFrom)].sort()
  const id = new Map(vocab.map((t, i) => [t, i]))
  const cut = Math.floor(text.length * trainFraction)
  const trainText = text.slice(0, cut)
  const valText = text.slice(cut)
  const windows = (part: string): Example[] => {
    const out: Example[] = []
    for (let i = 0; i + context < part.length; i++) {
      const ids = [...part.slice(i, i + context + 1)].map((ch) => id.get(ch))
      if (ids.every((v) => v !== undefined)) out.push({ context: ids.slice(0, context) as number[], target: ids[context] as number })
    }
    return out
  }
  return { vocab, train: windows(trainText), val: windows(valText), trainText, valText }
}

// ----------------------------------------------------------------------------- training run

export interface TrainSettings {
  config: Config
  lr: number
  steps: number
  batchSize: number
  seed: number
  evalEvery: number
}

export interface CurvePoint {
  step: number
  train: number
  val: number
}

/** A seeded training run. Calls onPoint at every evaluation; return false from it to stop early. */
export function train(data: Dataset, s: TrainSettings, onPoint?: (pt: CurvePoint) => boolean | void): { params: Params; curve: CurvePoint[] } {
  let params = initParams(s.config, s.seed)
  const rng = mulberry32(s.seed + 1)
  const curve: CurvePoint[] = []
  const record = (step: number) => {
    const pt = { step, train: meanLoss(params, data.train), val: meanLoss(params, data.val) }
    curve.push(pt)
    return onPoint?.(pt) !== false
  }
  if (!record(0)) return { params, curve }
  for (let step = 1; step <= s.steps; step++) {
    const batch = s.batchSize >= data.train.length
      ? data.train
      : Array.from({ length: s.batchSize }, () => data.train[Math.floor(rng() * data.train.length)])
    const { grad } = batchGradient(params, batch)
    params = sgdStep(params, grad, s.lr)
    if (step % s.evalEvery === 0 || step === s.steps) {
      if (!record(step)) break
    }
  }
  return { params, curve }
}

// ----------------------------------------------------------------------------- one number

/** Gradient descent on f(w) = (w − target)², the smallest possible example. */
export function scalarDescent(start: number, target: number, lr: number, steps: number) {
  const path = [{ step: 0, w: start, loss: (start - target) ** 2, grad: 2 * (start - target) }]
  let w = start
  for (let i = 1; i <= steps; i++) {
    const grad = 2 * (w - target)
    w = w - lr * grad
    path.push({ step: i, w, loss: (w - target) ** 2, grad: 2 * (w - target) })
    if (!Number.isFinite(w) || Math.abs(w) > 1e6) break
  }
  return path
}

/** Build a dataset from separate training and validation texts (both windowed on their own). */
export function buildDatasetFromParts(trainText: string, valText: string, context: number, vocabFrom = trainText + valText): Dataset {
  const vocab = [...new Set(vocabFrom)].sort()
  const id = new Map(vocab.map((t, i) => [t, i]))
  const windows = (part: string): Example[] => {
    const ids = [...part].map((ch) => id.get(ch))
    if (ids.some((v) => v === undefined)) throw new Error("a character is missing from the vocabulary")
    const out: Example[] = []
    for (let i = 0; i + context < ids.length; i++) out.push({ context: ids.slice(i, i + context) as number[], target: ids[i + context] as number })
    return out
  }
  return { vocab, train: windows(trainText), val: windows(valText), trainText, valText }
}
