// Evaluation runs are always stored with the exact settings that produced them. The live controls
// can change at any time (even while a request is in flight); a result never takes their values.

import { useCallback, useRef, useState } from "react"
import type { Evaluation } from "./api"
import type { SavedExperiment } from "./store"

export type EvalConfig = SavedExperiment["config"]

export interface Snapshot<C, R> {
  config: C
  result: R
}

/** Run requests from frozen copies of the settings, and keep each result with its own copy. */
export function useSnapshotRun<C extends object, R>(request: (config: C) => Promise<R>) {
  const [run, setRun] = useState<Snapshot<C, R> | null>(null)
  const [pending, setPending] = useState<C | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const latest = useRef(0)
  const start = useCallback(async (config: C) => {
    const snapshot = Object.freeze({ ...config }) as C
    const id = ++latest.current
    setPending(snapshot)
    setError(null)
    try {
      const result = await request(snapshot)
      if (id !== latest.current) return undefined // a newer request was started; ignore this one
      setRun({ config: snapshot, result })
      return { config: snapshot, result }
    } catch (err) {
      if (id === latest.current) setError(err as Error)
      return undefined
    } finally {
      if (id === latest.current) setPending(null)
    }
  }, [request])
  return { run, pending, error, start }
}

export function sameConfig(a: EvalConfig, b: EvalConfig) {
  return a.corpus === b.corpus && a.train === b.train && a.val === b.val && a.on === b.on && a.k === b.k
}

const pct = (x: number) => `${Math.round(x * 100)}%`

export function testShare(c: Pick<EvalConfig, "train" | "val">) {
  return Math.max(0, 1 - c.train - c.val)
}

/** A one-line description of a run's settings, used for labels next to its results. */
export function describeConfig(c: EvalConfig, corpusName?: string) {
  return `${corpusName ?? c.corpus}, ${pct(c.train)} / ${pct(c.val)} / ${pct(testShare(c))} split, ${c.on === "val" ? "validation" : "test"}, k ${c.k}`
}

/** Which settings differ between a run and the controls, in words. */
export function changedSettings(run: EvalConfig, now: EvalConfig): string[] {
  const out: string[] = []
  if (run.corpus !== now.corpus) out.push("training text")
  if (run.train !== now.train || run.val !== now.val) out.push("split")
  if (run.on !== now.on) out.push("held-out part")
  if (run.k !== now.k) out.push("smoothing k")
  return out
}

/** Why a split can't be used, or null when it is fine. */
export function splitProblem(c: Pick<EvalConfig, "train" | "val">): string | null {
  if (!(c.train > 0 && c.val > 0)) return "Training and validation shares must be above zero."
  if (c.train + c.val >= 0.999 || testShare(c) < 0.01) return "Leave at least 1% of the text for the test split."
  return null
}

export type RerunVerdict = { kind: "reproduced" | "corpus-changed" | "engine-changed" | "different"; message: string }

/** Compare a rerun with a saved result. A matching loss alone is not called a reproduction. */
export function rerunVerdict(saved: SavedExperiment["result"], now: Evaluation): RerunVerdict {
  if (now.corpusFingerprint !== saved.corpusFingerprint)
    return { kind: "corpus-changed", message: `The training text changed since this run was saved (fingerprint ${saved.corpusFingerprint} → ${now.corpusFingerprint}), so this is not a reproduction.` }
  if (now.modelVersion !== saved.modelVersion)
    return { kind: "engine-changed", message: `The engine code changed since (${saved.modelVersion} → ${now.modelVersion}), so this is not a reproduction.` }
  if (now.meanNll === saved.meanNll && now.targets === saved.targets)
    return { kind: "reproduced", message: "Reproduced: same text, same engine version, same loss." }
  return { kind: "different", message: "Same text and engine, but a different loss. Something else changed; check the settings." }
}
