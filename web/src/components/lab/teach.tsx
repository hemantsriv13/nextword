// The Lab's teaching layer, shared by every workspace:
// - a clickable flow diagram (goal → input → operation → output → what uses it next), and
// - a guided walkthrough with three levels: plain words, the calculation, and the code.
// The walkthrough card appears inside the panel it explains, so the words sit beside the thing
// they describe. It never changes the experiment: it only reads what the workspace shows.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { ArrowRightIcon, NavArrowDownIcon, NavArrowLeftIcon, NavArrowRightIcon, PlayIcon, RefreshDoubleIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { findTerm } from "@/content/glossary"
import { usePrefersReducedMotion } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Term } from "./glossary"
import { Source, type SourceKind } from "./source"

export type NodeKind = "input" | "operation" | "output"

/** One box in a workspace's flow diagram. Every field is shown when the box is selected. */
export interface FlowNode {
  id: string
  label: string
  kind: NodeKind
  /** The panel (Panel id) that shows this step. */
  target?: string
  /** For workspaces with tabs: the tab that holds the target panel. */
  tab?: string
  /** What the arrow leaving this box carries to the next one. */
  carries?: string
  goesIn: ReactNode
  happens: ReactNode
  why: ReactNode
  comesOut: ReactNode
  next: ReactNode
  tryIt?: ReactNode
}

export interface TourStep {
  /** The panel this step explains. */
  target: string
  /** Said when the panel isn't on the page yet (for example, before the first run). */
  missing?: ReactNode
  title: string
  plain: ReactNode
  /** Terms named in this step, each with the job it does here. */
  terms?: { id: string; role: ReactNode }[]
  /** For workspaces with tabs: the tab that must be open for this step. */
  tab?: string
}

export interface Guide {
  /** The question the workspace helps answer. */
  question: ReactNode
  /** Which parts are your engine and which are separate demonstrations. */
  scope: ReactNode
  sources: SourceKind[]
  nodes: FlowNode[]
  tour: TourStep[]
}

export type Level = "walk" | "calc" | "code"

const LEVELS: { id: Level; label: string }[] = [
  { id: "walk", label: "Walk me through it" },
  { id: "calc", label: "Show the calculation" },
  { id: "code", label: "Show the code" },
]

const KIND_LABEL: Record<NodeKind, string> = { input: "Input", operation: "Operation", output: "Output" }

interface TeachValue {
  guide: Guide
  selectedNode: string | null
  selectNode: (id: string | null) => void
  tour: { index: number; level: Level } | null
  startTour: () => void
  goTo: (index: number) => void
  setLevel: (level: Level) => void
  exitTour: () => void
  /** Increments on every Replay, so a step's own animation can restart. */
  replays: number
  replay: () => void
  /** Open the tab that holds a panel, then scroll to it. */
  reveal: (target: string, tab?: string) => void
  startRef: RefObject<HTMLButtonElement | null>
  guideRef: RefObject<HTMLElement | null>
}

const TeachContext = createContext<TeachValue | null>(null)

/** Wraps one workspace. `onStep` lets a workspace with tabs open the tab a step needs. */
export function Teach({ guide, onStep, children }: { guide: Guide; onStep?: (where: { tab?: string }) => void; children: ReactNode }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(guide.nodes[0]?.id ?? null)
  const [tour, setTour] = useState<{ index: number; level: Level } | null>(null)
  const [replays, setReplays] = useState(0)
  const startRef = useRef<HTMLButtonElement | null>(null)
  const guideRef = useRef<HTMLElement | null>(null)
  const onStepRef = useRef(onStep)
  useEffect(() => { onStepRef.current = onStep })

  const goTo = useCallback((index: number) => {
    const step = guide.tour[index]
    if (!step) return
    onStepRef.current?.(step)
    setTour((t) => ({ index, level: t?.level ?? "walk" }))
  }, [guide.tour])

  const value = useMemo<TeachValue>(() => ({
    guide,
    selectedNode,
    selectNode: setSelectedNode,
    tour,
    startTour: () => goTo(0),
    goTo,
    setLevel: (level) => setTour((t) => (t ? { ...t, level } : t)),
    exitTour: () => {
      setTour(null)
      requestAnimationFrame(() => startRef.current?.focus())
    },
    replays,
    replay: () => { setReplays((n) => n + 1); goTo(0) },
    reveal: (target, tab) => {
      onStepRef.current?.({ tab })
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToTarget(target, smooth)))
    },
    startRef,
    guideRef,
  }), [guide, selectedNode, tour, goTo, replays])

  const step = tour ? guide.tour[tour.index] : undefined
  return (
    <TeachContext.Provider value={value}>
      {children}
      <p className="sr-only" aria-live="polite">{step ? `Walkthrough, ${tour!.index + 1} of ${guide.tour.length}: ${step.title}` : ""}</p>
    </TeachContext.Provider>
  )
}

