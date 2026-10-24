// Training windows and data splits, to show why the source text is split before windows are made.

import { mulberry32 } from "./rng"

export interface Window {
  start: number // index of the first character
  context: string
  target: string
}

/** Every (context → next character) pair with a context of `size` characters. */
export function makeWindows(text: string, size: number): Window[] {
  const chars = Array.from(text)
  const out: Window[] = []
  for (let i = 0; i + size < chars.length; i++) out.push({ start: i, context: chars.slice(i, i + size).join(""), target: chars[i + size] })
  return out
}

export type SplitName = "train" | "val"

export interface SplitResult {
  strategy: "split-first" | "windows-first"
  windows: (Window & { split: SplitName })[]
  /** For each character position: which splits' windows read it. */
  positions: { train: boolean; val: boolean }[]
  /** Validation windows that share at least one character position with a training window. */
  leakedVal: number
  /** Validation windows whose exact context also appears in training. */
  duplicatedContexts: number
  valCount: number
}

export function splitWindows(text: string, size: number, valFraction: number, strategy: SplitResult["strategy"], seed = 1): SplitResult {
  const n = Array.from(text).length
  let windows: (Window & { split: SplitName })[]
  if (strategy === "split-first") {
    const cut = Math.floor(n * (1 - valFraction))
    const chars = Array.from(text)
    const train = makeWindows(chars.slice(0, cut).join(""), size).map((w) => ({ ...w, split: "train" as const }))
    const val = makeWindows(chars.slice(cut).join(""), size).map((w) => ({ ...w, start: w.start + cut, split: "val" as const }))
    windows = [...train, ...val]
  } else {
    const rng = mulberry32(seed)
    windows = makeWindows(text, size).map((w) => ({ ...w, split: rng() < valFraction ? ("val" as const) : ("train" as const) }))
  }
  const positions = Array.from({ length: n }, () => ({ train: false, val: false }))
  for (const w of windows) for (let i = w.start; i <= w.start + size; i++) positions[i][w.split] = true
  const trainContexts = new Set(windows.filter((w) => w.split === "train").map((w) => w.context))
  let leakedVal = 0
  let duplicatedContexts = 0
  const val = windows.filter((w) => w.split === "val")
  for (const w of val) {
    let shared = false
    for (let i = w.start; i <= w.start + size; i++) if (positions[i].train) shared = true
    if (shared) leakedVal++
    if (trainContexts.has(w.context)) duplicatedContexts++
  }
  return { strategy, windows, positions, leakedVal, duplicatedContexts, valCount: val.length }
}
