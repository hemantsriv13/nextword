// Contextual help for every control, from one inventory (content/help.ts).
// - A quick hint on deliberate hover (600 ms, then instant while moving between controls) or on
//   keyboard focus. Hints hold no interactive content and are linked with aria-describedby.
// - "Learn this control": a pinned, non-modal popover with a worked picture. Opened from a Help-mode
//   marker, or with Alt+H on a focused control. Escape closes it and returns focus.
// - Help mode: a small marker beside every control with help (the way in on touch screens). Disabled
//   controls with a reason always get one, saying why they are unavailable.
// Controls are found by their stable data-help-id, so no component needs wrapping. Opening help
// never runs an experiment or draws a random number: it only reads this inventory.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { CONTROL_BY_ID, EFFECT_LABEL, WORKSPACE_HELP, type ControlHelp, type Reveal } from "@/content/help"
import type { Route } from "@/content/glossary"
import { WORKSPACE_BY_ROUTE } from "@/content/journey"
import { navigate, usePrefersReducedMotion, useRoute } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Term } from "./glossary"
import { HelpVisual } from "./help-visuals"

const HINT_ID = "lab-help-hint"
const HOVER_DELAY = 600
const WARM_FOR = 700 // after a hint closes, the next one opens at once for this long

/** The help for an id: the inventory entry, or a sidebar link described from its workspace. */
export function helpFor(id: string): ControlHelp | undefined {
  const entry = CONTROL_BY_ID.get(id)
  if (entry) return entry
  if (id.startsWith("nav.")) {
    const route = id.slice(4) as Route
    const w = WORKSPACE_BY_ROUTE.get(route)
    const h = WORKSPACE_HELP.find((x) => x.route === route)
    if (w && h) return { id, label: w.title, route: "any", where: "Sidebar", does: `${h.practical} ${h.question}`, when: h.when, effect: "navigates" }
  }
  return undefined
}

// ----------------------------------------------------------------------------- placement

export interface Box { top: number; left: number; width: number; height: number }

/** Put a box of `size` next to `anchor` inside the viewport: below if it fits, else above, never off screen. */
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

const rectOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height } }
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

function isDisabled(el: Element) {
  return el.matches(":disabled, [aria-disabled='true'], [data-disabled]")
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
  helpMode: boolean
  setHelpMode: (on: boolean) => void
  /** Open "Learn this control" for an id, next to `anchor`; focus returns to `back` on close. */
  open: (id: string, anchor?: HTMLElement | null, back?: HTMLElement | null) => void
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

interface Popover { id: string; anchor: HTMLElement | null; back: HTMLElement | null }

export function HelpProvider({ children }: { children: ReactNode }) {
  const helpMode = useLab((s) => s.prefs.helpMode ?? false)
  const [popover, setPopover] = useState<Popover | null>(null)
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
    setPopover({ id, anchor: el, back: el.matches("button, a, input, select, textarea, [tabindex]") ? el : null })
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

  const value = useMemo<HelpValue>(() => ({
    helpMode,
    setHelpMode: (on) => actions.setPref("helpMode", on),
    open: (id, anchor = null, back = null) => setPopover({ id, anchor, back }),
    close: () => setPopover((p) => {
      if (p?.back?.isConnected) requestAnimationFrame(() => p.back!.focus())
      return null
    }),
    goTo: (id) => {
      const entry = helpFor(id)
      if (!entry) return
      if (entry.route !== "any" && entry.route !== route) navigate(entry.route, { help: id })
      else void point(id)
    },
    reveal,
    registerRevealer: (fn) => { revealers.current.add(fn); return () => { revealers.current.delete(fn) } },
  }), [helpMode, route, point, reveal])

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HintLayer suppressed={!!popover} />
      <Markers helpMode={helpMode} openId={popover?.id ?? null} />
      {popover && <HelpPopover key={popover.id + String(!!popover.anchor)} popover={popover} />}
    </HelpContext.Provider>
  )
}

// ----------------------------------------------------------------------------- quick hint

