// Contextual help for every control, from one inventory (content/help.ts).
// - Help opens only from the small Info icon beside a control (components/lab/info-tip.tsx): hover or
//   focus the icon, or tap it to pin the box. Hovering the control itself never opens anything.
// - Alt+H on a focused control opens its Info box.
// - goTo points at a control from search, help links and tours: it opens the page, tab or section,
//   scrolls to the control, and opens its Info box.
// Controls are found by their stable data-help-id, so no component needs wrapping. Opening help
// never runs an experiment or draws a random number: it only reads this inventory.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { Switch } from "@/components/ui/switch"
import { helpFor, type ControlHelp, type Reveal } from "@/content/help"
import { navigate, useRoute } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { closeInfo, infoIconFor, openInfo } from "./info-tip"

export { helpFor }

// ----------------------------------------------------------------------------- placement

export interface Box { top: number; left: number; width: number; height: number }

/** Put a box of `size` next to `anchor` inside the viewport: below if it fits, else above, never off screen.
 *  Used by the toolkit tour card; the Info boxes are positioned by the popover itself. */
export function place(anchor: Box, size: { width: number; height: number }, view: { width: number; height: number }, gap = 8, margin = 8) {
  const below = anchor.top + anchor.height + gap
  const above = anchor.top - gap - size.height
  let top: number
  let side: "below" | "above"
  if (below + size.height <= view.height - margin) { top = below; side = "below" }
  else if (above >= margin) { top = above; side = "above" }
  else {
    side = view.height - (anchor.top + anchor.height) > anchor.top ? "below" : "above"
    top = side === "below" ? below : above
  }
  top = Math.max(margin, Math.min(top, view.height - size.height - margin))
  const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - size.width / 2, view.width - size.width - margin))
  return { top, left, side }
}

/** Wait until the current page has rendered (pages load lazily), so its revealers are registered. */
export const whenPageReady = () => whenPresent("main [data-help-id], main [data-teach]", 90)

/** Wait a few frames for an element that a revealed tab or section is about to render. */
export function whenPresent(selector: string, frames = 45): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    let n = 0
    const tick = () => {
      const el = document.querySelector<HTMLElement>(selector)
      if (el || n++ >= frames) return resolve(el)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

export function spotlight(el: HTMLElement, attr = "data-help-spot", ms = 2600) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView?.({ block: "center", behavior: smooth ? "smooth" : "auto" })
  el.setAttribute(attr, "")
  if (ms > 0) window.setTimeout(() => el.removeAttribute(attr), ms)
}

// ----------------------------------------------------------------------------- context

type Revealer = (reveal: Reveal, entry: ControlHelp) => void

interface HelpValue {
  /** Open a control's Info box, with the longer details showing. */
  open: (id: string) => void
  close: () => void
  /** Go to a control: open its page, tab or section, scroll to it and point it out. Runs nothing. */
  goTo: (id: string) => void
  /** Open the tabs and sections a control needs. Pages register what they can open. */
  reveal: (entry: ControlHelp) => void
  registerRevealer: (fn: Revealer) => () => void
}

const HelpContext = createContext<HelpValue | null>(null)
export const useHelp = () => useContext(HelpContext)

/** A page says how to open the tab or section that holds one of its controls. */
export function useHelpReveal(fn: Revealer) {
  const help = useHelp()
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => help?.registerRevealer((r, e) => ref.current(r, e)), [help])
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const revealers = useRef(new Set<Revealer>())
  const { route, params } = useRoute()

  const reveal = useCallback((entry: ControlHelp) => {
    const r = entry.reveal ?? {}
    if (r.flow) actions.setPref("flowOpen", true)
    revealers.current.forEach((fn) => fn(r, entry))
  }, [])

  const point = useCallback(async (id: string) => {
    const entry = helpFor(id)
    if (!entry) return
    await whenPageReady()
    reveal(entry)
    const el = await whenPresent(`[data-help-id="${CSS.escape(id)}"]`)
    if (!el) return
    spotlight(el)
    // Open its Info box once the scroll has settled, so the box sits beside the icon.
    if (infoIconFor(id)) window.setTimeout(() => openInfo(id, { expanded: true }), 350)
  }, [reveal])

  // Arriving from a help link: #/route?help=<id>. Point at the control once, then drop the parameter.
  const pending = params.get("help")
  useEffect(() => {
    if (!pending) return
    history.replaceState(null, "", `#/${route}`)
    // Not cancelled on cleanup: dropping the parameter re-renders this provider without it, and
    // the pointing must still happen once.
    requestAnimationFrame(() => void point(pending))
  }, [pending, route, point])

  // Alt+H on a focused control opens its Info box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "h" && e.key !== "H")) return
      const id = (document.activeElement as Element | null)?.closest?.("[data-help-id]")?.getAttribute("data-help-id")
      if (id && infoIconFor(id)) { e.preventDefault(); openInfo(id) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo<HelpValue>(() => ({
    open: (id) => { if (infoIconFor(id)) openInfo(id, { expanded: true }) },
    close: closeInfo,
    goTo: (id) => {
      const entry = helpFor(id)
      if (!entry) return
      if (entry.route !== "any" && entry.route !== route) navigate(entry.route, { help: id })
      else void point(id)
    },
    reveal,
    registerRevealer: (fn) => { revealers.current.add(fn); return () => { revealers.current.delete(fn) } },
  }), [route, point, reveal])

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

// ----------------------------------------------------------------------------- the switch

export function InfoIconsSwitch() {
  const on = useLab((s) => s.prefs.infoIcons ?? true)
  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground" data-help-id="shell.help-mode">
      <Switch checked={on} onCheckedChange={(v) => actions.setPref("infoIcons", !!v)} aria-label="Show Info icons beside controls" />
      <span className="hidden sm:inline">Info</span>
    </label>
  )
}
