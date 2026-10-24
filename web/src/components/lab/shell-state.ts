import { useSyncExternalStore } from "react"

// Focus mode hides navigation and explanations. It is per-visit, so it is not saved.
let focus = false
const listeners = new Set<() => void>()

export function setFocus(on: boolean) {
  focus = on
  listeners.forEach((l) => l())
}

export function useFocusMode() {
  const value = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => focus)
  return { focus: value, setFocus }
}
