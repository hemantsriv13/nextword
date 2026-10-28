// The teaching companion: the panel beside an experiment that explains it. One tinted sheet with a
// teal top edge, its own header, and the explanation inside. Shared by the Bigram journey and by every
// workspace's explanation column, so the two read as the same kind of thing.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { LightBulbIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

const HEADER_OFFSET = 80 // the app bar plus breathing room, in px

/**
 * Sticky only while the whole panel fits on screen. A taller panel scrolls with the page instead,
 * so its end is always reachable without a second scrollbar inside it.
 */
function useFitsViewport() {
  const ref = useRef<HTMLElement | null>(null)
  const [fits, setFits] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setFits(el.offsetHeight <= window.innerHeight - HEADER_OFFSET)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    window.addEventListener("resize", check)
    return () => { ro.disconnect(); window.removeEventListener("resize", check) }
  }, [])
  return { ref, fits }
}

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

export function ExplanationPanel({ label = "Step explained", title, children, sticky = true, className, testid }: {
  /** The small line above the title. */
  label?: string
  /** What is being explained: the lesson step, or the workspace. */
  title: ReactNode
  children: ReactNode
  sticky?: boolean
  className?: string
  testid?: string
}) {
  const headingId = useId()
  const { ref, fits } = useFitsViewport()
  const [expanded, setExpandedState] = useState<string | null>(null)
  const [extend, setExtend] = useState(0)
  const setExpanded = useCallback((id: string | null) => setExpandedState(id), [])

  // While code is expanded, the panel grows left over the experiment so long lines fit. It is the
  // same sheet, only wider; collapsing puts it back.
  useLayoutEffect(() => {
    const el = ref.current
    if (!expanded || !el) { setExtend(0); return }
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
  }, [expanded, ref])

  // Escape collapses the expanded code.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) setExpandedState(null) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expanded])

  const wide: CSSProperties | undefined = extend ? { marginLeft: -extend, width: `calc(100% + ${extend}px)` } : undefined
  const isSticky = sticky && fits && !expanded
  return (
    <ExpandContext.Provider value={{ expanded, setExpanded }}>
    <section
      ref={ref}
      aria-labelledby={headingId}
      data-testid={testid}
      data-help-id="layout.explanation"
      data-sticky={isSticky ? "true" : undefined}
      data-expanded={expanded ? "true" : undefined}
      style={wide}
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion p-5 shadow-companion sm:p-6",
        isSticky && "lg:sticky lg:top-16 lg:self-start",
        expanded && "relative z-20",
        "transition-[margin,width] duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
    >
      <header className="flex flex-col gap-0.5">
        <p className="text-label font-medium text-data">{label}</p>
        <h2 id={headingId} className="text-section font-semibold">{title}</h2>
      </header>
      {children}
    </section>
    </ExpandContext.Provider>
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
