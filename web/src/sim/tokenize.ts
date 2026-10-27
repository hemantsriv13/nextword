// Tokenizer demonstrations. Character tokenization matches the bigram engine (list(text) in Python).
// The word splitter and the byte-pair encoding below are small teaching versions: they do not
// match any commercial model's tokenizer (those use different rules, byte-level vocabularies
// and tens of thousands of learned merges).

export function visible(token: string): string {
  return token.replace(/ /g, "␣").replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/\r/g, "␍")
}

/** Same as the engine: every character, including spaces and newlines, is one token. */
export function charTokens(text: string): string[] {
  return Array.from(text)
}

/** How many characters the engine sees: code points, not UTF-16 units (an emoji counts once). */
export function charCount(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0xd800 || c > 0xdbff || i + 1 >= text.length) n++ // a high surrogate starts a pair; count the pair once
  }
  return n
}

/** The first `n` characters by code point, so an emoji is never cut in half. */
export function firstChars(text: string, n: number): string {
  return charTokens(text).slice(0, n).join("")
}

/** A simple word splitter: runs of letters/digits, single punctuation marks, and runs of spaces. */
export function wordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}']+|\s+|[^\s\p{L}\p{N}]/gu) ?? []
}

/** Token ↔ ID table, numbered in order of first appearance (a Lab convention for display). */
export function idTable(tokens: string[]): { toId: Map<string, number>; toToken: string[] } {
  const toToken: string[] = []
  const toId = new Map<string, number>()
  for (const t of tokens) if (!toId.has(t)) { toId.set(t, toToken.length); toToken.push(t) }
  return { toId, toToken }
}

export interface MergeStep {
  left: string
  right: string
  merged: string
  count: number
  tokenCount: number // length of the sequence after this merge
  vocabSize: number
}

function pairCounts(seq: string[]): Map<string, { left: string; right: string; count: number; first: number }> {
  const counts = new Map<string, { left: string; right: string; count: number; first: number }>()
  for (let i = 0; i + 1 < seq.length; i++) {
    const key = seq[i] + "\u0000" + seq[i + 1]
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { left: seq[i], right: seq[i + 1], count: 1, first: i })
  }
  return counts
}

export function applyMerge(seq: string[], left: string, right: string): string[] {
  const out: string[] = []
  for (let i = 0; i < seq.length; i++) {
    if (i + 1 < seq.length && seq[i] === left && seq[i + 1] === right) { out.push(left + right); i++ }
    else out.push(seq[i])
  }
  return out
}

/** Learn up to `merges` merges. Spaces are kept as their own tokens so merges stay inside words. */
export function learnBpe(text: string, merges: number): { steps: MergeStep[]; tokens: string[] } {
  let seq = charTokens(text)
  const vocab = new Set(seq)
  const steps: MergeStep[] = []
  for (let m = 0; m < merges; m++) {
    let best: { left: string; right: string; count: number; first: number } | null = null
    for (const c of pairCounts(seq).values()) {
      if (/\s/.test(c.left) || /\s/.test(c.right)) continue
      if (!best || c.count > best.count || (c.count === best.count && c.first < best.first)) best = c
    }
    if (!best || best.count < 2) break
    seq = applyMerge(seq, best.left, best.right)
    vocab.add(best.left + best.right)
    steps.push({ left: best.left, right: best.right, merged: best.left + best.right, count: best.count, tokenCount: seq.length, vocabSize: vocab.size })
  }
  return { steps, tokens: seq }
}

/** Encode new text by replaying the learned merges in the order they were learned. */
export function encodeBpe(text: string, steps: MergeStep[]): string[] {
  let seq = charTokens(text)
  for (const s of steps) seq = applyMerge(seq, s.left, s.right)
  return seq
}
