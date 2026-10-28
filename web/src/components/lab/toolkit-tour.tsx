// Toolkit tours: short, optional tours across pages. Each step points at a real part of the Lab by its
// stable id (data-help-id or data-teach), with an outline rather than an overlay, and a small card
// placed beside it. Progress is saved in this browser so a tour can be resumed; finishing one records
// nothing about understanding. Following a tour never runs an experiment or changes your inputs.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { NavArrowLeftIcon, NavArrowRightIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { TOURS, type ControlHelp, type ToolkitTour } from "@/content/help"
import { navigate, useMediaQuery, useRoute } from "@/lib/hooks"
import { actions, getState, useLab } from "@/lib/store"
import { helpFor, place, useHelp, whenPageReady, whenPresent } from "./help"

interface TourValue {
  active: { tour: ToolkitTour; index: number } | null
  start: (id: ToolkitTour["id"], from?: number) => void
  stop: () => void
}

const TourContext = createContext<TourValue | null>(null)
export const useToolkitTour = () => useContext(TourContext)

const selectorFor = (id: string) => `[data-help-id="${CSS.escape(id)}"], [data-teach="${CSS.escape(id)}"]`

export function ToolkitTourProvider({ children }: { children: ReactNode }) {
  const saved = useLab((s) => s.prefs.tour ?? null)
  const active = saved ? (() => { const tour = TOURS.find((t) => t.id === saved.id); return tour ? { tour, index: Math.min(saved.index, tour.steps.length - 1) } : null })() : null

  const goTo = useCallback((tour: ToolkitTour, index: number) => {
    actions.setPref("tour", { id: tour.id, index })
    actions.setPref("tourPositions", { ...(savedPositions()), [tour.id]: index })
  }, [])

  const value = useMemo<TourValue>(() => ({
    active,
    start: (id, from = 0) => { const tour = TOURS.find((t) => t.id === id)!; goTo(tour, from) },
    stop: () => actions.setPref("tour", null),
  }), [active, goTo])

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && <TourCard key={`${active.tour.id}:${active.index}`} tour={active.tour} index={active.index} onGo={(i) => goTo(active.tour, i)} onStop={value.stop} />}
    </TourContext.Provider>
  )
}

// The store's current positions, read at the moment of saving.
const savedPositions = (): Record<string, number> => getState().prefs.tourPositions ?? {}

function TourCard({ tour, index, onGo, onStop }: { tour: ToolkitTour; index: number; onGo: (i: number) => void; onStop: () => void }) {
  const step = tour.steps[index]
  const help = useHelp()
  const { route } = useRoute()
  const wide = useMediaQuery("(min-width: 768px)")
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [missing, setMissing] = useState(false)
  const [more, setMore] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const last = index === tour.steps.length - 1

  // Go to the step's page, open what it needs, and find its target. Nothing is run or changed.
  useEffect(() => {
    let alive = true
    if (route !== step.route) { navigate(step.route); return }
    const entry = helpFor(step.target)
    void (async () => {
      // The page may still be loading: open its tab or stage only once it can hear the request.
      await whenPageReady()
      if (!alive) return
      help?.reveal({ ...(entry ?? ({ id: step.target, label: step.title, route: step.route, where: "", does: "", when: "", effect: "view" } as ControlHelp)), reveal: step.reveal ?? entry?.reveal })
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      let el = await whenPresent(selectorFor(step.target), 60)
      // On a phone the sidebar is behind the menu button: point at that instead.
      if (!el && step.target === "shell.nav") el = await whenPresent(selectorFor("shell.menu"), 5)
      if (!alive) return
      if (!el) { setMissing(true); return }
      setTarget(el)
      el.scrollIntoView?.({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    })()
    return () => { alive = false }
  }, [step, route, help])

  useEffect(() => {
    if (!target) return
    target.setAttribute("data-tour-spot", "")
    return () => target.removeAttribute("data-tour-spot")
  }, [target])

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [index, tour.id])

  useLayoutEffect(() => {
    const box = card.current
    if (!box || !wide) { setPos(null); return }
    const update = () => {
      const view = { width: window.innerWidth, height: window.innerHeight }
      const size = { width: box.offsetWidth, height: box.offsetHeight }
      if (!target?.isConnected) { setPos({ top: view.height - size.height - 16, left: view.width - size.width - 16 }); return }
      const r = target.getBoundingClientRect()
      // A wide target (a navigator, a panel) leaves no side to stand beside: centring the card under it
      // would cover the results below, so it waits in the bottom corner instead.
      if (r.width > view.width * 0.45) { setPos({ top: view.height - size.height - 16, left: view.width - size.width - 16 }); return }
      setPos(place({ top: r.top, left: r.left, width: r.width, height: r.height }, size, view, 14, 12))
    }
    update()
    const t = window.setTimeout(update, 450) // after a smooth scroll settles
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => { clearTimeout(t); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update) }
  }, [target, wide, more, missing, index])

  const finish = () => { actions.setPref("tourPositions", { ...savedPositions(), [tour.id]: 0 }); onStop() }

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby="toolkit-tour-title"
      data-testid="toolkit-tour"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onStop() } }}
      className={wide
        ? "fixed z-[58] flex w-[min(24rem,calc(100vw-24px))] flex-col gap-3 rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion p-5 text-foreground shadow-lg"
        : "fixed inset-x-2 bottom-2 z-[58] flex max-h-[50vh] flex-col gap-3 overflow-y-auto rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion p-4 text-foreground shadow-lg"}
      style={wide ? (pos ? { top: pos.top, left: pos.left } : { bottom: 16, right: 16 }) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-medium text-data" data-testid="tour-progress">{tour.title} · {index + 1} of {tour.steps.length}</p>
          <h2 id="toolkit-tour-title" ref={heading} tabIndex={-1} className="text-section font-semibold outline-none">{step.title}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Skip the tour (you can resume it from the Toolkit Guide)" onClick={onStop}><XmarkIcon className="size-4" /></Button>
      </div>
      <p className="sr-only" aria-live="polite">{`Tour step ${index + 1} of ${tour.steps.length}: ${step.title}`}</p>
      {missing && (
        <p className="rounded-lg bg-src-sim px-3 py-2 text-sm text-src-sim-ink" role="status">
          This part isn't on the screen right now{route === step.route ? " (it may appear after a run, or on a wider window)" : ""}. You can read the step here, then go on.
        </p>
      )}
      <p className="text-prose">{step.body}</p>
      {step.more && (
        <div>
          <button type="button" className="text-sm font-medium underline underline-offset-2" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Explain less" : "Explain more"}</button>
          {more && <p className="mt-2 text-prose">{step.more}</p>}
        </div>
      )}
      {step.action && (
        <Button variant="outline" size="sm" className="self-start bg-card" onClick={() => {
          if (step.action!.help) help?.open(step.action!.help)
          else if (step.action!.open) navigate(step.action!.open)
        }}>{step.action.label}</Button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="bg-card" onClick={() => onGo(index - 1)} disabled={index === 0}><NavArrowLeftIcon className="size-4" /> Back</Button>
        {last
          ? <Button size="sm" className="bg-action text-action-ink hover:bg-action/90" onClick={finish}>Finish the tour</Button>
          : <Button size="sm" className="bg-action text-action-ink hover:bg-action/90" onClick={() => onGo(index + 1)}>Next <NavArrowRightIcon className="size-4" /></Button>}
        <Button variant="ghost" size="sm" onClick={onStop}>Skip tour</Button>
      </div>
      <p className="text-label text-muted-foreground">Times are estimates. Finishing a tour is not recorded as understanding anything.</p>
    </div>,
    document.body,
  )
}
