import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { Route } from "@/content/glossary"
import { WORKSPACE_BY_ROUTE } from "@/content/journey"
import { ApiError } from "./api"

// ----------------------------------------------------------------------------- hash routing

function currentRoute(): { route: Route; params: URLSearchParams } {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?")
  const route = (WORKSPACE_BY_ROUTE.has(path as Route) ? path : "home") as Route
  return { route, params: new URLSearchParams(query ?? "") }
}

function subscribeHash(l: () => void) {
  window.addEventListener("hashchange", l)
  return () => window.removeEventListener("hashchange", l)
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash)
  void hash
  return currentRoute()
}

export function navigate(route: Route, params?: Record<string, string>) {
  const q = params ? "?" + new URLSearchParams(params).toString() : ""
  window.location.hash = `/${route}${q}`
}

export function hrefFor(route: Route, params?: Record<string, string>) {
  return `#/${route}${params ? "?" + new URLSearchParams(params).toString() : ""}`
}

// ----------------------------------------------------------------------------- async calls

export interface AsyncState<T> {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
}

/** Run an async call on demand. Older calls that finish late are ignored. */
export function useAsync<T, A extends unknown[]>(fn: (...args: A) => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: false })
  const latest = useRef(0)
  const run = useCallback(async (...args: A) => {
    const id = ++latest.current
    setState((s) => ({ ...s, loading: true, error: undefined }))
    try {
      const data = await fn(...args)
      if (id === latest.current) setState({ data, error: undefined, loading: false })
      return data
    } catch (err) {
      if (id === latest.current) setState((s) => ({ ...s, error: err as Error, loading: false }))
      return undefined
    }
  }, [fn])
  const reset = useCallback(() => setState({ data: undefined, error: undefined, loading: false }), [])
  return { ...state, run, reset, setData: (data: T) => setState({ data, error: undefined, loading: false }) }
}

/** Load once when the key changes (and again on retry). The previous data stays visible while loading. */
export function useLoad<T>(fn: () => Promise<T>, key: string) {
  const [attempt, setAttempt] = useState(0)
  const token = `${key}#${attempt}`
  const [state, setState] = useState<{ token: string | null; data?: T; error?: Error }>({ token: null })
  const latestFn = useRef(fn)
  useEffect(() => { latestFn.current = fn })
  useEffect(() => {
    let alive = true
    latestFn.current().then(
      (data) => alive && setState({ token, data }),
      (error) => alive && setState((s) => ({ token, data: s.data, error })),
    )
    return () => { alive = false }
  }, [token])
  const loading = state.token !== token
  return { data: state.data, error: loading ? undefined : state.error, loading, retry: () => setAttempt((a) => a + 1) }
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (l) => { const m = window.matchMedia(query); m.addEventListener("change", l); return () => m.removeEventListener("change", l) },
    () => window.matchMedia(query).matches,
  )
}

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)")
}

// ----------------------------------------------------------------------------- formatting

export const fmt = {
  p: (p: number, digits = 3) => (p === 0 ? "0" : p.toFixed(digits)),
  pct: (p: number, digits = 1) => `${(p * 100).toFixed(digits)}%`,
  n: (n: number) => n.toLocaleString("en-US"),
  nll: (x: number | null | undefined, digits = 3) => (x === null || x === undefined ? "∞" : x.toFixed(digits)),
  ms: (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : ms < 100 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(0)} ms`),
  num: (x: number, digits = 2) => (Object.is(x, -0) ? 0 : x).toFixed(digits),
}
