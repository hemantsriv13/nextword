import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { NavArrowLeftIcon, NavArrowRightIcon, PauseIcon, PlayIcon, RefreshDoubleIcon, SkipNextIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tok } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { Term } from "@/components/lab/glossary"
import { ErrorNote, LoadingRows, Note, NumberField, Segmented } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { ExplanationPanel, TryThis } from "@/components/lab/explanation"
import { CheckpointStatus, useCheckpoints } from "@/components/lab/checkpoint"
import { spotlight, useHelpReveal } from "@/components/lab/help"
import { JOURNEY_CHECKPOINTS } from "@/lib/checkpoints"
import { LevelSwitch, Symbols, type Level } from "@/components/lab/teach"
import { findTerm } from "@/content/glossary"
import { api, type Generation, type Journey as JourneyData } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { useSnapshotRun } from "@/lib/evaluation"
import { fmt, useMediaQuery, usePrefersReducedMotion } from "@/lib/hooks"
import { contextBefore, engineRow, intervals, JOURNEY_DEFAULTS, journeyChanges, landing, pairOccurrences, stepAgrees, topPairs, type JourneyConfig } from "@/lib/journey"
import { cn } from "@/lib/utils"
import { charTokens, visible } from "@/sim/tokenize"
import { InfoTip } from "@/components/lab/info-tip"

const MAX_JOURNEY_CHARS = 20_000
type Step = Generation["steps"][number]
type Run = { config: JourneyConfig; result: JourneyData }
type Mode = "guided" | "explore"

/** The lesson's stages, in teaching order. This is the order to learn them in, not a dependency graph. */
export const STAGES = [
  { id: "text", label: "Training text" },
  { id: "count", label: "Count pairs" },
  { id: "context", label: "Read the context" },
  { id: "probs", label: "Calculate probabilities" },
  { id: "sample", label: "Sample a character" },
  { id: "repeat", label: "Append and repeat" },
] as const
type StageId = (typeof STAGES)[number]["id"]

/** A character as the journey shows it: spaces and line breaks get a visible symbol. */
function Ch({ c }: { c: string }) {
  return <>{c === " " ? "␣" : c === "\n" ? "↵" : c === "\t" ? "⇥" : c}</>
}
const q = (c: string) => `‘${visible(c)}’`

// ----------------------------------------------------------------------------- page

export default function Journey() {
  const { corpora } = useCorpora()
  const [form, setForm] = useState<JourneyConfig>(JOURNEY_DEFAULTS)
  const [mode, setMode] = useState<Mode>("guided")
  const [stage, setStage] = useState(0)
  const [editing, setEditing] = useState(false)
  useHelpReveal((r) => {
    if (r.section === "inputs") setEditing(true)
    if (r.mode) setMode(r.mode)
    if (r.stage !== undefined) { setMode((m) => (r.mode ?? m)); setStage(r.stage) }
  })
  const { run, pending, error, start } = useSnapshotRun(api.journey)
  // The calm path: an example run is ready as soon as the page opens. It only reads the engine.
  useEffect(() => { void start(JOURNEY_DEFAULTS) }, [start])

  const choices = (corpora ?? []).filter((c) => c.chars <= MAX_JOURNEY_CHARS)
  const changed = run ? journeyChanges(run.config, form) : []
  const promptOk = charTokens(form.prompt).length > 0

  return (
    <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6 lg:px-8 lg:pt-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-[1_1_30rem]">
            <h1 className="text-lesson font-semibold sm:text-page">Bigram journey</h1>
            <p className="measure mt-2 text-prose text-muted-foreground">Follow one real run of your engine, from a training text to each character it writes, and see where every number comes from.</p>
          </div>
          <Segmented label="How to view the lesson" helpId="journey.mode" value={mode} onChange={setMode} options={[{ value: "guided", label: "Guided lesson" }, { value: "explore", label: "Explore all" }]} />
        </div>

        <RunSummary run={run} pending={!!pending} editing={editing} onEdit={() => setEditing(!editing)} />

        {editing && (
          <section aria-labelledby="j-inputs-h" className="rounded-xl bg-raised p-5" data-testid="journey-inputs">
            <h2 id="j-inputs-h" className="sr-only">Inputs for the run</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto_auto] xl:items-end">
              <div className="flex flex-col gap-2">
                <span id="j-corpus" className="text-sm font-medium">Training text</span>
                <Select value={form.corpus} onValueChange={(v) => setForm({ ...form, corpus: String(v) })} items={choices.map((c) => ({ value: c.id, label: c.name }))}>
                  <SelectTrigger aria-labelledby="j-corpus" className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(choices.length ? choices : [{ id: "example", name: "Example passage", chars: 69 }]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} <span className="num text-muted-foreground">({fmt.n(c.chars)} chars)</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-0.5"><label htmlFor="j-prompt-in" className="text-sm font-medium">Prompt</label><InfoTip id="journey.prompt" /></span>
                <input id="j-prompt-in" data-help-id="journey.prompt" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
              </div>
              <NumberField id="j-len" label="Characters" value={form.length} min={1} max={40} onChange={(v) => setForm({ ...form, length: v })} width="w-20" />
              <NumberField id="j-seed" helpId="journey.seed" label={<Term id="seed">Seed</Term>} value={form.seed} min={0} max={4294967295} onChange={(v) => setForm({ ...form, seed: v })} />
              <Button className="bg-action text-action-ink hover:bg-action/90" data-help-id="journey.run" onClick={() => start(form)} disabled={!!pending || !promptOk}>{pending ? "Running…" : "Run the journey"}</Button>
            </div>
            <p className="mt-3 text-label text-muted-foreground">Texts over {fmt.n(MAX_JOURNEY_CHARS)} characters are left out, because the lesson shows the whole text. Running asks your engine for a new snapshot; nothing else on this page does.</p>
          </section>
        )}
        {error && <ErrorNote error={error} onRetry={() => start(form)} />}
        {run && changed.length > 0 && (
          <Note tone="warning">You changed the {changed.join(", ")}. The lesson still explains the earlier run shown above. Press Run the journey to recompute it with the new inputs.</Note>
        )}
      </header>

      {!run ? (pending ? <LoadingRows rows={8} label="Asking your engine" /> : null) : (
        <RunView
          key={`${run.config.corpus}|${run.config.prompt}|${run.config.length}|${run.config.seed}|${run.result.corpus.fingerprint}`}
          run={run}
          stale={changed.length > 0}
          mode={mode}
          stage={stage}
          setStage={setStage}
        />
      )}
    </div>
  )
}

