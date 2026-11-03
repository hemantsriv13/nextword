// Client for the MLP journey's backend (nextword/lab/mlp_service.py). Every number on the MLP page comes
// from these calls: a real character MLP, trained with PyTorch on this computer's CPU.

import { ApiError } from "./api"

export interface MlpConfig {
  context: number
  embed: number
  hidden: number
  steps: number
  batch: number
  lr: number
  seed: number
}

export interface MlpStatus {
  available: boolean
  error: string | null
  torch: string | null
  threads: number | null
  limits: Record<keyof MlpConfig, [number, number]> | null
  defaults: MlpConfig | null
  training: string | null
  saved: { id: string; state: RunState; step: number; config: MlpConfig; corpus: { name: string }; created: number }[]
}

export interface CurvePoint { step: number; train: number; val: number | null }

export interface PredictionRow {
  window: string[]
  target: string
  initial: { pTarget: number; top: { token: string; p: number }[] }
  trained: { pTarget: number; top: { token: string; p: number }[] }
}

/** "interrupted": the server stopped while the run was training; it reloads at its last saved step. */
export type RunState = "new" | "training" | "done" | "stopped" | "interrupted" | "error"

export interface MlpRun {
  id: string
  state: RunState
  error: string | null
  step: number
  config: MlpConfig
  corpus: { id: string; name: string; fingerprint: string; chars: number }
  created: number
  split: { train: number; val: number; test: number; bounds: [number, number]; how?: string }
  /** How many examples each curve point was measured on (a fixed sample when a part is larger). */
  curveSample?: { train: number; val: number }
  /** Steps whose weights were saved during training, for replay. */
  recorded?: number[]
  /** The curve point with the lowest validation loss: the checkpoint chosen on validation only. */
  best?: { step: number; val: number; how: string } | null
  /** Trained to the end of its settings. */
  complete?: boolean
  /** Stopped or interrupted, with everything saved that continuing exactly needs. */
  resumable?: boolean
  examples: { train: number; val: number; test: number }
  vocab: string[]
  vocabSize: number
  params: number
  curve: CurvePoint[]
  msPerStep: number | null
  trainSeconds: number | null
  fingerprints: { initial: string; trained?: string; best?: string }
  samples: { initial?: string; trained?: string }
  predictions: PredictionRow[]
  engine: string
}

export type Checkpoint = "initial" | "trained"
export type Split = "train" | "val"

interface Vec { values: number[]; size: number; shown: number }
export interface Inspection {
  run: string
  checkpoint: Checkpoint
  fingerprint: string
  split: Split
  index: number
  examples: number
  window: string[]
  target: string
  embeddings: number[][]
  joined: Vec
  hiddenBefore: Vec
  hidden: Vec
  hiddenStats: { size: number; saturated: number }
  logits: { top: { token: string; logit: number }[]; target: number; size: number }
  probs: { top: { token: string; p: number }[]; target: number; sum: number; uniform: number }
  loss: number
  uniformLoss: number
  update: {
    lr: number
    gradNorms: Record<string, number>
    embedding: { token: string; before: number[]; grad: number[]; after: number[] }
    outputRow: { token: string; before: number[]; grad: number[]; after: number[]; size: number }
    pTargetAfter: number
    lossAfter: number
  }
  model: { context: number; embed: number; hidden: number; vocab: number; params: number }
}

export interface Generated {
  run: string
  checkpoint: Checkpoint
  fingerprint: string
  prompt: string
  seed: number
  text: string
  steps: { window: string[]; draw: number; token: string; tokenLabel: string; p: number; top: { token: string; p: number }[] }[]
}

export interface Comparison {
  run: string
  split: string
  rule: string
  uniform: number
  note: string
  rows: { part: "val" | "test"; targets: number; unknownTargets?: number; mlp_initial: number | null; mlp_trained?: number | null; mlp_best?: number | null; bigram: number | null; bigram_add1: number | null; bigram_unseen: number; bigram_targets: number }[]
  best?: { step: number; val: number } | null
  policy?: { vocabulary: string; unknown: string; smoothing: string; selection: string; targets: string }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError("Can't reach the Python backend. Start it with: .venv\\Scripts\\python -m nextword.lab", "offline", 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string } } | null)?.error
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? "error", res.status)
  }
  return data as T
}

export const mlpApi = {
  status: () => call<MlpStatus>("/api/mlp/status"),
  run: (id: string) => call<MlpRun>(`/api/mlp/run?id=${encodeURIComponent(id)}`),
  start: (b: { corpus: string } & MlpConfig) => call<MlpRun>("/api/mlp/start", b),
  stop: (id: string) => call<{ id: string; stopping: boolean }>("/api/mlp/stop", { id }),
  resume: (id: string) => call<MlpRun>("/api/mlp/resume", { id }),
  reset: (id: string) => call<{ removed: string }>("/api/mlp/reset", { id }),
  inspect: (b: { run: string; checkpoint: Checkpoint; split: Split; index: number }) => call<Inspection>("/api/mlp/inspect", b),
  examples: (b: { run: string; split: Split; start: number; count: number }) =>
    call<{ total: number; start: number; rows: { index: number; window: string[]; target: string }[] }>("/api/mlp/examples", b),
  generate: (b: { run: string; checkpoint: Checkpoint; prompt?: string; length: number; seed: number }) => call<Generated>("/api/mlp/generate", b),
  compare: (run: string) => call<Comparison>("/api/mlp/compare", { run }),
  history: (b: { run: string; split: Split; index: number }) => call<RecordedHistory>("/api/mlp/history", b),
  replay: (run: string, step: number) => call<RecordedUpdate>("/api/mlp/replay", { run, step }),
}

/** The weights saved at chosen steps during training, measured again now. Nothing between them is filled in. */
export interface RecordedHistory {
  run: string
  kind: "recorded"
  steps: { step: number; fingerprint: string; train: number; val: number; pTarget: number; top: { token: string; p: number }[]; replayable: boolean }[]
  stepsTrained: number
  window: string[]
  target: string
  curveSample: { train: number; val: number }
  note: string
}

/** One saved update: weights before and after, the batch it used, and a recomputation that checks them. */
export interface RecordedUpdate {
  run: string
  kind: "recorded"
  step: number
  lr: number
  batchSize: number
  fingerprintBefore: string
  fingerprintAfter: string
  batch: { index: number; window: string[]; target: string }[]
  batchLoss: number
  batchLossRecomputed: number
  batchLossAfter: number
  gradNorms: Record<string, number>
  embedding: { token: string; before: number[]; grad: number[]; after: number[] }
  outputRow: { token: string; before: number[]; grad: number[]; after: number[]; size: number }
  firstExample: { pBefore: number; pAfter: number }
  check: { largestDifference: number; matches: boolean; how: string }
}

export const LEARNING_RATES = [0.01, 0.05, 0.1, 0.2, 0.5, 1]
