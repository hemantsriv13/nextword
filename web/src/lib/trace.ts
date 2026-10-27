// How the playground lays out a prompt plus a generation trace. Positions are counted in
// characters the way the engine counts them (Python list(text): one Unicode code point each),
// never in UTF-16 units, so an emoji is one character and is never split in half.
import type { Generation } from "@/lib/api"
import { charTokens } from "@/sim/tokenize"

export interface Segment {
  text: string
  generated: boolean
  /** The context the selected step read. */
  stepContext?: boolean
  /** The character the selected step chose. */
  stepChoice?: boolean
  /** The context the next prediction will read (the last character so far). */
  nextContext?: boolean
}

export interface TraceView {
  segments: Segment[]
  /** The generated text revealed so far, built from the trace tokens. */
  revealedText: string
  /** The step whose context is highlighted, or null when no step is shown. */
  selected: number | null
  /** The character the next prediction reads. */
  nextContext?: string
}

/** The last `n` characters of `text`, by code point. */
export function lastChars(text: string, n: number): string {
  return charTokens(text).slice(-n).join("")
}

/** Everything but the last character, by code point. */
export function withoutLastChar(text: string): string {
  return charTokens(text).slice(0, -1).join("")
}

export function traceView(prompt: string, result: Generation | undefined, revealed: number, selectedStep: number | null, stale: boolean): TraceView {
  const promptChars = charTokens(prompt)
  // A stale trace belongs to other settings, so none of it is laid over this prompt.
  const steps = result && !stale ? result.steps.slice(0, Math.max(0, Math.min(revealed, result.steps.length))) : []
  const generated = steps.map((s) => s.token)
  const all: Segment[] = [
    ...promptChars.map((text) => ({ text, generated: false })),
    ...generated.map((text) => ({ text, generated: true })),
  ]
  if (all.length) all[all.length - 1].nextContext = true

  // Step i reads the character just before its own output: the prompt's last character for step 0.
  const selected = steps.length ? Math.min(selectedStep ?? steps.length - 1, steps.length - 1) : null
  if (selected !== null) {
    const ctx = promptChars.length - 1 + selected
    if (ctx >= 0) all[ctx].stepContext = true
    all[ctx + 1].stepChoice = true
  }

  // Merge runs of plain characters so the markup stays small.
  const segments: Segment[] = []
  for (const s of all) {
    const prev = segments[segments.length - 1]
    const plain = !s.stepContext && !s.stepChoice && !s.nextContext
    if (plain && prev && prev.generated === s.generated && !prev.stepContext && !prev.stepChoice && !prev.nextContext) prev.text += s.text
    else segments.push({ ...s })
  }
  return { segments, revealedText: generated.join(""), selected, nextContext: all[all.length - 1]?.text }
}