function RunSummary({ run, pending, editing, onEdit }: { run: Run | null; pending: boolean; editing: boolean; onEdit: () => void }) {
  if (!run) return pending ? <p className="text-label text-muted-foreground">Asking your engine for an example run…</p> : null
  const c = run.config
  const g = run.result.generation
  return (
    <div className="flex flex-col gap-2" data-testid="run-summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-prose">
        <Source kind="model" />
        <span>{run.result.corpus.name}, prompt <span className="tok">“{c.prompt}”</span>, seed <span className="num">{c.seed}</span>, {g.steps.length} of {c.length} characters{g.stopped ? " (stopped early)" : ""}.</span>
        <Button variant="ghost" size="sm" data-help-id="journey.change-inputs" onClick={onEdit} aria-expanded={editing}>{editing ? "Hide the inputs" : "Change the inputs"}</Button>
      </div>
      <details className="group text-label" data-testid="run-details" data-help-id="journey.details">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">Run details and provenance</summary>
        <dl className="mt-2 grid max-w-3xl grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Training text</dt><dd><span className="tok">{run.result.corpus.file}</span>, {fmt.n(run.result.corpus.chars)} characters, fingerprint <span className="tok">{run.result.corpus.fingerprint}</span></dd>
          <dt className="text-muted-foreground">Engine</dt><dd className="tok">{g.modelVersion}</dd>
          <dt className="text-muted-foreground">Request</dt><dd>one <span className="tok">/api/journey</span> request: the text, its count table and the run are read together, so they always belong to the same snapshot</dd>
          <dt className="text-muted-foreground">Functions</dt><dd><span className="tok">tokenize</span>, <span className="tok">count_bigrams</span>, <span className="tok">next_token_probabilities</span>, <span className="tok">sample_next</span> and <span className="tok">generate_steps</span> in <span className="tok">nextword/bigram.py</span></dd>
          <dt className="text-muted-foreground">Random draws</dt><dd><span className="tok">random.Random({c.seed})</span>; replaying or switching views here draws nothing new</dd>
        </dl>
      </details>
    </div>
  )
}

// ----------------------------------------------------------------------------- one run, two views

interface Selection {
  pair: { a: string; b: string }
  setPair: (p: { a: string; b: string }) => void
  context: string
  setContext: (c: string) => void
  sel: number
  setSel: (i: number) => void
  revealed: number
  setRevealed: (n: number) => void
  replay: number
}

function RunView({ run, stale, mode, stage, setStage }: { run: Run; stale: boolean; mode: Mode; stage: number; setStage: (i: number) => void }) {
  const { text, table, generation: g } = run.result
  const chars = useMemo(() => charTokens(text), [text])
  const first = g.steps[0]
  // Selections live here, above both views, so switching Guided ↔ Explore keeps them.
  const [pair, setPair] = useState<{ a: string; b: string }>(first ? { a: first.context, b: first.token } : topPairs(table, 1).map((p) => ({ a: p.a, b: p.b }))[0] ?? { a: chars[0], b: chars[1] })
  const [context, setContext] = useState(first?.context ?? chars[0])
  const [sel, setSel] = useState(0)
  const [revealed, setRevealed] = useState(Math.min(1, g.steps.length))
  const [replay, setReplay] = useState(0)
  const s: Selection = { pair, setPair, context, setContext, sel, setSel, revealed, setRevealed, replay }

  if (mode === "explore") {
    return (
      <div className="flex flex-col gap-14" data-testid="explore-view">
        <section aria-labelledby="j-process-h" className="flex flex-col gap-3">
          <h2 id="j-process-h" className="text-section font-semibold">How the model's information flows</h2>
          <ProcessDiagram active={[]} layout="auto" onSelect={(i) => document.getElementById(`stage-${STAGES[i].id}`)?.scrollIntoView({ block: "start" })} />
        </section>
        {STAGES.map((st, i) => (
          <section key={st.id} id={`stage-${st.id}`} aria-labelledby={`stage-${st.id}-h`} className="scroll-mt-16 flex flex-col gap-5">
            <h2 id={`stage-${st.id}-h`} className="flex items-baseline gap-3 text-lesson font-semibold"><span className="num text-muted-foreground">{i + 1}</span>{st.label}</h2>
            <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="min-w-0 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7"><StageCanvas id={st.id} run={run} s={s} /></div>
              <Explanation id={st.id} run={run} s={s} stale={stale} />
            </div>
          </section>
        ))}
      </div>
    )
  }
  return <Guided run={run} s={s} stale={stale} stage={stage} setStage={setStage} onReplay={() => setReplay((n) => n + 1)} />
}

function Guided({ run, s, stale, stage, setStage, onReplay }: { run: Run; s: Selection; stale: boolean; stage: number; setStage: (i: number) => void; onReplay: () => void }) {
  const st = STAGES[stage]
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    // A new stage is a new place in the lesson: focus its heading (not on first load).
    if (moved.current) heading.current?.focus()
    moved.current = true
  }, [stage])
  const go = (i: number) => setStage(Math.max(0, Math.min(STAGES.length - 1, i)))
  const next = STAGES[stage + 1]
  const checkpoints = useCheckpoints()
  const checkpoint = JOURNEY_CHECKPOINTS[stage]
  // The checkpoint's question is built from this run and these selections, frozen when it opens.
  const ctx = { run, pair: s.pair, sel: s.sel }
  const revisit = () => { go(stage); requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>('[data-testid="stage-canvas"]'); if (el) spotlight(el) }) }
  useEffect(() => { if (checkpoint) checkpoints?.visit(checkpoint) }, [checkpoint, checkpoints])
  /** Next: through the checkpoint closing this section, if it has one. Free navigation never asks. */
  const advance = (to: number, label: string) => {
    if (checkpoint && checkpoints) checkpoints.beforeNext(checkpoint, ctx, { onContinue: () => go(to), nextLabel: label, revisit })
    else go(to)
  }
  return (
    <div className="flex flex-col gap-6" data-testid="guided-view">
      <StageNav stage={stage} onSelect={go} />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="stage-h" className="flex min-w-0 flex-col gap-5">
          <div className="min-w-0 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7" data-testid="stage-canvas" data-stage={st.id}>
            <p className="text-label text-muted-foreground" data-testid="stage-position">Step {stage + 1} of {STAGES.length}</p>
            <h2 id="stage-h" ref={heading} tabIndex={-1} className="mb-5 mt-1 text-lesson font-semibold outline-none focus-visible:outline-2 focus-visible:outline-ring">{st.label}</h2>
            <div key={st.id} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              <StageCanvas id={st.id} run={run} s={s} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lesson controls">
            <Button variant="outline" data-help-id="journey.back" onClick={() => go(stage - 1)} disabled={stage === 0}><NavArrowLeftIcon className="size-4" /> Back</Button>
            {next ? (
              <Button className="bg-action text-action-ink hover:bg-action/90" data-help-id="journey.next" onClick={() => advance(stage + 1, next.label)}>Next: {next.label} <NavArrowRightIcon className="size-4" /></Button>
            ) : (
              <Button className="bg-action text-action-ink hover:bg-action/90" onClick={() => advance(0, "the first step")}>Finish and go back to the start</Button>
            )}
            <Button variant="ghost" data-help-id="journey.replay" onClick={onReplay}><RefreshDoubleIcon className="size-4" /> Replay this step</Button>
            <span className="text-label text-muted-foreground">Replay shows the same run again; it draws nothing new.</span>
          </div>
          {checkpoint && <CheckpointStatus id={checkpoint} ctx={ctx} revisit={revisit} />}

        </section>
        <Explanation id={st.id} run={run} s={s} stale={stale} />
      </div>
      <details open className="flex flex-col gap-3">
        <summary className="w-fit cursor-pointer text-prose font-medium hover:text-foreground">Where this step is in the model</summary>
        <div className="mt-3"><ProcessDiagram active={STAGE_NODES[st.id]} layout="auto" onSelect={go} /></div>
      </details>
    </div>
  )
}