function HintLayer({ suppressed }: { suppressed: boolean }) {
  const help = useHelp()!
  const [hint, setHint] = useState<{ id: string; el: HTMLElement } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const warmUntil = useRef(0)
  const modality = useRef<"keyboard" | "pointer">("pointer")
  const current = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current)
      if (current.current) warmUntil.current = Date.now() + WARM_FOR
      current.current = null
      setHint(null)
    }
    const show = (el: HTMLElement) => {
      const id = el.getAttribute("data-help-id")!
      current.current = el
      setHint({ id, el })
    }
    const target = (t: EventTarget | null) => {
      const el = (t as Element | null)?.closest?.("[data-help-id]") as HTMLElement | null
      const entry = el ? helpFor(el.getAttribute("data-help-id")!) : undefined
      return el && entry && !entry.region ? el : null
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const el = target(e.target)
      if (el === current.current) return
      clearTimeout(timer.current)
      if (!el) return hide()
      const wait = Date.now() < warmUntil.current || current.current ? 0 : HOVER_DELAY
      if (current.current) setHint(null)
      current.current = null
      timer.current = window.setTimeout(() => show(el), wait)
    }
    const onLeaveWindow = (e: PointerEvent) => { if (!e.relatedTarget) hide() }
    const onKey = (e: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) modality.current = "keyboard"
      if (e.key === "Escape" && current.current) hide()
      if (e.altKey && (e.key === "h" || e.key === "H")) {
        const el = target(document.activeElement)
        if (el) { e.preventDefault(); hide(); help.open(el.getAttribute("data-help-id")!, el, document.activeElement as HTMLElement) }
      }
    }
    const onPointerDown = () => { modality.current = "pointer"; hide() }
    const onFocusIn = (e: FocusEvent) => {
      if (modality.current !== "keyboard") return
      const el = target(e.target)
      clearTimeout(timer.current)
      if (el) show(el)
      else hide()
    }
    const onFocusOut = (e: FocusEvent) => { if (current.current && !current.current.contains(e.relatedTarget as Node)) hide() }
    document.addEventListener("pointerover", onOver)
    document.addEventListener("pointerout", onLeaveWindow)
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    window.addEventListener("scroll", hide, true)
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener("pointerover", onOver)
      document.removeEventListener("pointerout", onLeaveWindow)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      window.removeEventListener("scroll", hide, true)
    }
  }, [help])

  const shown = hint && !suppressed ? hint : null
  // Link the hint to its control for screen readers while it is open.
  useEffect(() => {
    if (!shown) return
    const el = shown.el
    const before = el.getAttribute("aria-describedby")
    el.setAttribute("aria-describedby", [before, HINT_ID].filter(Boolean).join(" "))
    return () => { if (before) el.setAttribute("aria-describedby", before); else el.removeAttribute("aria-describedby") }
  }, [shown])

  if (!shown) return null
  return <Hint id={shown.id} el={shown.el} />
}

function Hint({ id, el }: { id: string; el: HTMLElement }) {
  const entry = helpFor(id)!
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    setPos(place(rectOf(el), { width: box.offsetWidth, height: box.offsetHeight }, viewport()))
  }, [el, id])
  const disabled = isDisabled(el) && entry.disabled
  return createPortal(
    <div
      ref={ref}
      id={HINT_ID}
      role="tooltip"
      data-testid="help-hint"
      className="pointer-events-none fixed z-[60] w-max max-w-[min(20rem,calc(100vw-16px))] rounded-lg border border-companion-edge bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
    >
      <p className="font-semibold">{entry.label}</p>
      <p className="mt-0.5">{disabled ? <>Unavailable now. {entry.disabled}</> : entry.does}</p>
      {!disabled && <p className="mt-1 text-muted-foreground">Use it when: {entry.when}</p>}
      <p className="mt-1.5 text-label font-medium text-data">{EFFECT_LABEL[entry.effect]}</p>
      {entry.learn && <p className="mt-1 text-label text-muted-foreground">More: Help mode marker, or Alt+H.</p>}
    </div>,
    document.body,
  )
}

// ----------------------------------------------------------------------------- Help mode markers

