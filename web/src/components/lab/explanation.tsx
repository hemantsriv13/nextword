// The teaching companion: the panel beside an experiment that explains it. One tinted sheet with a
// teal top edge, its own header, and the explanation inside. Shared by the Bigram journey, the MLP
// journey, the Beginner lessons and every workspace's explanation column.
//
// Layout rules (so long AI answers never stretch the page or push the experiment away):
// - Desktop: sticky under the app bar, exactly as tall as the window below it. Its header, tabs and the
//   tutor's question box stay put; everything else scrolls in ONE area inside the panel.
// - Two tabs when a page has a tutor: "Understand this step" (the written explanation, works offline)
//   and "Ask your tutor" (the local AI). Both stay mounted, so switching keeps the conversation, the
//   reading position and any answer still streaming. Switching never asks the model anything.
// - Expand: the same panel, wider, over the page (Escape or Close returns). Same element, same state.
// - Narrow screens: a labelled button opens the same panel full screen; closing it returns to the
//   experiment where you left it.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { CollapseIcon, ExpandIcon, LightBulbIcon, OpenBookIcon, ServerIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useMediaQuery } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { TutorComposer, TutorTranscript, type AssistTarget } from "./ask-ai"

// ----------------------------------------------------------------------------- expanded code

interface Expand {
  /** The code block shown in full, if any. */
  expanded: string | null
  setExpanded: (id: string | null) => void
}
const ExpandContext = createContext<Expand | null>(null)
/** For a code block inside the panel: expand it, and widen the panel to fit. Null outside a panel. */
export const usePanelExpand = () => useContext(ExpandContext)

const EXTEND_MAX = 720 // how far, in px, the panel may grow to the left over the experiment
const PAGE_GUTTER = 24

/** How far the panel can grow left on a wide screen: up to the experiment's left edge, never off it. */
function extensionFor(panel: HTMLElement) {
  if (!window.matchMedia("(min-width: 1024px)").matches) return 0
  const main = panel.closest("main")?.getBoundingClientRect()
  const r = panel.getBoundingClientRect()
  const left = (main?.left ?? 0) + PAGE_GUTTER
  return Math.max(0, Math.min(EXTEND_MAX, Math.round(r.left - left)))
}

// ----------------------------------------------------------------------------- the panel

export type PanelTab = "understand" | "tutor"

/** What the tutor tab shows: the step to ask about, or (null) a reason it's off here. */
export interface PanelTutor { target: AssistTarget | null; off?: ReactNode }

/** Height of the visible window, which shrinks when a phone keyboard opens (so the question box stays above it). */
function useVisualViewport(on: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!on || !vv) return
    const update = () => setBox({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update) }
  }, [on])
  return on ? box : null
}

/** While the panel covers the page: the page doesn't scroll underneath, and keeps its place. */
function useScrollLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = "hidden"
    return () => { root.style.overflow = before }
  }, [on])
}

/** The experiment beside the panel: the nearest content to its left, found by walking up the layout. */
function experimentBeside(panel: HTMLElement): HTMLElement[] {
  let node: HTMLElement | null = panel
  for (let depth = 0; node?.parentElement && depth < 4; depth++, node = node.parentElement) {
    const left = node.getBoundingClientRect().left
    const beside = Array.from(node.parentElement.children).filter((c): c is HTMLElement =>
      c instanceof HTMLElement && c !== node && c.getBoundingClientRect().right <= left + 1 && c.getBoundingClientRect().width > 40)
    if (beside.length) return beside
  }
  return []
}

/** Where an element's own content ends (a stretched column ends where its content does, not where the row does). */
function contentBottom(el: HTMLElement) {
  const kids = Array.from(el.children) as HTMLElement[]
  return kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) : el.getBoundingClientRect().bottom
}

/**
 * Beside the experiment, the panel is as tall as the window below its own top edge (so its question box is on
 * screen even before it sticks), but never reaches below the experiment's end. So the experiment alone sets
 * the page's height: nothing the panel shows, or how it fits, can lengthen the page. Written to a CSS variable
 * on the element, so scrolling never re-renders what is inside.
 */