/** Six numbered stages. Wide screens: one fixed row. Phones: the current stage and a chooser. */
function StageNav({ stage, onSelect }: { stage: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Lesson stages" data-help-id="journey.stages">
      <ol className="hidden grid-cols-6 gap-2 xl:grid">
        {STAGES.map((st, i) => {
          const current = i === stage
          return (
            <li key={st.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-full w-full min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                  current ? "bg-canvas text-foreground outline-2 -outline-offset-2 outline-action" : i < stage ? "text-foreground hover:bg-raised" : "text-muted-foreground hover:bg-raised hover:text-foreground",
                )}
              >
                <span className={cn("num flex size-6 flex-none items-center justify-center rounded-full text-label font-medium", current ? "bg-action text-action-ink" : "bg-raised")}>{i + 1}</span>
                <span className="min-w-0 text-sm font-medium leading-snug">{st.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="flex items-center gap-3 xl:hidden">
        <label htmlFor="stage-pick" className="text-label text-muted-foreground">Step {stage + 1} of {STAGES.length}</label>
        <select id="stage-pick" value={stage} onChange={(e) => onSelect(Number(e.target.value))} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-prose font-medium">
          {STAGES.map((st, i) => <option key={st.id} value={i}>{i + 1}. {st.label}</option>)}
        </select>
      </div>
    </nav>
  )
}

// ----------------------------------------------------------------------------- the process diagram

type NodeId = "text" | "table" | "context" | "row" | "probs" | "draw" | "chosen" | "append"
const NODE_LABEL: Record<NodeId, [string, string]> = {
  text: ["Training text", "characters in order"],
  table: ["Count table", "pairs counted"],
  context: ["Context", "the last character"],
  row: ["Selected row", "counts after it"],
  probs: ["Probabilities", "count ÷ row total"],
  draw: ["Seeded draw", "one random number"],
  chosen: ["Chosen character", "where the draw lands"],
  append: ["Append", "add it to the output"],
}
const NODE_STAGE: Record<NodeId, number> = { text: 0, table: 1, context: 2, row: 2, probs: 3, draw: 4, chosen: 4, append: 5 }
export const STAGE_NODES: Record<StageId, (NodeId | "feedback")[]> = {
  text: ["text"], count: ["text", "table"], context: ["context", "row"], probs: ["row", "probs"], sample: ["probs", "draw", "chosen"], repeat: ["chosen", "append", "feedback"],
}

interface Layout { w: number; h: number; nw: number; nodes: Record<NodeId, [number, number]>; edges: { from: NodeId; to: NodeId; d: string; label?: [string, number, number] }[]; feedback: { d: string; label: [string, number, number] } }
const NH = 46
// Wide: the count table feeds the selected row from above; the context feeds it from the left.
const WIDE: Layout = {
  w: 760, h: 262, nw: 130,
  nodes: { text: [10, 20], table: [160, 20], draw: [460, 20], context: [10, 120], row: [160, 120], probs: [310, 120], chosen: [460, 120], append: [610, 120] },
  edges: [
    { from: "text", to: "table", d: "M140 43 H157" },
    { from: "table", to: "row", d: "M225 66 V117", label: ["row of counts", 231, 96] },
    { from: "context", to: "row", d: "M140 143 H157" },
    { from: "row", to: "probs", d: "M290 143 H307" },
    { from: "probs", to: "chosen", d: "M440 143 H457" },
    { from: "draw", to: "chosen", d: "M525 66 V117" },
    { from: "chosen", to: "append", d: "M590 143 H607" },
  ],
  feedback: { d: "M675 166 V222 H75 V169", label: ["the appended character becomes the next context", 375, 244] },
}
// Narrow: the same graph, top to bottom, so no label ever has to squeeze.
const NARROW: Layout = {
  w: 340, h: 530, nw: 140,
  nodes: { text: [180, 10], table: [180, 90], context: [20, 170], row: [180, 170], probs: [180, 250], draw: [20, 330], chosen: [180, 330], append: [180, 410] },
  edges: [
    { from: "text", to: "table", d: "M250 56 V88" },
    { from: "table", to: "row", d: "M250 136 V168", label: ["row of counts", 256, 156] },
    { from: "context", to: "row", d: "M160 193 H178" },
    { from: "row", to: "probs", d: "M250 216 V248" },
    { from: "probs", to: "chosen", d: "M250 296 V328" },
    { from: "draw", to: "chosen", d: "M160 353 H178" },
    { from: "chosen", to: "append", d: "M250 376 V408" },
  ],
  feedback: { d: "M180 433 H90 V218", label: ["becomes the next context", 98, 470] },
}

/** The bigram model's information flow, including the loop from output back to context. */
export function ProcessDiagram({ active, onSelect, layout }: { active: (NodeId | "feedback")[]; onSelect: (stage: number) => void; layout: "auto" | "narrow" }) {
  const wide = useMediaQuery("(min-width: 768px)")
  const L = layout === "narrow" || !wide ? NARROW : WIDE
  const on = (n: NodeId | "feedback") => active.includes(n)
  return (
    <figure className="flex flex-col gap-2" data-testid="process-diagram" data-help-id="journey.diagram">
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className={cn("h-auto w-full", L === WIDE ? "max-w-4xl" : "max-w-sm")} role="group" aria-label="The bigram model's information flow">
        <defs>
          <marker id="j-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--muted-foreground)" /></marker>
          <marker id="j-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--data)" /></marker>
        </defs>
        {L.edges.map((e) => {
          const hot = on(e.from) && on(e.to)
          return (
            <g key={e.from + e.to} aria-hidden="true">
              <path d={e.d} fill="none" stroke={hot ? "var(--data)" : "var(--muted-foreground)"} strokeWidth={hot ? 2.5 : 1.5} markerEnd={`url(#${hot ? "j-arrow-on" : "j-arrow"})`} />
              {e.label && <text x={e.label[1]} y={e.label[2]} fontSize="11" fill="var(--muted-foreground)">{e.label[0]}</text>}
            </g>
          )
        })}
        <g aria-hidden="true">
          <path d={L.feedback.d} fill="none" stroke={on("feedback") ? "var(--data)" : "var(--muted-foreground)"} strokeWidth={on("feedback") ? 2.5 : 1.5} strokeDasharray="6 4" markerEnd={`url(#${on("feedback") ? "j-arrow-on" : "j-arrow"})`} />
          <text x={L.feedback.label[1]} y={L.feedback.label[2]} fontSize="11" textAnchor={L === WIDE ? "middle" : "start"} fill="var(--muted-foreground)">{L.feedback.label[0]}</text>
        </g>
        {(Object.keys(L.nodes) as NodeId[]).map((n) => {
          const [x, y] = L.nodes[n]
          const hot = on(n)
          const [title, sub] = NODE_LABEL[n]
          return (
            <g
              key={n}
              role="button"
              tabIndex={0}
              aria-label={`${title}: ${sub}. Opens step ${NODE_STAGE[n] + 1}, ${STAGES[NODE_STAGE[n]].label}`}
              aria-pressed={hot}
              data-node={n}
              onClick={() => onSelect(NODE_STAGE[n])}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(NODE_STAGE[n]) } }}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--ring)] [&:focus-visible>rect]:[stroke-width:3]"
            >
              <rect x={x} y={y} width={L.nw} height={NH} rx={n === "text" || n === "context" ? 3 : 10} fill={hot ? "var(--data-soft)" : "var(--card)"} stroke={hot ? "var(--data)" : "var(--border)"} strokeWidth={hot ? 2 : 1} strokeDasharray={n === "text" || n === "context" || n === "draw" ? "4 3" : undefined} />
              <text x={x + 12} y={y + 20} fontSize="13" fontWeight="600" fill="var(--foreground)">{title}</text>
              <text x={x + 12} y={y + 36} fontSize="11" fill="var(--muted-foreground)">{sub}</text>
            </g>
          )
        })}
      </svg>
      <details className="text-label">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">The diagram in words</summary>
        <ol className="measure mt-2 flex list-decimal flex-col gap-1 pl-5">
          <li>The training text is counted into the count table.</li>
          <li>The context, the last character so far, selects one row of the count table.</li>
          <li>That row's counts, each divided by the row total, are the probabilities.</li>
          <li>The probabilities and one seeded random draw pick the chosen character.</li>
          <li>The chosen character is appended to the output, and becomes the next context (the dashed loop).</li>
        </ol>
        <p className="mt-1 text-muted-foreground">Dashed boxes are inputs: the text, the context and the random draw. The lesson's six steps follow this flow, but the lesson order is for learning, not a strict order of computation.</p>
      </details>
    </figure>
  )
}

