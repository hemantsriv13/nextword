// Read-only helpers for the guided bigram journey. They never compute a prediction: every count,
// probability and draw comes from the Python engine's response. They only locate those values in
// the text and lay them out, and check that the pieces of one snapshot agree with each other.
import type { CountTable, Generation } from "@/lib/api"
import { charTokens } from "@/sim/tokenize"

export interface JourneyConfig {
  corpus: string
  prompt: string
  length: number
  seed: number
}

export const JOURNEY_DEFAULTS: JourneyConfig = { corpus: "example", prompt: "a cat sat on th", length: 10, seed: 2 }

/** Where the pair a→b occurs: the code-point index of each `a` that is followed by `b`. */
export function pairOccurrences(text: string, a: string, b: string): number[] {
  const chars = charTokens(text)
  const out: number[] = []
  for (let i = 0; i + 1 < chars.length; i++) if (chars[i] === a && chars[i + 1] === b) out.push(i)
  return out
}

export interface RowItem {
  token: string
  count: number
  p: number
}

/**
 * One row of the engine's count table, in the engine's own order (the order the pairs were first
 * seen), with each count divided by the row total. This is the division the engine does in
 * next_token_probabilities(); it adds no smoothing.
 */
export function engineRow(table: CountTable, context: string): { total: number; items: RowItem[] } {
  const row = table.rows[context] ?? {}
  const total = table.totals[context] ?? 0
  return { total, items: Object.entries(row).map(([token, count]) => ({ token, count, p: total ? count / total : 0 })) }
}

/** The pairs with the highest counts, for a short list to pick from. */
export function topPairs(table: CountTable, n: number): { a: string; b: string; count: number }[] {
  const all = Object.entries(table.rows).flatMap(([a, row]) => Object.entries(row).map(([b, count]) => ({ a, b, count })))
  all.sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
  return all.slice(0, n)
}

export interface Interval {
  token: string
  p: number
  start: number
  end: number
}

type Step = Generation["steps"][number]

/** The probability intervals laid end to end on [0, 1) in the engine's order, as sample_next() does. */
export function intervals(step: Step): Interval[] {
  let start = 0
  return step.intervalOrder.map((token) => {
    const p = step.candidates.find((c) => c.token === token)?.p ?? 0
    const iv = { token, p, start, end: start + p }
    start += p
    return iv
  })
}

/**
 * The interval the draw landed in. Like sample_next() (bisect_right on the running sums), the engine
 * picks the first interval whose end is past draw × total, and the last one if rounding leaves none.
 */
export function landing(step: Step): Interval | undefined {
  const ivs = intervals(step)
  const x = step.draw * (ivs.at(-1)?.end ?? 1)
  return ivs.find((iv, i) => x < iv.end || i === ivs.length - 1)
}

/**
 * Does this step agree with the count table of the same snapshot? Each probability must equal its
 * count divided by the row total, the context must be the previous character, and the draw must
 * land on the chosen character. A disagreement means the pieces came from different runs.
 */
export function stepAgrees(table: CountTable, step: Step, previous: string): boolean {
  if (step.context !== previous) return false
  const { total, items } = engineRow(table, step.context)
  if (!total || items.length !== step.candidates.length) return false
  for (const it of items) {
    const c = step.candidates.find((x) => x.token === it.token)
    if (!c || Math.abs(c.p - it.p) > 1e-9) return false
  }
  return landing(step)?.token === step.token
}

/** The character before step i: the prompt's last character for step 0, otherwise the previous output. */
export function contextBefore(g: Generation, i: number): string {
  return i === 0 ? charTokens(g.prompt).at(-1)! : g.steps[i - 1].token
}

export function sameJourneyConfig(a: JourneyConfig, b: JourneyConfig) {
  return a.corpus === b.corpus && a.prompt === b.prompt && a.length === b.length && a.seed === b.seed
}

export function journeyChanges(run: JourneyConfig, now: JourneyConfig): string[] {
  const out: string[] = []
  if (run.corpus !== now.corpus) out.push("training text")
  if (run.prompt !== now.prompt) out.push("prompt")
  if (run.length !== now.length) out.push("length")
  if (run.seed !== now.seed) out.push("seed")
  return out
}
