// Client for the Lab's Python backend (nextword/lab/server.py). Every result labelled
// "Your model" in the interface comes through here.

export class ApiError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
  get offline() {
    return this.code === "offline"
  }
}

async function request<T>(path: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === "AbortError") throw new ApiError(`The backend took longer than ${timeoutMs / 1000} s to answer.`, "timeout", 0)
    throw new ApiError("Can't reach the Python backend. Start it with: .venv\\Scripts\\python -m nextword.lab", "offline", 0)
  }
  clearTimeout(timer)
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new ApiError(`The backend answered ${res.status} without JSON. Is another program using this port?`, "bad_response", res.status)
  }
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string } }).error
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? "error", res.status)
  }
  return data as T
}

// ----------------------------------------------------------------------------- types

export interface Corpus {
  id: string
  name: string
  origin: "sample" | "upload"
  file: string
  chars: number
  distinct: number
  fingerprint: string
}

export interface FrequencyRow {
  token: string
  label: string
  count: number
}

export interface CorpusStats {
  chars: number
  distinct: number
  lines: number
  words: number
  frequency: FrequencyRow[]
}

export interface CorpusDetail extends Corpus {
  text: string
  stats: CorpusStats
}

export interface CountTable {
  vocab: { token: string; label: string }[]
  rows: Record<string, Record<string, number>>
  totals: Record<string, number>
  pairs: number
}

export interface Candidate {
  token: string
  label: string
  p: number
  count?: number
}

export interface Distribution {
  context: string
  label: string
  total: number
  candidates: (Candidate & { count: number })[]
}

export interface Step {
  context: string
  contextLabel: string
  draw: number
  token: string
  tokenLabel: string
  candidates: Candidate[]
  intervalOrder: string[]
}

export interface Generation {
  engine: string
  modelVersion: string
  corpus: Corpus
  prompt: string
  contextUsed: string
  contextUsedLabel: string
  seed: number
  length: number
  suggestion: string
  stopped: string | null
  steps: Step[]
  timingsMs: { validate: number; count: number; countCacheHit: boolean; countOnlyMs: number; generate: number; format: number; total: number }
}

export interface Benchmark {
  runs: number
  length: number
  latencyMs: { p50: number; p95: number; max: number; min: number }
  requestsPerSecond: number | null
  charsPerSecond: number | null
  wallSeconds: number
  samples: number[]
  modelVersion: string
}

export interface EvalExample {
  context: string
  target: string
  p: number
  nll: number | null
  reason: string | null
}

export interface Evaluation {
  split: { train: number; val: number; test: number; bounds: [number, number] }
  on: "val" | "test"
  k: number
  targets: number
  unseenContext: number
  unseenPair: number
  meanNll: number | null
  meanNllCovered: number | null
  covered: number
  perplexity: number | null
  uniformBaselineNll: number
  vocabularyWithUnknown: number
  examples: EvalExample[]
  truncated: boolean
  modelVersion: string
  corpusFingerprint: string
}

export interface Adaptation {
  context: string
  before: Distribution | null
  after: Distribution | null
  baseHeldOutNll: { before: number | null; after: number | null }
  extraHeldOutNll: { before: number | null; after: number | null }
  basePairs: number
  extraPairs: number
  note: string
}

export interface Engine {
  id: string
  name: string
  source: "model"
  status: string
  version: string
  file: string
  decoding: string[]
}

// ----------------------------------------------------------------------------- calls

export const api = {
  health: () => request<{ ok: boolean; modelVersion: string }>("/api/health", undefined, 4000),
  engines: () => request<Engine[]>("/api/engines"),
  corpora: () => request<Corpus[]>("/api/corpora"),
  corpus: (id: string) => request<CorpusDetail>(`/api/corpus?id=${encodeURIComponent(id)}`),
  addCorpus: (name: string, text: string) => request<Corpus>("/api/corpora", { name, text }),
  deleteCorpus: (id: string) => request<{ deleted: string }>("/api/corpora/delete", { id }),
  stats: (corpusText: string) => request<CorpusStats>("/api/stats", { corpusText }),
  table: (corpus: string) => request<CountTable>("/api/bigram/table", { corpus }),
  tableFromText: (corpusText: string) => request<CountTable>("/api/bigram/table", { corpusText }),
  row: (corpus: string, context: string) => request<Distribution>("/api/bigram/row", { corpus, context }),
  generate: (b: { corpus: string; prompt: string; length: number; seed: number | null }) => request<Generation>("/api/generate", { engine: "char-bigram", ...b }),
  benchmark: (b: { corpus: string; prompt: string; length: number; runs: number }) => request<Benchmark>("/api/benchmark", b, 60000),
  evaluate: (b: { corpus?: string; corpusText?: string; train: number; val: number; on: "val" | "test"; k: number }) => request<Evaluation>("/api/evaluate", b, 60000),
  adapt: (b: { base?: string; baseText?: string; extraText: string; context: string }) => request<Adaptation>("/api/adapt", b),
  source: (path: string) => request<{ path: string; text: string }>(`/api/source?path=${encodeURIComponent(path)}`),
}