// ----------------------------------------------------------------------------- the explanation column

interface Copy {
  happening: ReactNode
  why: ReactNode
  tryIt: ReactNode
  terms: { id: string; role: ReactNode }[]
  calc: ReactNode
  code: ReactNode
}

function Explanation({ id, run, s, stale }: { id: StageId; run: Run; s: Selection; stale: boolean }) {
  const [level, setLevel] = useState<Level>("walk")
  const copy = stageCopy(id, run, s)
  const label = STAGES.find((st) => st.id === id)!.label
  return (
    <ExplanationPanel title={label} testid="stage-explanation">
      {stale && <p className="text-label font-medium text-src-sim-ink">These words describe the earlier run, not the changed inputs.</p>}
      <LevelSwitch level={level} onChange={setLevel} className="grid w-full grid-cols-3 bg-companion-callout [&>button]:h-auto [&>button]:min-h-10 [&>button]:px-2 [&>button]:py-1.5 [&>button]:leading-snug" />
      <div className="measure flex flex-col gap-4 text-prose" data-testid="explanation-body">
        {level === "walk" ? (
          <>
            <div className="flex flex-col gap-1.5"><h3 className="font-semibold">What is happening</h3><div className="flex flex-col gap-2">{copy.happening}</div></div>
            <div className="flex flex-col gap-1.5 border-t border-companion-edge pt-4"><h3 className="font-semibold">Why it matters</h3><div className="flex flex-col gap-2">{copy.why}</div></div>
            <TryThis>{copy.tryIt}</TryThis>
          </>
        ) : level === "calc" ? copy.calc : copy.code}
      </div>
      {copy.terms.length > 0 && (
        <details className="border-t border-companion-edge pt-4 text-prose">
          <summary className="cursor-pointer text-label font-medium text-muted-foreground hover:text-foreground">Words used here ({copy.terms.length})</summary>
          <ul className="measure mt-2 flex flex-col gap-2">
            {copy.terms.map((t) => (
              <li key={t.id}><Term id={t.id} className="font-medium">{findTerm(t.id)?.term}</Term>: {findTerm(t.id)?.plain} <span className="text-muted-foreground">Here: {t.role}</span></li>
            ))}
          </ul>
        </details>
      )}
    </ExplanationPanel>
  )
}