export function useTeach() {
  return useContext(TeachContext)
}

/** What a panel needs to know: is it highlighted, and is the walkthrough on one of its steps? */
export function useTeachTarget(id: string | undefined) {
  const t = useTeach()
  if (!t || !id) return { highlighted: false, step: undefined, flowNode: undefined }
  const step = t.tour ? t.guide.tour[t.tour.index] : undefined
  const onStep = step?.target === id ? step : undefined
  const node = !t.tour ? t.guide.nodes.find((n) => n.id === t.selectedNode && n.target === id) : undefined
  return { highlighted: !!onStep || !!node, step: onStep, flowNode: node }
}

function scrollToTarget(id: string, smooth: boolean) {
  const el = document.querySelector<HTMLElement>(`[data-teach="${CSS.escape(id)}"]`)
  el?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
  return el
}

// ----------------------------------------------------------------------------- the guide panel

/** The top of a workspace: its question, its flow diagram, and the way into the walkthrough. */
export function WorkspaceGuide() {
  const t = useTeach()
  const open = useLab((s) => s.prefs.guideOpen ?? true)
  const headingId = useId()
  const step = t?.tour ? t.guide.tour[t.tour.index] : undefined
  const [missing, setMissing] = useState<string | null>(null)
  useEffect(() => {
    if (!step) return
    // The step's panel may not exist yet (no run so far). Then the step is shown here instead.
    const id = requestAnimationFrame(() => setMissing(document.querySelector(`[data-teach="${CSS.escape(step.target)}"]`) ? null : step.target))
    return () => cancelAnimationFrame(id)
  }, [step, t?.replays])
  if (!t) return null
  // Read the plain values and the refs separately, so no ref is read while rendering.
  const { guide, tour, selectedNode, selectNode, startTour, exitTour, startRef, guideRef } = t
  const node = guide.nodes.find((n) => n.id === selectedNode)
  return (
    <section ref={guideRef} aria-labelledby={headingId} className="scroll-mt-16 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-base font-semibold">How this workspace works</h2>
          {guide.sources.map((s) => <Source key={s} kind={s} />)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button ref={startRef} variant="outline" onClick={tour ? exitTour : startTour} aria-pressed={!!tour}>
            {tour ? <XmarkIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {tour ? "Exit the walkthrough" : "Read and watch"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => actions.setPref("guideOpen", !open)} aria-expanded={open}>
            <NavArrowDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
            {open ? "Hide the flow" : "Show the flow"}
          </Button>
        </div>
      </div>
      {step && missing === step.target && (
        <div className="mt-4">
          <TourCard step={step} fallback={step.missing ?? "This view appears once the experiment has been run. Run it with the button in the settings panel, then come back to this step."} />
        </div>
      )}
      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="max-w-3xl text-[15px] leading-relaxed"><span className="font-medium">The question it answers:</span> {guide.question}</p>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{guide.scope}</p>
          <FlowDiagram nodes={guide.nodes} selected={selectedNode} onSelect={selectNode} />
          {node && <NodeDetail node={node} />}
        </div>
      )}
    </section>
  )
}

