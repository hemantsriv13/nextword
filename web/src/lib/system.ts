// What is running on this computer right now, asked of the backend, never assumed by a page:
// the backend itself, each prediction engine (/api/engines), and the explaining model (a model *listing*
// through /api/assist/status; it never generates). Pages show these instead of hard-coded labels.
import { useCallback, useEffect, useState } from "react"
import { api, type Engine } from "./api"
import { assistStatus, type AssistStatus } from "./assist"

export type Check<T> = { state: "checking" } | { state: "ok"; data: T } | { state: "failed"; message: string }

export interface SystemStatus {
  backend: Check<{ modelVersion: string }>
  engines: Check<Engine[]>
  explainer: Check<AssistStatus>
  refresh: () => void
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useSystemStatus(): SystemStatus {
  const [backend, setBackend] = useState<SystemStatus["backend"]>({ state: "checking" })
  const [engines, setEngines] = useState<SystemStatus["engines"]>({ state: "checking" })
  const [explainer, setExplainer] = useState<SystemStatus["explainer"]>({ state: "checking" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    api.health().then((h) => alive && setBackend({ state: "ok", data: h }), (e) => alive && setBackend({ state: "failed", message: msg(e) }))
    api.engines().then((e) => alive && setEngines({ state: "ok", data: e }), (e) => alive && setEngines({ state: "failed", message: msg(e) }))
    assistStatus().then((s) => alive && setExplainer({ state: "ok", data: s }), (e) => alive && setExplainer({ state: "failed", message: msg(e) }))
    return () => { alive = false }
  }, [attempt])

  const refresh = useCallback(() => {
    setBackend({ state: "checking" }); setEngines({ state: "checking" }); setExplainer({ state: "checking" })
    setAttempt((n) => n + 1)
  }, [])
  return { backend, engines, explainer, refresh }
}

/** One engine's entry, once the engine list has loaded. */
export function engineOf(s: SystemStatus, id: string): Engine | undefined {
  return s.engines.state === "ok" ? s.engines.data.find((e) => e.id === id) : undefined
}