function stageCopy(id: StageId, run: Run, s: Selection): Copy {
  const { text, table, generation: g } = run.result
  const chars = charTokens(text)
  switch (id) {
    case "text": return {
      happening: <p>This text supplies examples of which characters follow each other. The engine splits it into single characters and reads every neighbouring pair: {fmt.n(chars.length)} characters give {fmt.n(table.pairs)} pairs.</p>,
      why: <p>The model knows nothing except how often each character followed another in this text. It uses those learned pair frequencies to predict; a sequence it generates can join pairs in orders the text never contains.</p>,
      tryIt: <p>Pick a pair, or one of the common pairs, and look for its highlighted places in the text.</p>,
      terms: [{ id: "corpus", role: "the text the counts are learned from." }, { id: "token", role: "one character, as the engine counts it." }],
      calc: <><Symbols rows={[["N", "characters in the text", fmt.n(chars.length)], ["N − 1", "neighbouring pairs: every character but the last has a next one", fmt.n(table.pairs)]]} /><p>The engine's table holds exactly {fmt.n(table.pairs)} pairs, so every pair in this text was counted once.</p></>,
      code: <><EngineCode path="nextword/bigram.py" symbol="tokenize" /><p className="text-sm">Input: the text. Operation: <code className="tok">list(text)</code> splits it into Unicode code points. Returns: the list of characters the rest of the engine works on.</p></>,
    }
    case "count": {
      const n = table.rows[s.pair.a]?.[s.pair.b] ?? 0
      const places = pairOccurrences(text, s.pair.a, s.pair.b)
      return {
        happening: <p>Each highlighted place where {q(s.pair.a)} is followed by {q(s.pair.b)} adds one to that pair's count: here {places.length ? places.map(() => "1").join(" + ") : "nothing"}, so the count is {n}. The engine counts every pair in the text this way, at once.</p>,
        why: <p>A pair of neighbouring characters counted like this is called a bigram. The count table of every bigram is the entire model: nothing else is stored.</p>,
        tryIt: <p>Switch to a common pair, then a rare one, and compare the count with the highlighted places. Replay counts them again, one place at a time.</p>,
        terms: [{ id: "bigram", role: "the pairs being counted, and the name of this model." }],
        calc: <><Symbols rows={[[`count(${visible(s.pair.a)} → ${visible(s.pair.b)})`, `positions i where character i is ${q(s.pair.a)} and character i + 1 is ${q(s.pair.b)}`, String(n)], ["places found", "highlighted in the text", String(places.length)]]} /><p>The engine's table says {n}{places.length === n ? ", the same number." : "; these differ, which would mean the text and table came from different snapshots."}</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="count_bigrams" /><p className="text-sm">Input: the list of characters. Operation: <code className="tok">zip(tokens, tokens[1:])</code> walks every neighbouring pair and adds one to its counter. Returns: each character mapped to a Counter of what followed it.</p></>,
      }
    }
    case "context": {
      const last = charTokens(g.prompt).at(-1)!
      const { total, items } = engineRow(table, last)
      return {
        happening: <p>This version uses only the previous character to predict the next one. Earlier words do not change this prediction. The prompt's last character, {q(last)}, selects its row of the count table.</p>,
        why: <p>A bigram model's context is exactly one character wide. That is the definition of this model. Any prompt ending in {q(last)} starts from the same row.</p>,
        tryIt: <p>Change the inputs to a different prompt with the same last letter: the selected row stays the same.</p>,
        terms: [{ id: "context-window", role: "one character wide here." }],
        calc: <Symbols rows={[["prompt", "what you typed", `“${g.prompt}”`], ["context", "its last character, prompt[−1]", visible(last)], [`counts[${visible(last)}]`, "its row", items.map((i) => `${visible(i.token)}: ${i.count}`).join(", ")], ["row total", "pairs starting with it", String(total)]]} />,
        code: <><EngineCode path="nextword/bigram.py" symbol="generate_steps" /><p className="text-sm">The loop starts from <code className="tok">prompt[-1]</code>. Returns one Step per generated character: its context, probabilities, draw and choice.</p></>,
      }
    }
    case "probs": {
      const { total, items } = engineRow(table, s.context)
      const sorted = [...items].sort((a, b) => b.count - a.count)
      return {
        happening: total ? <p>Each count in the row for {q(s.context)} is divided by the same total, {total}. We divide each count by the total so the probabilities add up to one. This is called normalization.</p> : <p>Nothing ever follows {q(s.context)} in this text, so its row is empty and there is nothing to divide.</p>,
        why: <p>Raw counts depend on how common the character is. Probabilities on a common scale can be compared and can be drawn from. The column of probabilities is a probability distribution.</p>,
        tryIt: <p>Choose a character with many followers, then one with a single follower: its only follower gets probability 1.</p>,
        terms: [{ id: "normalization", role: "count ÷ row total." }, { id: "distribution", role: "every possible next character and its probability." }],
        calc: total ? <><Symbols rows={[[`total(${visible(s.context)})`, `pairs starting with it: ${items.map((i) => i.count).join(" + ")}`, String(total)], ...sorted.map((it) => [`P(${visible(it.token)} | ${visible(s.context)})`, `${it.count} ÷ ${total}`, it.p.toFixed(4)] as [string, string, string])]} /><p>P(b | a) reads “the probability of b, given that the current character is a”. Your engine uses the raw counts and adds no smoothing, so a character that never followed {q(s.context)} has probability exactly 0.</p></> : <p>The row is empty, so the engine raises an unseen-context error here instead of guessing.</p>,
        code: <><EngineCode path="nextword/bigram.py" symbol="next_token_probabilities" /><p className="text-sm">Input: the counts and one context character. Operation: divide each count in its row by the row's sum. Returns: next character → probability, in first-seen order; UnseenContextError if the row is missing.</p></>,
      }
    }
    case "sample": {
      const i = Math.min(s.sel, g.steps.length - 1)
      const step = g.steps[i]
      if (!step) return { happening: <p>Nothing was generated.</p>, why: null, tryIt: null, terms: [], calc: null, code: null }
      const land = landing(step)
      const ivs = intervals(step)
      return {
        happening: <p>Sampling uses these probabilities. The most likely character is not guaranteed to be selected. The probabilities are laid end to end from 0 to 1; the engine's random number u = {step.draw.toFixed(3)} lands in the stretch of {q(step.token)}.</p>,
        why: <p>Drawing in proportion to the probabilities makes common continuations common without making them certain. The seed ({g.seed}) only makes the random numbers repeatable: the same seed, text, prompt and length give the same draws.</p>,
        tryIt: <p>Change only the seed and run again. With the same model and prompt, the first probability distribution is unchanged. Different draws can choose different characters, which can lead to different context rows later.</p>,
        terms: [{ id: "sampling", role: "the draw that picks the next character." }, { id: "seed", role: "fixes which random numbers are drawn." }],
        calc: <><Symbols rows={[["u", `the engine's random number for step ${i + 1}, between 0 and 1`, step.draw.toFixed(4)], ...ivs.map((iv) => [visible(iv.token), `from ${iv.start.toFixed(3)} to ${iv.end.toFixed(3)} (p = ${iv.p.toFixed(3)})`] as [string, string])]} /><p>Each stretch starts where the last ended. u = {step.draw.toFixed(4)} is at least {land?.start.toFixed(3)} and below {land?.end.toFixed(3)}, so it falls in {q(land?.token ?? step.token)}, which the engine chose.</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="sample_next" /><p className="text-sm">Input: the probabilities and the seeded generator. Operation: running sums, one random number, a binary search for the first sum past it. Returns: the chosen character and the draw.</p></>,
      }
    }
    case "repeat": {
      const i = Math.min(s.sel, Math.max(0, s.revealed - 1))
      const step = g.steps[i]
      const { total, items } = step ? engineRow(table, step.context) : { total: 0, items: [] }
      const agrees = step ? stepAgrees(table, step, contextBefore(g, i)) : true
      return {
        happening: <p>The chosen character joins the output and becomes the context for the next step, which selects a new row and draws again. The context the selected step read is not the same as the context the next prediction will read: each new character moves it forward by one.</p>,
        why: <p>Writing one character at a time, each from the one before, is how this model writes more than one character. It is called autoregressive generation.</p>,
        tryIt: <p>Press Next step a few times, then select any earlier character to trace it back to its context, counts and draw.</p>,
        terms: [{ id: "autoregressive", role: "each output becomes the next input." }],
        calc: step ? <><Symbols rows={[[`context for step ${i + 1}`, i === 0 ? "the prompt's last character" : `the character chosen at step ${i}`, visible(step.context)], ["its row", items.map((it) => `${visible(it.token)}: ${it.count}`).join(", "), `total ${total}`], ["u", "the draw", step.draw.toFixed(4)], ["chosen", "appended to the output", visible(step.token)], [`context for step ${i + 2}`, "the character just chosen", visible(step.token)]]} /><p>{agrees ? "Checked: these probabilities are the row's counts divided by its total, in the same snapshot, and the draw lands on the chosen character." : "These values do not agree with the count table: run the journey again."}</p></> : null,
        code: <><EngineCode path="nextword/bigram.py" symbol="generate_steps" /><p className="text-sm">The loop sets <code className="tok">context = token</code> after every draw: that one line is “append and repeat”. It stops early only when the context has no row.</p></>,
      }
    }
  }
}

// ----------------------------------------------------------------------------- the stage canvases

function StageCanvas({ id, run, s }: { id: StageId; run: Run; s: Selection }) {
  switch (id) {
    case "text": return <TextCanvas run={run} s={s} />
    case "count": return <CountCanvas run={run} s={s} />
    case "context": return <ContextCanvas run={run} />
    case "probs": return <ProbsCanvas run={run} s={s} />
    case "sample": return <SampleCanvas run={run} s={s} />
    case "repeat": return <RepeatCanvas run={run} s={s} />
  }
}

function PairPicker({ run, s }: { run: Run; s: Selection }) {
  const { table } = run.result
  const vocab = table.vocab.map((v) => v.token)
  const followers = Object.keys(table.rows[s.pair.a] ?? {})
  const common = topPairs(table, 8)
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3" data-help-id="journey.pair">
      <div className="flex flex-col gap-1.5">
        <span id="pair-a" className="text-label text-muted-foreground">First character</span>
        <Select value={s.pair.a} onValueChange={(v) => { const a = String(v); s.setPair({ a, b: Object.keys(table.rows[a] ?? {})[0] ?? s.pair.b }) }} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
          <SelectTrigger aria-labelledby="pair-a" className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="pair-b" className="text-label text-muted-foreground">Followed by</span>
        <Select value={s.pair.b} onValueChange={(v) => s.setPair({ ...s.pair, b: String(v) })} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
          <SelectTrigger aria-labelledby="pair-b" className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}{followers.includes(t) ? "" : " (never)"}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-label text-muted-foreground">Common pairs</span>
        <div className="flex flex-wrap gap-1.5">
          {common.map((c) => {
            const on = c.a === s.pair.a && c.b === s.pair.b
            return (
              <button key={c.a + c.b} type="button" onClick={() => s.setPair({ a: c.a, b: c.b })} aria-pressed={on} aria-label={`${visible(c.a)} followed by ${visible(c.b)}, ${c.count} times`}
                className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors", on ? "bg-context text-context-ink" : "bg-raised hover:bg-active")}>
                <span className="tok">{visible(c.a)}{visible(c.b)}</span><span className="num text-label opacity-75">{c.count}</span>
              </button>
            )
          })}
        </div>
      </div>
    <InfoTip id="journey.pair" /></div>
  )
}