function Markers({ helpMode, openId }: { helpMode: boolean; openId: string | null }) {
  const help = useHelp()!
  const [items, setItems] = useState<{ id: string; el: HTMLElement; top: number; left: number; disabled: boolean }[]>([])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const view = viewport()
      const next: typeof items = []
      document.querySelectorAll<HTMLElement>("[data-help-id]").forEach((el) => {
        const entry = helpFor(el.getAttribute("data-help-id")!)
        if (!entry || entry.region) return
        const disabled = isDisabled(el) && !!entry.disabled
        if (!helpMode && !disabled) return
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.bottom < 0 || r.top > view.height) return
        next.push({ id: entry.id, el, disabled, top: Math.max(2, r.top - 7), left: Math.min(view.width - 22, r.right - 9) })
      })
      setItems(next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    schedule()
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "data-disabled", "data-help-id"] })
    window.addEventListener("scroll", schedule, true)
    window.addEventListener("resize", schedule)
    return () => { cancelAnimationFrame(frame); mo.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule) }
  }, [helpMode])

  if (!items.length) return null
  return createPortal(
    <div data-testid="help-markers">
      {items.map((m) => {
        const entry = helpFor(m.id)!
        return (
          <button
            key={m.id + m.top + m.left}
            type="button"
            onClick={(e) => help.open(m.id, m.el, e.currentTarget)}
            aria-label={m.disabled ? `Why is ${entry.label} unavailable?` : `Learn this control: ${entry.label}`}
            aria-expanded={openId === m.id}
            data-help-marker={m.id}
            className={cn(
              "fixed z-[55] flex size-[18px] items-center justify-center rounded-full border text-[11px] font-semibold leading-none",
              m.disabled ? "border-src-sim-edge bg-src-sim text-src-sim-ink" : "border-companion-edge bg-companion text-data",
            )}
            style={{ top: m.top, left: m.left }}
          >
            ?
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

// ----------------------------------------------------------------------------- Learn this control

function HelpPopover({ popover }: { popover: Popover }) {
  const help = useHelp()!
  const entry = helpFor(popover.id)
  const ref = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reduced = usePrefersReducedMotion()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const update = () => {
      const anchor = popover.anchor?.isConnected ? rectOf(popover.anchor) : { top: 64, left: window.innerWidth - 24, width: 0, height: 0 }
      setPos(place(anchor, { width: box.offsetWidth, height: box.offsetHeight }, viewport(), 10))
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true) }
  }, [popover])

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [popover.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); help.close() } }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [help])

  if (!entry) return null
  const disabled = popover.anchor && isDisabled(popover.anchor) && entry.disabled
  const explanation = typeof document !== "undefined" ? document.querySelector<HTMLElement>('[data-help-id="layout.explanation"]') : null
  const L = entry.learn
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="lab-help-title"
      data-testid="help-popover"
      className={cn("fixed z-[60] flex max-h-[min(72vh,38rem)] w-[min(26rem,calc(100vw-16px))] flex-col overflow-hidden rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion text-foreground shadow-lg", !reduced && "animate-in fade-in-0 duration-150")}
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <p className="text-label font-medium text-data">Learn this control</p>
          <h2 id="lab-help-title" ref={heading} tabIndex={-1} className="text-section font-semibold outline-none">{entry.label}</h2>
          <p className="text-label text-muted-foreground">{entry.where}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close help" onClick={help.close}><XmarkIcon className="size-4" /></Button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-5 text-prose" data-testid="help-popover-body">
        {disabled && <p className="rounded-lg bg-src-sim px-3 py-2 text-sm text-src-sim-ink"><span className="font-medium">Why it is unavailable: </span>{entry.disabled}</p>}
        <p>{L?.purpose ?? entry.does}</p>
        {L?.purpose && <p className="text-sm">{entry.does}</p>}
        <p className="w-fit rounded-md bg-companion-callout px-2 py-0.5 text-label font-medium">{EFFECT_LABEL[entry.effect]}</p>
        {L?.visual && <HelpVisual id={L.visual} />}
        <dl className="flex flex-col gap-2 text-sm">
          <div><dt className="text-label font-medium text-muted-foreground">Use it when</dt><dd>{entry.when}</dd></div>
          {L && <div><dt className="text-label font-medium text-muted-foreground">What it uses</dt><dd>{L.input}</dd></div>}
          {L && <div><dt className="text-label font-medium text-muted-foreground">What changes</dt><dd>{L.changes}</dd></div>}
          {L && <div><dt className="text-label font-medium text-muted-foreground">What to look for afterwards</dt><dd>{L.lookFor}</dd></div>}
          {L?.misconception && <div><dt className="text-label font-medium text-muted-foreground">A common misunderstanding</dt><dd>{L.misconception}</dd></div>}
        </dl>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-companion-edge pt-3 text-sm">
          {entry.term && <span>Definition: <Term id={entry.term} className="font-medium" /></span>}
          {explanation && (
            <button type="button" className="underline underline-offset-2" onClick={() => {
              help.close()
              explanation.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })
              explanation.querySelector<HTMLElement>("h2")?.setAttribute("tabindex", "-1")
              explanation.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true })
            }}>Read this page's explanation</button>
          )}
          <span className="text-label text-muted-foreground">Esc closes</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ----------------------------------------------------------------------------- the switch

export function HelpModeSwitch() {
  const help = useHelp()
  if (!help) return null
  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground" data-help-id="shell.help-mode">
      <Switch checked={help.helpMode} onCheckedChange={(on) => help.setHelpMode(!!on)} aria-label="Help mode: show a help marker beside every control" />
      <span className="hidden sm:inline">Help</span>
    </label>
  )
}