/** The flow diagram: boxes in order, each arrow labelled with what it carries. */
export function FlowDiagram({ nodes, selected, onSelect }: { nodes: FlowNode[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Flow of this workspace">
      <ol className="flex flex-wrap items-stretch gap-y-3">
        {nodes.map((n, i) => {
          const sel = n.id === selected
          return (
            <li key={n.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                aria-pressed={sel}
                aria-label={`${KIND_LABEL[n.kind]}: ${n.label}${n.carries && i < nodes.length - 1 ? `, passes on ${n.carries}` : ""}`}
                data-kind={n.kind}
                className={cn(
                  "flex min-h-11 flex-col items-start justify-center px-3 py-1.5 text-left text-sm transition-colors",
                  // Shape carries the kind as well as the label: inputs are square, operations are
                  // pills, outputs have a heavy edge.
                  n.kind === "input" && "rounded-sm border border-dashed border-foreground/50 bg-card",
                  n.kind === "operation" && "rounded-full bg-secondary px-4",
                  n.kind === "output" && "rounded-md border-2 border-foreground/70 bg-card",
                  sel ? "bg-data-soft outline-2 outline-offset-2 outline-data" : "hover:bg-accent",
                )}
              >
                <span className="text-[12px] text-muted-foreground">{KIND_LABEL[n.kind]}</span>
                <span className="font-medium leading-snug">{n.label}</span>
              </button>
              {i < nodes.length - 1 && (
                <span className="flex items-center gap-1 px-2 text-[12px] text-muted-foreground" aria-hidden="true">
                  <ArrowRightIcon className="size-4 flex-none" />
                  {n.carries && <span className="max-w-[9rem] leading-tight">{n.carries}</span>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function NodeDetail({ node }: { node: FlowNode }) {
  const t = useTeach()!
  const rows: [string, ReactNode][] = [
    ["What goes in", node.goesIn],
    ["What happens to it", node.happens],
    ["Why this is needed", node.why],
    ["What comes out", node.comesOut],
    ["Where it goes next", node.next],
  ]
  if (node.tryIt) rows.push(["What to change, and what to watch", node.tryIt])
  return (
    <div className="rounded-md bg-raised p-4" aria-live="polite">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{KIND_LABEL[node.kind]}: {node.label}</h3>
        {node.target && (
          <Button size="sm" variant="outline" onClick={() => t.reveal(node.target!, node.tab)}>
            Show it in the workspace <NavArrowDownIcon className="size-4" />
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] leading-relaxed md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[13px] font-medium text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!t.tour && t.guide.nodes.length > 1 && <span className="sr-only">Selected step explained</span>}
    </div>
  )
}

// ----------------------------------------------------------------------------- inside a panel

export interface PanelTeach {
  /** The calculation with this panel's current values: symbols defined, steps shown, meaning stated. */
  calc?: ReactNode
  /** The relevant code (EngineCode / SimCode), or clearly labelled pseudocode. */
  code?: ReactNode
}

/** Shown at the top of a panel the flow diagram or the walkthrough points at. */
export function TeachInPanel({ id, teach }: { id: string; teach?: PanelTeach }) {
  const t = useTeach()
  const { step, flowNode } = useTeachTarget(id)
  const reduced = usePrefersReducedMotion()
  if (!t) return null
  if (step) return <TourCard step={step} teach={teach} />
  if (flowNode) {
    return (
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-data-soft/60 px-3 py-2 text-sm">
        <span>Selected in the flow: <span className="font-medium">{flowNode.label}</span>.</span>
        <button type="button" className="underline underline-offset-2" onClick={() => t.guideRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })}>
          Back to its explanation
        </button>
      </p>
    )
  }
  return null
}

function TourCard({ step, teach, fallback }: { step: TourStep; teach?: PanelTeach; fallback?: ReactNode }) {
  const t = useTeach()!
  const reduced = usePrefersReducedMotion()
  const heading = useRef<HTMLHeadingElement>(null)
  const { index, level } = t.tour!
  const total = t.guide.tour.length
  const last = index === total - 1

  useEffect(() => {
    // A new step is a new place on the page: bring it into view and move focus to its heading.
    const el = fallback ? null : scrollToTarget(step.target, !reduced)
    if (el || fallback) heading.current?.focus({ preventScroll: !!el })
  }, [index, step.target, reduced, t.replays, fallback])

  const body = level === "walk" ? step.plain
    : level === "calc" ? teach?.calc ?? <p className="text-muted-foreground">Nothing is calculated at this step; it moves information along. The words above say what it carries.</p>
    : teach?.code ?? <p className="text-muted-foreground">No code of its own runs at this step. The neighbouring steps show the code that produces and uses its values.</p>

  return (
    <div
      role="region"
      aria-label="Walkthrough"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); t.exitTour() } }}
      className="mb-5 flex flex-col gap-3 rounded-md bg-data-soft/60 p-4"
      data-testid="tour-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 ref={heading} tabIndex={-1} className="text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{step.title}</h3>
        <span className="num text-sm text-muted-foreground">{index + 1} of {total}</span>
      </div>
      <div role="radiogroup" aria-label="How much detail" className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-md bg-card p-0.5">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            tabIndex={level === l.id ? 0 : -1}
            onClick={() => t.setLevel(l.id)}
            onKeyDown={(e) => {
              const i = LEVELS.findIndex((x) => x.id === level)
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); t.setLevel(LEVELS[(i + 1) % LEVELS.length].id) }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); t.setLevel(LEVELS[(i + LEVELS.length - 1) % LEVELS.length].id) }
            }}
            className={cn("h-8 rounded-[5px] px-3 text-sm", level === l.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {l.label}
          </button>
        ))}
      </div>
      {fallback && <p className="max-w-3xl rounded-md bg-card px-3 py-2 text-sm">{fallback}</p>}
      <div className="flex max-w-3xl flex-col gap-2 text-[15px] leading-relaxed" data-testid="tour-body">{body}</div>
      {level === "walk" && step.terms && step.terms.length > 0 && (
        <details className="max-w-3xl">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">Words used in this step ({step.terms.length})</summary>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[14px]">
            {step.terms.map((term) => {
              const entry = findTerm(term.id)
              return (
                <li key={term.id}>
                  <Term id={term.id} className="font-medium">{entry?.term}</Term>: {entry?.plain} <span className="text-muted-foreground">Here: {term.role}</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => t.goTo(index - 1)} disabled={index === 0}>
          <NavArrowLeftIcon className="size-4" /> Back
        </Button>
        {last ? (
          <Button size="sm" onClick={t.exitTour}>Finish the walkthrough</Button>
        ) : (
          <Button size="sm" onClick={() => t.goTo(index + 1)}>Next: {t.guide.tour[index + 1].title} <NavArrowRightIcon className="size-4" /></Button>
        )}
        <Button variant="ghost" size="sm" onClick={t.replay}><RefreshDoubleIcon className="size-4" /> Replay</Button>
        <Button variant="ghost" size="sm" onClick={t.exitTour}><XmarkIcon className="size-4" /> Exit</Button>
        <span className="text-[13px] text-muted-foreground">Esc also exits. Your settings and results stay as they are.</span>
      </div>
    </div>
  )
}

/** A walkthrough target inside a panel, for steps that explain one part of a larger view. */
export function TeachSpot({ id, teach, children, className }: { id: string; teach?: PanelTeach; children: ReactNode; className?: string }) {
  const { highlighted } = useTeachTarget(id)
  return (
    <div data-teach={id} data-highlighted={highlighted || undefined} className={cn("scroll-mt-16 rounded-md", highlighted && "outline-2 outline-offset-4 outline-data", className)}>
      <TeachInPanel id={id} teach={teach} />
      {children}
    </div>
  )
}

// ----------------------------------------------------------------------------- small helpers

/** A labelled calculation line: the symbol, what it stands for, and its value. */
export function Symbols({ rows }: { rows: [ReactNode, ReactNode, ReactNode?][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
      {rows.map(([sym, meaning, value], i) => (
        <div key={i} className="contents">
          <dt className="tok text-right">{sym}</dt>
          <dd>{meaning}{value !== undefined && <> = <span className="num font-medium">{value}</span></>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Pseudocode, always labelled as such, for steps whose real code is spread over several files. */
export function Pseudocode({ children, note }: { children: string; note?: ReactNode }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-[13px] text-muted-foreground">Pseudocode, not the real source{note && <>: {note}</>}</figcaption>
      <pre className="overflow-auto rounded-md bg-raised p-3 text-[12.5px] leading-[1.55]"><code className="tok">{children}</code></pre>
    </figure>
  )
}