function HighlightedText({ chars, occ, active, size = "large" }: { chars: string[]; occ: Set<number>; active?: Set<number>; size?: "large" | "small" }) {
  return (
    <p className={cn("tok max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-raised", size === "large" ? "p-5 text-[1.125rem] leading-9" : "p-4 text-prose leading-8")} data-testid="journey-text">
      {chars.map((c, i) => {
        const starts = occ.has(i)
        const ends = occ.has(i - 1)
        const lit = (starts || ends) && (!active || active.has(starts ? i : i - 1))
        return (
          <span key={i} data-pair={starts ? "start" : ends ? "end" : undefined}
            className={cn("transition-colors duration-200", c === " " || c === "\n" ? "text-muted-foreground" : "", lit && "rounded-sm bg-context text-context-ink", starts && lit && "underline decoration-2 underline-offset-4")}>
            <Ch c={c} />{c === "\n" && "\n"}
          </span>
        )
      })}
    </p>
  )
}

function TextCanvas({ run, s }: { run: Run; s: Selection }) {
  const { text, table, corpus } = run.result
  const chars = useMemo(() => charTokens(text), [text])
  const occ = useMemo(() => new Set(pairOccurrences(text, s.pair.a, s.pair.b)), [text, s.pair])
  return (
    <div className="flex flex-col gap-5">
      <PairPicker run={run} s={s} />
      <HighlightedText chars={chars} occ={occ} />
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p className="text-prose" role="status">{q(s.pair.a)} followed by {q(s.pair.b)} appears <span className="num text-section font-semibold">{occ.size}</span> {occ.size === 1 ? "time" : "times"}.</p>
        <p className="text-label text-muted-foreground"><span className="num">{fmt.n(chars.length)}</span> characters, <span className="num">{fmt.n(table.pairs)}</span> neighbouring pairs{corpus.origin === "example" ? ", a short original passage written for this lesson" : ""}.</p>
      </div>
      <p className="text-label text-muted-foreground">Highlighted: the chosen pair; its first character is underlined. ␣ is a space and ↵ a line break, each one character.</p>
    </div>
  )
}

function CountCanvas({ run, s }: { run: Run; s: Selection }) {
  const { text, table } = run.result
  const chars = useMemo(() => charTokens(text), [text])
  const places = useMemo(() => pairOccurrences(text, s.pair.a, s.pair.b), [text, s.pair])
  const engineCount = table.rows[s.pair.a]?.[s.pair.b] ?? 0
  const reduced = usePrefersReducedMotion()
  // Replay counts the places again one at a time. It only re-reads this snapshot.
  const [shown, setShown] = useState(places.length)
  const [seen, setSeen] = useState({ replay: s.replay, key: `${s.pair.a}${s.pair.b}` })
  const key = `${s.pair.a}${s.pair.b}`
  if (seen.key !== key) { setSeen({ replay: s.replay, key }); setShown(places.length) }
  if (seen.replay !== s.replay) { setSeen({ replay: s.replay, key }); setShown(reduced ? places.length : 0) }
  useEffect(() => {
    if (shown >= places.length) return
    const t = setTimeout(() => setShown(shown + 1), 550)
    return () => clearTimeout(t)
  }, [shown, places.length])
  const active = new Set(places.slice(0, shown))
  return (
    <div className="flex flex-col gap-5">
      <PairPicker run={run} s={s} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
        <HighlightedText chars={chars} occ={new Set(places)} active={active} size="small" />
        <div className="flex flex-col gap-3">
          <p className="text-label text-muted-foreground">Count of {q(s.pair.a)} → {q(s.pair.b)}</p>
          <p className="num text-[3rem] font-semibold leading-none" aria-live="polite" data-testid="pair-count">{shown === places.length ? engineCount : shown}</p>
          {places.length === 0 ? (
            <p className="text-prose">Never in this text, so the count is 0. A pair the model never saw can never be generated.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 text-sm">
              {places.slice(0, 8).map((i, k) => (
                <li key={i} className={cn("flex items-center gap-3 transition-opacity duration-200", k < shown ? "opacity-100" : "opacity-30")}>
                  <span className="num w-8 text-right font-medium">+1</span>
                  <span className="tok rounded-md bg-raised px-2 py-0.5">
                    {chars.slice(Math.max(0, i - 3), i).map((c, j) => <span key={j} className="text-muted-foreground"><Ch c={c} /></span>)}
                    <span className="rounded-sm bg-context px-0.5 text-context-ink"><Ch c={chars[i]} /><Ch c={chars[i + 1]} /></span>
                    {chars.slice(i + 2, i + 5).map((c, j) => <span key={j} className="text-muted-foreground"><Ch c={c} /></span>)}
                  </span>
                  <span className="num text-label text-muted-foreground">character {i + 1}</span>
                </li>
              ))}
              {places.length > 8 && <li className="text-label text-muted-foreground">and {places.length - 8} more places</li>}
            </ol>
          )}
          <p className="text-label text-muted-foreground">Your engine's table says <span className="num font-medium text-foreground">{engineCount}</span>. It counts all <span className="num">{fmt.n(table.pairs)}</span> pairs this way.</p>
        </div>
      </div>
      <p className="text-label text-muted-foreground">One token here is one Unicode code point, as Python's <code className="tok">list(text)</code> splits it. Spaces and line breaks are tokens too. Some emoji you see as one symbol are made of several code points (a flag, a skin tone, a family joined with U+200D), so the engine sees several tokens.</p>
    </div>
  )
}

function RowTable({ table, context, emphasize = false, testid }: { table: JourneyData["table"]; context: string; emphasize?: boolean; testid?: string }) {
  const { total, items } = engineRow(table, context)
  const sorted = [...items].sort((a, b) => b.count - a.count)
  return (
    <table className="w-full max-w-xl text-prose" data-testid={testid}>
      <caption className="sr-only">Counts after {visible(context)}, divided by their total</caption>
      <thead>
        <tr className="text-left text-label text-muted-foreground">
          <th scope="col" className="pb-2 font-normal">Next</th>
          <th scope="col" className="pb-2 text-right font-normal">Count</th>
          {emphasize && <th scope="col" className="pb-2 text-right font-normal">÷ total</th>}
          {emphasize && <th scope="col" className="pb-2 text-right font-normal">= P</th>}
          {emphasize && <th scope="col" className="w-2/5 pb-2 pl-5 font-normal"><span className="sr-only">Bar</span></th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((it) => (
          <tr key={it.token} className="border-t border-rule">
            <th scope="row" className="py-2 text-left font-normal"><Tok>{visible(it.token)}</Tok></th>
            <td className="num py-2 text-right">{it.count}</td>
            {emphasize && <td className="num py-2 text-right text-muted-foreground">÷ {total}</td>}
            {emphasize && <td className="num py-2 text-right font-semibold">{it.p.toFixed(3)}</td>}
            {emphasize && <td className="py-2 pl-5"><div className="h-3 rounded-full bg-raised" aria-hidden="true"><div className="h-full rounded-full bg-data transition-[width] duration-300" style={{ width: `${it.p * 100}%` }} /></div></td>}
          </tr>
        ))}
        <tr className="border-t-2 border-border">
          <th scope="row" className="py-2 text-left font-medium">Total</th>
          <td className="num py-2 text-right font-medium">{total}</td>
          {emphasize && <td />}
          {emphasize && <td className="num py-2 text-right font-medium">{sorted.reduce((a, i) => a + i.p, 0).toFixed(3)}</td>}
          {emphasize && <td />}
        </tr>
      </tbody>
    </table>
  )
}

