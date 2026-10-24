import { useSyncExternalStore } from "react"
import { api, type Corpus } from "./api"

// One shared list of corpora, refreshed after uploads and deletes.
let corpora: Corpus[] | undefined
let error: Error | undefined
let loading = false
const listeners = new Set<() => void>()
let snapshot = { corpora, error, loading }

function emit() {
  snapshot = { corpora, error, loading }
  listeners.forEach((l) => l())
}

export async function refreshCorpora() {
  loading = true
  emit()
  try {
    corpora = await api.corpora()
    error = undefined
  } catch (e) {
    error = e as Error
  }
  loading = false
  emit()
}

export function useCorpora() {
  const snap = useSyncExternalStore((l) => {
    listeners.add(l)
    if (!corpora && !loading) void refreshCorpora()
    return () => listeners.delete(l)
  }, () => snapshot)
  return { ...snap, refresh: refreshCorpora }
}