function useFitToWindow(ref: { current: HTMLElement | null }, on: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !on) return
    let frame = 0
    let beside = experimentBeside(el)
    const fit = () => {
      frame = 0
      const top = el.getBoundingClientRect().top
      const toWindow = window.innerHeight - Math.max(top, STICKY_TOP) - BOTTOM_GAP
      const toExperiment = beside.length ? Math.max(...beside.map(contentBottom)) - top : Infinity
      el.style.setProperty("--panel-h", `${Math.max(MIN_PANEL, Math.round(Math.min(toWindow, toExperiment)))}px`)
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(fit) }
    fit()
    const ro = new ResizeObserver(() => { beside = experimentBeside(el); queue() })
    beside.forEach((b) => { ro.observe(b); Array.from(b.children).forEach((k) => ro.observe(k)) })
    window.addEventListener("scroll", queue, { passive: true })
    window.addEventListener("resize", queue)
    return () => { cancelAnimationFrame(frame); ro.disconnect(); window.removeEventListener("scroll", queue); window.removeEventListener("resize", queue); el.style.removeProperty("--panel-h") }
  }, [ref, on])
}
const STICKY_TOP = 64 // top-16: under the 48 px app bar, with 16 px to breathe
const BOTTOM_GAP = 16
const MIN_PANEL = 360

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function ExplanationPanel({ label = "Step explained", title, children, tutor, layout = "sidebar", desktopFrom = 1024, className, testid }: {
  /** The small line above the title. */
  label?: string
  /** What is being explained: the lesson step, or the workspace. */
  title: ReactNode
  /** The written explanation: the whole panel, or the "Understand this step" tab when there is a tutor. */
  children: ReactNode
  /** Give the panel an "Ask your tutor" tab. */
  tutor?: PanelTutor
  /** "sidebar": sticky beside the experiment. "inline": in the flow (several on one page), window-high at most. */
  layout?: "sidebar" | "inline"
  /** The width (px) from which the page puts the panel beside the experiment. Below it, the panel opens full screen. */
  desktopFrom?: number
  className?: string
  testid?: string
}) {
  const headingId = useId()
  const tabsId = useId()
  const ref = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const expandButton = useRef<HTMLButtonElement | null>(null)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const desktop = useMediaQuery(`(min-width: ${desktopFrom}px)`)
  const hasTabs = tutor !== undefined
  const [tab, setTabState] = useState<PanelTab>("understand")
  const [wide, setWide] = useState(false) // the Expand control
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [placeholder, setPlaceholder] = useState<number | null>(null)
  const scrollTops = useRef<Record<PanelTab, number>>({ understand: 0, tutor: 0 })
  const [codeExpanded, setCodeExpandedState] = useState<string | null>(null)
  const [extend, setExtend] = useState(0)
  const setCodeExpanded = useCallback((id: string | null) => setCodeExpandedState(id), [])

  const onPhone = hasTabs && !desktop
  const covering = (wide && desktop) || (onPhone && phoneOpen) // the panel is over the page
  useScrollLock(covering)
  const vv = useVisualViewport(onPhone && phoneOpen)
  useFitToWindow(ref, desktop && layout === "sidebar" && !covering)

  // Each tab keeps its own reading position; switching restores it without touching the page.
  const setTab = (next: PanelTab) => {
    if (next === tab) return
    if (scrollRef.current) scrollTops.current[tab] = scrollRef.current.scrollTop
    setTabState(next)
  }
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollTops.current[tab]
  }, [tab])
  // Opening on a phone (display: none before) restores the position too.
  useLayoutEffect(() => {
    if (phoneOpen && scrollRef.current) scrollRef.current.scrollTop = scrollTops.current[tab]
  }, [phoneOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const openWide = () => {
    // Keep the column's height while the panel floats, so the page doesn't move underneath.
    setPlaceholder(ref.current?.offsetHeight ?? null)
    setWide(true)
    requestAnimationFrame(() => closeButton.current?.focus())
  }
  const closeWide = () => {
    setWide(false)
    setPlaceholder(null)
    requestAnimationFrame(() => expandButton.current?.focus())
  }
  const openPhone = (on: PanelTab, from: HTMLElement) => {
    opener.current = from
    setTabState(on)
    setPhoneOpen(true)
    requestAnimationFrame(() => closeButton.current?.focus())
  }
  const closePhone = () => {
    if (scrollRef.current) scrollTops.current[tab] = scrollRef.current.scrollTop
    setPhoneOpen(false)
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }

  // Escape: collapse expanded code first, then close the wide or full-screen view.
  useEffect(() => {
    if (!covering && !codeExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"][data-testid="checkpoint-dialog"]')) return // the checkpoint handles its own
      if (codeExpanded) { setCodeExpandedState(null); return }
      if (wide) closeWide()
      else if (phoneOpen) closePhone()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }) // re-bound each render: it reads the current state

  // Keep keyboard focus inside the panel while it covers the page.
  const trap = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!covering || e.key !== "Tab" || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // While code is expanded, the side panel grows left over the experiment so long lines fit.
  useLayoutEffect(() => {
    const el = ref.current
    if (!codeExpanded || !el || covering) { setExtend(0); return }
    const measure = () => {
      const { marginLeft, width } = el.style
      el.style.marginLeft = "0px"
      el.style.width = ""
      const by = extensionFor(el)
      el.style.marginLeft = marginLeft
      el.style.width = width
      setExtend(by)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [codeExpanded, covering])

  // Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    const next: PanelTab = e.key === "Home" ? "understand" : e.key === "End" ? "tutor" : tab === "understand" ? "tutor" : "understand"
    setTab(next)
    requestAnimationFrame(() => document.getElementById(`${tabsId}-${next}`)?.focus())
  }

  const sidebar = desktop && layout === "sidebar"
  const style: CSSProperties = {
    ...(extend && !covering ? { marginLeft: -extend, width: `calc(100% + ${extend}px)` } : {}),
    ...(onPhone && phoneOpen && vv ? { top: vv.top, height: vv.height } : {}),
  }
  const panel = (
    <section
      ref={ref}
      aria-labelledby={headingId}
      role={covering ? "dialog" : undefined}
      aria-modal={covering ? true : undefined}
      data-testid={testid}
      data-help-id="layout.explanation"
      data-panel-mode={covering ? (wide ? "expanded" : "fullscreen") : sidebar ? "sidebar" : "inline"}
      data-expanded={codeExpanded ? "true" : undefined}
      hidden={onPhone && !phoneOpen}
      onKeyDown={trap}
      style={style}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion shadow-companion",
        // Desktop beside the experiment: under the app bar, the window's height, never taller.
        !covering && sidebar && (hasTabs ? "sticky top-16 h-[var(--panel-h,calc(100dvh-5rem))] self-start" : "sticky top-16 max-h-[var(--panel-h,calc(100dvh-5rem))] self-start"),
        !covering && desktop && layout === "inline" && (hasTabs ? "h-[min(44rem,calc(100dvh-5rem))]" : "max-h-[min(44rem,calc(100dvh-5rem))]"),
        wide && desktop && "fixed inset-y-4 left-1/2 z-[55] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2",
        onPhone && phoneOpen && "fixed inset-x-0 top-0 z-[55] h-dvh rounded-none border-x-0",
        codeExpanded && !covering && "relative z-20",
        "transition-[margin,width] duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
    >
      <header className="flex flex-none items-start gap-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-label font-medium text-data">{label}</p>
          <h2 id={headingId} className="text-section font-semibold">{title}</h2>
        </div>
        {desktop && hasTabs && (wide
          ? <Button ref={closeButton} variant="outline" size="sm" className="h-11 flex-none bg-card" onClick={closeWide} data-testid="panel-close"><CollapseIcon className="size-4" /> Close</Button>
          : <Button ref={expandButton} variant="ghost" size="sm" className="h-11 flex-none" onClick={openWide} aria-label="Expand the explanation panel" data-testid="panel-expand"><ExpandIcon className="size-4" /> Expand</Button>)}
        {onPhone && <Button ref={closeButton} variant="outline" size="sm" className="h-11 flex-none bg-card" onClick={closePhone} data-testid="panel-close"><XmarkIcon className="size-4" /> Back to the experiment</Button>}
      </header>
      {hasTabs && (
        <div role="tablist" aria-label="Learning panel" className="mx-4 grid flex-none grid-cols-2 gap-1 rounded-lg bg-companion-callout p-1 sm:mx-6">
          <PanelTabButton id={`${tabsId}-understand`} controls={`${tabsId}-understand-panel`} selected={tab === "understand"} onSelect={() => setTab("understand")} onKeyDown={onTabKey}>
            <OpenBookIcon className="size-4" aria-hidden="true" /> Understand this step
          </PanelTabButton>
          <PanelTabButton id={`${tabsId}-tutor`} controls={`${tabsId}-tutor-panel`} selected={tab === "tutor"} onSelect={() => setTab("tutor")} onKeyDown={onTabKey} data-help-id="ai.ask">
            <ServerIcon className="size-4" aria-hidden="true" /> Ask your tutor
          </PanelTabButton>
        </div>
      )}
      {/* The one scrolling area. Scroll anchoring is off so new text below never moves what you're reading. */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 [overflow-anchor:none] sm:px-6" data-testid="panel-scroll" data-panel-scroll="">
          {hasTabs ? (
            <>
              <div id={`${tabsId}-understand-panel`} role="tabpanel" aria-labelledby={`${tabsId}-understand`} hidden={tab !== "understand"} className="flex flex-col gap-5" tabIndex={0}>{children}</div>
              <div id={`${tabsId}-tutor-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tutor`} hidden={tab !== "tutor"} className="flex flex-col gap-3" tabIndex={0}>
                {tutor!.target ? <TutorTranscript target={tutor!.target} active={tab === "tutor" && (!onPhone || phoneOpen)} /> : <div data-testid="tutor-off" className="rounded-lg bg-raised px-3.5 py-2.5 text-sm">{tutor!.off}</div>}
              </div>
            </>
          ) : <div className="flex flex-col gap-5">{children}</div>}
        </div>
      {hasTabs && tab === "tutor" && tutor!.target && (
        <div className="flex-none border-t border-companion-edge bg-companion px-4 py-3 sm:px-6" data-testid="panel-composer">
          <TutorComposer target={tutor!.target} />
        </div>
      )}
    </section>
  )

  return (
    <ExpandContext.Provider value={{ expanded: codeExpanded, setExpanded: setCodeExpanded }}>
      {onPhone && (
        <PhoneLauncher label={label} title={title} onOpen={openPhone} />
      )}
      {covering && <div className="fixed inset-0 z-[54] bg-black/30" aria-hidden="true" onClick={wide ? closeWide : closePhone} />}
      {wide && desktop && placeholder != null && <div style={{ height: placeholder }} aria-hidden="true" />}
      {panel}
    </ExpandContext.Provider>
  )
}

function PanelTabButton({ id, controls, selected, onSelect, onKeyDown, children, ...rest }: { id: string; controls: string; selected: boolean; onSelect: () => void; onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void; children: ReactNode; "data-help-id"?: string }) {
  return (
    <button id={id} type="button" role="tab" aria-selected={selected} aria-controls={controls} tabIndex={selected ? 0 : -1} onClick={onSelect} onKeyDown={onKeyDown} {...rest}
      className={cn("flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring",
        selected ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  )
}

/** On a narrow screen: where the learning panel would be, a clearly labelled way to open it full screen. */
function PhoneLauncher({ label, title, onOpen }: { label: string; title: ReactNode; onOpen: (tab: PanelTab, from: HTMLElement) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion p-4 shadow-companion" data-testid="panel-launcher">
      <div>
        <p className="text-label font-medium text-data">{label}</p>
        <p className="text-section font-semibold">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-auto min-h-11 justify-start whitespace-normal bg-card text-left" onClick={(e) => onOpen("understand", e.currentTarget)}><OpenBookIcon className="size-4" /> Understand this step</Button>
        <Button variant="outline" className="h-auto min-h-11 justify-start whitespace-normal bg-card text-left" onClick={(e) => onOpen("tutor", e.currentTarget)}><ServerIcon className="size-4" /> Ask your tutor</Button>
      </div>
    </div>
  )
}

/** The one next action in an explanation: a stronger tint and a labelled icon. */
export function TryThis({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-companion-callout p-4" data-testid="try-this">
      <LightBulbIcon className="mt-0.5 size-5 flex-none text-data" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-semibold">Try this</h3>
        <div>{children}</div>
      </div>
    </div>
  )
}