function ContextCanvas({ run }: { run: Run }) {
  const { table, generation: g } = run.result
  const chars = charTokens(g.prompt)
  const last = chars.at(-1)!
  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(14rem,1fr)]">
      <div className="flex flex-col gap-3">
        <p className="text-label text-muted-foreground">Your prompt</p>
        <p className="tok break-words text-[1.75rem] leading-[1.6]" data-testid="journey-prompt">
          <span className="text-muted-foreground/50">{chars.slice(0, -1).map((c, i) => <Ch key={i} c={c} />)}</span>
          <mark className="rounded-md bg-context px-1.5 text-context-ink" aria-label={`last character ${visible(last)}, the only one used`}><Ch c={last} /></mark>
        </p>
        <p className="text-label text-muted-foreground">Faded: not used by this model. Highlighted: the one character it reads.</p>
      </div>
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-label text-muted-foreground"><Tok tone="context">{visible(last)}</Tok> selects this row of the count table</p>
        <RowTable table={table} context={last} />
      </div>
    </div>
  )
}

function ProbsCanvas({ run, s }: { run: Run; s: Selection }) {
  const { table } = run.result
  const { total } = engineRow(table, s.context)
  const vocab = table.vocab.map((v) => v.token)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5" data-help-id="journey.context">
          <span className="flex items-center gap-0.5"><span id="norm-ctx" className="text-label text-muted-foreground">Context character</span><InfoTip id="journey.context" /></span>
          <Select value={s.context} onValueChange={(v) => s.setContext(String(v))} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
            <SelectTrigger aria-labelledby="norm-ctx" className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="pb-1.5 text-prose">Row for <Tok tone="context">{visible(s.context)}</Tok>, total <span className="num text-section font-semibold">{total}</span> <span className="text-label text-muted-foreground">(the denominator)</span></p>
        <p className="pb-2 text-label text-muted-foreground">The run's first step reads {q(run.result.generation.steps[0]?.context ?? s.context)}.</p>
      </div>
      {total === 0 ? (
        <Note tone="warning">Nothing ever follows {q(s.context)} in this text (it only appears at the very end). Its row is empty, so there is nothing to divide: the engine cannot predict after it, and a run that reaches it stops.</Note>
      ) : (
        <RowTable table={table} context={s.context} emphasize testid="norm-table" />
      )}
    </div>
  )
}

function SampleCanvas({ run, s }: { run: Run; s: Selection }) {
  const { generation: g } = run.result
  const reduced = usePrefersReducedMotion()
  const i = Math.min(s.sel, g.steps.length - 1)
  const step = g.steps[i]
  // Replay slides the draw marker in from 0 to the engine's u. The value itself never changes.
  const [marker, setMarker] = useState(step?.draw ?? 0)
  const [seen, setSeen] = useState({ replay: s.replay, i })
  if (seen.i !== i) { setSeen({ replay: s.replay, i }); setMarker(step?.draw ?? 0) }
  if (seen.replay !== s.replay) { setSeen({ replay: s.replay, i }); setMarker(reduced ? step?.draw ?? 0 : 0) }
  useEffect(() => {
    if (!step || marker === step.draw) return
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setMarker(step.draw)))
    return () => cancelAnimationFrame(t)
  }, [marker, step])
  if (!step) return <Note tone="warning">Nothing was generated, so there is no draw to show.</Note>
  const ivs = intervals(step)
  const land = landing(step)
  const top = [...step.candidates].sort((a, b) => b.p - a.p)[0]
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-prose">Step {i + 1} of {g.steps.length}: after <Tok tone="context">{step.contextLabel}</Tok></p>
        <div className="flex items-center gap-1.5" role="group" aria-label="Which step to sample" data-help-id="journey.sample-step">
          <Button variant="outline" size="sm" disabled={i === 0} onClick={() => s.setSel(i - 1)} aria-label="Previous step's draw"><NavArrowLeftIcon className="size-4" /></Button>
          <Button variant="outline" size="sm" disabled={i >= g.steps.length - 1} onClick={() => { s.setSel(i + 1); if (s.revealed < i + 2) s.setRevealed(i + 2) }} aria-label="Next step's draw"><NavArrowRightIcon className="size-4" /></Button>
        <InfoTip id="journey.sample-step" /></div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-label text-muted-foreground">The probabilities laid end to end, in the engine's order</p>
        <div className="relative h-16 w-full overflow-hidden rounded-xl bg-raised" role="img" aria-label={`Stretches: ${ivs.map((iv) => `${visible(iv.token)} from ${iv.start.toFixed(2)} to ${iv.end.toFixed(2)}`).join("; ")}. The draw u = ${step.draw.toFixed(3)} lands in ${visible(step.token)}.`}>
          {ivs.map((iv, k) => (
            <div key={iv.token} className={cn("tok absolute inset-y-0 flex items-center justify-center border-r-2 border-canvas text-prose", iv.token === step.token ? "bg-primary text-primary-foreground" : k % 2 ? "bg-data-soft" : "bg-[color-mix(in_oklab,var(--data)_26%,var(--canvas))]")} style={{ left: `${iv.start * 100}%`, width: `${iv.p * 100}%` }}>
              {iv.p > 0.05 ? visible(iv.token) : ""}
            </div>
          ))}
          <div className="absolute inset-y-0 w-[3px] bg-negative transition-[left] duration-700 ease-out motion-reduce:transition-none" style={{ left: `calc(${marker * 100}% - 1.5px)` }} data-testid="draw-marker" />
        </div>
        <div className="num flex justify-between text-label text-muted-foreground" aria-hidden="true"><span>0</span><span>0.5</span><span>1</span></div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
        <div className="flex items-center gap-4 rounded-xl bg-raised px-5 py-4">
          <div><p className="text-label text-muted-foreground">Draw u</p><p className="num text-section font-semibold">{step.draw.toFixed(4)}</p></div>
          <NavArrowRightIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <div><p className="text-label text-muted-foreground">Chosen</p><p className="tok text-[2rem] font-semibold leading-none"><Ch c={step.token} /></p></div>
        </div>
        <table className="w-full max-w-lg text-prose" data-testid="interval-table">
          <caption className="sr-only">Stretch of each character between 0 and 1</caption>
          <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="pb-2 font-normal">Next</th><th scope="col" className="pb-2 text-right font-normal">p</th><th scope="col" className="pb-2 text-right font-normal">From</th><th scope="col" className="pb-2 text-right font-normal">To</th></tr></thead>
          <tbody>
            {ivs.map((iv) => (
              <tr key={iv.token} className={cn("border-t border-rule", iv.token === land?.token && "font-semibold")}>
                <th scope="row" className="py-1.5 text-left font-normal"><Tok tone={iv.token === step.token ? "chosen" : "plain"}>{visible(iv.token)}</Tok>{iv.token === land?.token && <span className="ml-2 text-label font-normal text-muted-foreground">u lands here</span>}</th>
                <td className="num py-1.5 text-right">{iv.p.toFixed(3)}</td>
                <td className="num py-1.5 text-right">{iv.start.toFixed(3)}</td>
                <td className="num py-1.5 text-right">{iv.end.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="measure text-prose">
        {top.token === step.token
          ? <>The draw landed on the most likely character, {q(top.token)} (p = {top.p.toFixed(3)}).</>
          : <>The most likely was {q(top.token)} (p = {top.p.toFixed(3)}), but the draw landed on {q(step.token)} (p = {(step.candidates.find((c) => c.token === step.token)?.p ?? 0).toFixed(3)}).</>}
      </p>
    </div>
  )
}

function RepeatCanvas({ run, s }: { run: Run; s: Selection }) {
  const { table, generation: g } = run.result
  const reduced = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(false)
  const n = g.steps.length
  const promptChars = charTokens(g.prompt)
  const { revealed, setRevealed, setSel } = s
  const i = Math.min(s.sel, Math.max(0, revealed - 1))
  const step: Step | undefined = g.steps[i]
  const nextContext = revealed > 0 ? g.steps[revealed - 1].token : promptChars.at(-1)!
  const agrees = step ? stepAgrees(table, step, contextBefore(g, i)) : true
  const { total, items } = step ? engineRow(table, step.context) : { total: 0, items: [] }
  // Replay starts the same run's output over from its first character and plays it through.
  const [seenReplay, setSeenReplay] = useState(s.replay)
  if (seenReplay !== s.replay) { setSeenReplay(s.replay); setRevealed(Math.min(1, n)); setSel(0); setPlaying(n > 1) }
  const isPlaying = playing && revealed < n
  useEffect(() => {
    if (!isPlaying) return
    const t = window.setTimeout(() => { setRevealed(revealed + 1); setSel(revealed) }, reduced ? 400 : 800)
    return () => clearTimeout(t)
  }, [isPlaying, revealed, reduced, setRevealed, setSel])
  const advance = () => { if (revealed < n) { setSel(revealed); setRevealed(revealed + 1) } }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Generation steps">
        <Button variant="outline" size="sm" onClick={() => { setPlaying(false); setRevealed(Math.max(1, revealed - 1)); setSel(Math.max(0, revealed - 2)) }} disabled={revealed <= 1}><NavArrowLeftIcon className="size-4" /> Back a step</Button>
        <Button variant="outline" size="sm" data-help-id="journey.next-step" onClick={() => { setPlaying(false); advance() }} disabled={revealed >= n}><SkipNextIcon className="size-4" /> Next step</Button>
        <Button variant="ghost" size="sm" data-help-id="journey.play" onClick={() => setPlaying(!isPlaying)} disabled={revealed >= n}>{isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />} {isPlaying ? "Pause" : "Play"}</Button>
        <Button variant="ghost" size="sm" onClick={() => { setPlaying(false); setRevealed(n); setSel(n - 1) }} disabled={revealed >= n}>Show all</Button>
        <span className="num ml-auto text-label text-muted-foreground">Showing {revealed} of {n} steps</span>
      </div>
      <p className="tok whitespace-pre-wrap break-words rounded-xl bg-raised p-5 text-[1.75rem] leading-[1.7]" data-testid="journey-output">
        <span className="text-muted-foreground/50">{promptChars.slice(0, -1).map((c, k) => <Ch key={k} c={c} />)}</span>
        <span className={cn("rounded-sm px-0.5", i === 0 && step && "bg-context text-context-ink", revealed === 0 && "underline decoration-dashed decoration-2 underline-offset-[8px]")}><Ch c={promptChars.at(-1)!} /></span>
        {g.steps.slice(0, revealed).map((st, k) => {
          const isCtx = step && k === i - 1
          const isChosen = k === i
          const isNext = k === revealed - 1
          return (
            <button key={k} type="button" onClick={() => { setPlaying(false); setSel(k) }} aria-pressed={isChosen} aria-label={`Step ${k + 1}: ${visible(st.token)}, chosen after ${visible(st.context)}`}
              data-role={[isCtx && "step-context", isChosen && "step-choice", isNext && "next-context"].filter(Boolean).join(" ") || undefined}
              className={cn("rounded-sm bg-data-soft px-0.5 transition-colors duration-200 animate-in fade-in-0 motion-reduce:animate-none", isCtx && "bg-context text-context-ink", isChosen && "outline-2 -outline-offset-2 outline-primary", isNext && "underline decoration-dashed decoration-2 underline-offset-[8px]")}>
              <Ch c={st.token} />
            </button>
          )
        })}
        {revealed < n && <span className="text-muted-foreground">▏</span>}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-label text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-context" /> context step {i + 1} read</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm outline-2 -outline-offset-2 outline-primary" /> character step {i + 1} chose</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 border-b-2 border-dashed border-foreground" /> context the next prediction reads ({q(nextContext)})</span>
      </div>
      {step && (
        <div className="flex flex-col gap-3" data-testid="trace-back">
          <p className="text-prose font-medium">Tracing step {i + 1} back to where it came from</p>
          <ol className="flex flex-wrap items-stretch gap-x-2 gap-y-2 text-sm">
            <TraceBox label="context"><Tok tone="context">{step.contextLabel}</Tok></TraceBox>
            <Arrow>selects the row</Arrow>
            <TraceBox label="counts">{items.map((it) => `${visible(it.token)} ${it.count}`).join(", ")} <span className="text-muted-foreground">of {total}</span></TraceBox>
            <Arrow>÷ total</Arrow>
            <TraceBox label="probabilities">{step.candidates.map((c) => `${visible(c.token)} ${c.p.toFixed(2)}`).join(", ")}</TraceBox>
            <Arrow>draw u = {step.draw.toFixed(3)}</Arrow>
            <TraceBox label="chosen"><Tok tone="chosen">{step.tokenLabel}</Tok></TraceBox>
            <Arrow>becomes</Arrow>
            <TraceBox label={`context for step ${i + 2}`}><Tok tone="context">{step.tokenLabel}</Tok></TraceBox>
          </ol>
          <p className={cn("text-label", agrees ? "text-muted-foreground" : "text-negative")}>{agrees ? "Checked against the count table of the same snapshot." : "These values do not agree with the count table; run the journey again."}</p>
        </div>
      )}
      {g.stopped && revealed >= n && (
        <Note tone="warning">The run stopped after {n} of {g.length} characters: {q(g.steps.at(-1)!.token)} never has a following character in this text (it only appears at the very end), so its row is empty and there is nothing to sample from.</Note>
      )}
      {n === 0 && <Note tone="warning">Nothing was generated.</Note>}
    </div>
  )
}

function TraceBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex flex-col justify-center rounded-lg bg-raised px-3 py-2">
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="num">{children}</span>
    </li>
  )
}

function Arrow({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-1 text-label text-muted-foreground"><NavArrowRightIcon className="size-4" />{children}</li>
}
