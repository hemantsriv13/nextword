// Ask local AI (the "Ask your tutor" tab): a pretrained model on this computer (served by Colibri)
// explains the step on screen.
// - Nothing is generated until a button is pressed. Showing the tab only asks whether the model runs.
// - Every answer is bound to the run and selection it was asked about. When those change, the old
//   answer stays, marked as belonging to the earlier experiment; a new conversation is a choice.
// - Off while a checkpoint question is in progress: the checkpoint's own hints and solution apply.
// The authored explanation above it never depends on any of this.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { NavArrowDownIcon, RefreshDoubleIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { assistErrorText, assistStatus, streamAssist, type AssistAction, type AssistRequest, type AssistStatus, type AssistTimings } from "@/lib/assist"
import { useCheckpoints } from "./checkpoint"
import { InfoTip } from "./info-tip"
import { Source } from "./source"

const MAX_QUESTION = 300
/** Answers count as slow at twice the active model's typical time (measured on this laptop). */
const slowAfter = (s: AssistStatus | undefined) => 2 * (s?.typicalSeconds ?? 5)

/** What a panel offers to ask about, described for people. */
export interface AssistTarget {
  /** What the backend recomputes the facts from (never the numbers themselves). */
  request: AssistRequest
  /** Binds answers to exactly this run and selection; a different key marks them as earlier. */
  key: string
  /** The lesson step's id and name, e.g. "probs", "Calculate probabilities". */
  stage: string
  stageLabel: string
  /** The run and selection in words, e.g. "Example passage, prompt “th”, seed 2; row ‘h’". */
  describe: string
  /** An example question for the free-text box. */
  placeholder?: string
}

type TurnState = "waiting" | "streaming" | "done" | "stopped" | "failed"
interface Turn {
  n: number
  action: AssistAction
  question?: string
  text: string
  startedAt: number
  state: TurnState
  error?: string
  timings?: AssistTimings
  /** Numbers in the answer found nowhere in the engine facts (a deterministic check run after the answer). */
  unverified?: string[]
  finish?: string | null
}
interface Conversation {
  id: string | null
  key: string
  stage: string
  stageLabel: string
  describe: string
  model: string | null
  facts: unknown
  /** The step's exact numbers, worded by the engine (not the model). */
  calculations: string[]
  turns: Turn[]
  /** Answers from earlier conversations about this same step and selection: still readable, not sent again. */
  earlier: Turn[]
  answered: number
  maxTurns: number
  /** Which next requests still fit in the model's context, as the backend measured after the last answer. */
  room?: Partial<Record<AssistAction, boolean>>
}
type Status = { state: "idle" | "checking" } | { state: "ready" | "down"; data?: AssistStatus; message?: string }

interface AssistApi {
  open: boolean
  setOpen: (open: boolean) => void
  status: Status
  check: () => void
  conv: Conversation | null
  busy: boolean
  ask: (target: AssistTarget, action: AssistAction, question?: string, fresh?: boolean, replaceLast?: boolean) => void
  retry: (target: AssistTarget) => void
  stop: () => void
  locked: boolean
}

const AssistContext = createContext<AssistApi | null>(null)

const ACTION_LABEL: Record<AssistAction, string> = {
  explain: "Explain this step",
  detail: "Explain in more detail",
  simpler: "Explain it more simply",
  example: "Show a small example",
  followup: "Question",
}

/** Holds the one AI conversation for a page, above its views, so changing step or view keeps it. */
export function AssistProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const [status, setStatus] = useState<Status>({ state: "idle" })
  const [conv, setConv] = useState<Conversation | null>(null)
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const checkpoints = useCheckpoints()
  const locked = !!checkpoints?.active

  const check = useCallback(() => {
    setStatus({ state: "checking" })
    assistStatus().then(
      (data) => setStatus({ state: data.available && data.modelServed ? "ready" : "down", data, message: data.message }),
      (err: Error) => setStatus({ state: "down", message: err.message }),
    )
  }, [])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    // Opening asks Colibri which models it serves: a listing, not a generation.
    if (next && (status.state === "idle" || status.state === "down")) check()
  }, [check, status.state])

  // A checkpoint question opened: stop any answer in progress.
  useEffect(() => { if (locked) controller.current?.abort() }, [locked])
  useEffect(() => () => controller.current?.abort(), [])

  const patchTurn = (n: number, p: Partial<Turn>) => setConv((c) => c && { ...c, turns: c.turns.map((t) => (t.n === n ? { ...t, ...p } : t)) })

  const ask = useCallback((target: AssistTarget, action: AssistAction, question?: string, fresh = false, replaceLast = false) => {
    if (locked || controller.current) return
    const key = target.key
    const current = conv
    const continuing = !fresh && current?.key === key && !!current.id
    const kept = continuing ? (replaceLast ? current!.turns.slice(0, -1) : current!.turns) : []
    const n = Math.max(0, ...(current?.turns ?? []).map((t) => t.n), ...(current?.earlier ?? []).map((t) => t.n)) + 1
    // A new conversation about the same step keeps the answers so far on screen, above it.
    const earlier = !continuing && current?.key === key ? [...current.earlier, ...current.turns.filter((t) => t.text)] : []
    const turn: Turn = { n, action, question, text: "", startedAt: Date.now(), state: "waiting" }
    setConv(continuing
      ? { ...current!, turns: [...kept, turn] }
      : { id: null, key, stage: target.stage, stageLabel: target.stageLabel, describe: target.describe, model: null, facts: null, calculations: [], turns: [turn], earlier, answered: 0, maxTurns: 4 })
    const ac = new AbortController()
    controller.current = ac
    setBusy(true)
    let text = ""
    streamAssist(
      { ...target.request, action, question, conversation: continuing ? current!.id! : undefined },
      (e) => {
        if (e.type === "start") {
          setConv((c) => c && { ...c, id: e.conversation, model: e.model, facts: e.facts, calculations: e.calculations ?? [], maxTurns: e.maxTurns })
          patchTurn(n, { state: "streaming" })
        } else if (e.type === "delta") {
          text += e.text
          patchTurn(n, { text })
        } else if (e.type === "done") {
          if (e.empty) patchTurn(n, { state: "failed", error: "The model returned no text. Try again, or ask in other words." })
          else patchTurn(n, { state: "done", timings: e.timingsMs, finish: e.finish, unverified: e.unverified ?? [] })
          setConv((c) => c && { ...c, answered: e.turns, maxTurns: e.maxTurns, room: e.room })
        } else if (e.type === "error") {
          patchTurn(n, { state: "failed", error: assistErrorText(e.code, e.message) })
          if (e.code === "ai_unavailable") setStatus({ state: "down", message: e.message })
        }
      },
      ac.signal,
    ).catch((err: Error) => {
      if (err.name === "AbortError") patchTurn(n, { state: "stopped" })
      else patchTurn(n, { state: "failed", error: err instanceof ApiError ? assistErrorText(err.code, err.message) : err.message })
      if (err instanceof ApiError && (err.code === "offline" || err.code === "ai_unavailable")) setStatus({ state: "down", message: err.message })
    }).finally(() => {
      // A stream that ended without "done" or "error" (the connection dropped) is not an answer.
      setConv((c) => c && { ...c, turns: c.turns.map((t) => (t.n === n && (t.state === "waiting" || t.state === "streaming") ? { ...t, state: "failed", error: "The connection to the backend closed before the answer finished." } : t)) })
      controller.current = null
      setBusy(false)
    })
  }, [conv, locked])

  const retry = useCallback((target: AssistTarget) => {
    const last = conv?.turns.at(-1)
    if (!conv || !last || (last.state !== "failed" && last.state !== "stopped")) return
    // Ask again in place of the failed answer: in the same conversation, or a new one if it never started.
    ask(target, last.action, last.question, false, true)
  }, [conv, ask])

  const stop = useCallback(() => controller.current?.abort(), [])

  const api = useMemo<AssistApi>(() => ({ open, setOpen, status, check, conv, busy, ask, retry, stop, locked }), [open, setOpen, status, check, conv, busy, ask, retry, stop, locked])
  return <AssistContext.Provider value={api}>{children}</AssistContext.Provider>
}

export const useAssist = () => useContext(AssistContext)

// ----------------------------------------------------------------------------- the tutor tab
// The panel (explanation.tsx) shows TutorTranscript in its one scrolling area and TutorComposer pinned
// below it, so the question box, Send and Stop stay in view however long the answers get.

const secs = (ms: number | null | undefined) => (ms == null ? "–" : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`)
const NEAR_BOTTOM = 72 // px: closer than this to the end counts as "following the answer"

/** Whole seconds since `since`, ticking only while `running`. */
function useElapsed(since: number, running: boolean) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  return Math.max(0, Math.round((now - since) / 1000))
}

/** Where a conversation stands relative to the step on screen. */
function useTutor(target: AssistTarget | null) {
  const a = useAssist()
  const conv = a?.conv ?? null
  // Explore view shows several steps at once: a conversation appears only in its own step's panel.
  const here = !!conv && !!target && conv.stage === target.stage
  const current = here && conv!.key === target!.key
  return {
    a, conv, here, current,
    otherStep: !!conv && !!target && !here,
    continuing: current && !!conv!.id,
    // Full when the turn limit is reached, or the backend says not even a follow-up still fits.
    full: current && (conv!.answered >= conv!.maxTurns || conv!.room?.followup === false),
    /** Whether one particular action still fits (a long detailed answer may leave room only for short ones). */
    fits: (action: AssistAction) => !(current && conv!.room?.[action] === false),
    fresh: !!conv && !current,
  }
}

/** The transcript: notice, engine numbers, answers and their states. `active` is whether the tab is shown. */
export function TutorTranscript({ target, active }: { target: AssistTarget | null; active: boolean }) {
  const t = useTutor(target)
  const { a, conv, here, current, otherStep } = t
  const root = useRef<HTMLDivElement | null>(null)
  const [unseen, setUnseen] = useState(false)
  const near = useRef(true)
  /** The panel's one scrolling area, which this transcript sits in. */
  const scroller = () => root.current?.closest<HTMLElement>("[data-panel-scroll]") ?? null

  // Showing the tab asks Colibri which models it serves: a listing, never a generation.
  useEffect(() => {
    if (active && a && (a.status.state === "idle")) a.check()
  }, [active, a])

  // Follow new text only while the reader is at the end; otherwise keep their place and offer a jump.
  const locked = !!a?.locked
  useEffect(() => {
    const el = scroller()
    if (!el) return
    const onScroll = () => {
      near.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
      if (near.current) setUnseen(false)
    }
    onScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [locked])
  const length = conv ? conv.earlier.length * 3 + conv.turns.reduce((n, x) => n + x.text.length + (x.error?.length ?? 0), 0) + conv.turns.length * 7 + conv.turns.map((x) => x.state).join().length : 0
  const turnCount = conv?.turns.length ?? 0
  const lastTurns = useRef(turnCount)
  useLayoutEffect(() => {
    const el = scroller()
    if (!el || !active) return
    const asked = turnCount > lastTurns.current // a question the reader just sent: take them to it
    lastTurns.current = turnCount
    const follow = asked || near.current
    if (follow) {
      el.scrollTop = el.scrollHeight
      near.current = true
    }
    // Measured from the layout, before paint: show "Jump to latest" only when new text is out of view.
    setUnseen(!follow && length > 0)
  }, [length, turnCount, active])
  const jump = () => {
    const el = scroller()
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    setUnseen(false)
  }

  if (!a) return null
  if (a.locked) {
    return <p className="rounded-lg bg-raised px-3.5 py-2.5 text-sm" role="status" data-testid="ai-locked">Local AI is off while a checkpoint question is open, so it can't answer the question for you. Use the checkpoint's <span className="font-medium">Get a hint</span> and <span className="font-medium">Show the solution</span> buttons.</p>
  }
  return (
    <div ref={root} className="flex flex-col gap-3" data-testid="ask-ai">
      {target && <p className="text-label text-muted-foreground" data-testid="ai-step">About this step: <span className="font-medium text-foreground">{target.stageLabel}</span></p>}
      <ModelLine a={a} />
      {otherStep && <p className="text-sm text-muted-foreground">Your AI conversation is about step “{conv!.stageLabel}”. Asking here starts a new one.</p>}
      {here && (
        <div className="flex flex-col gap-3" data-testid="ai-conversation" data-current={current ? "true" : "false"}>
          {!current && (
            <p className="rounded-lg bg-src-sim px-3.5 py-2.5 text-sm text-src-sim-ink" role="status" data-testid="ai-stale">
              These answers are about an earlier experiment: {conv!.describe}. They were not updated for what is on screen now.
            </p>
          )}
          {(conv!.calculations.length > 0 || conv!.facts != null) && <EngineFacts calculations={conv!.calculations} facts={conv!.facts} />}
          {conv!.earlier.length > 0 && (
            <>
              {conv!.earlier.map((x) => <TurnView key={x.n} turn={x} slowAfter={Infinity} />)}
              <p className="flex items-center gap-2 text-label text-muted-foreground" data-testid="ai-new-conversation"><span className="h-px flex-1 bg-companion-edge" />New conversation about this step<span className="h-px flex-1 bg-companion-edge" /></p>
            </>
          )}
          {conv!.turns.map((x) => <TurnView key={x.n} turn={x} slowAfter={slowAfter(a.status.state === "ready" || a.status.state === "down" ? a.status.data : undefined)} onRetry={current && x === conv!.turns.at(-1) && target ? () => a.retry(target) : undefined} />)}
        </div>
      )}
      {!here && a.status.state === "ready" && target && <p className="text-sm text-muted-foreground">Ask for a short explanation of this step, or type your own question below.</p>}
      {unseen && (
        <div className="sticky bottom-2 flex justify-center">
          <Button size="sm" className="shadow-md" onClick={jump} data-testid="ai-jump"><NavArrowDownIcon className="size-4" /> Jump to latest</Button>
        </div>
      )}
    </div>
  )
}

function ModelLine({ a }: { a: AssistApi }) {
  const s = a.status
  if (s.state === "idle" || s.state === "checking") return <p className="text-sm text-muted-foreground" role="status">Checking whether the local model is running…</p>
  if (s.state === "ready") {
    return (
      <p className="rounded-lg bg-companion-callout px-3 py-2 text-sm" data-testid="ai-model">
        <span className="font-medium">Experimental and can be wrong.</span> <span className="tok">{s.data?.model}</span>, on this computer. The written explanation in “Understand this step” is the reference.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-raised px-3.5 py-2.5 text-sm" role="status" data-testid="ai-down">
      <p><span className="font-medium">The local model isn't running.</span> Start it with <code className="tok rounded bg-secondary px-1">local-ai\start-colibri.cmd</code>, then check again. The written explanation in “Understand this step” works without it.</p>
      {"message" in s && s.message && <p className="text-label text-muted-foreground">{s.message}</p>}
      <Button variant="outline" size="sm" className="w-fit" onClick={a.check}><RefreshDoubleIcon className="size-4" /> Check again</Button>
    </div>
  )
}

/** The step's exact numbers as the engine words them, and the facts the model was sent. Apart from the AI text. */
function EngineFacts({ calculations, facts }: { calculations: string[]; facts: unknown }) {
  return (
    <details className="rounded-xl bg-raised px-4 py-1 text-sm" data-help-id="ai.facts">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-medium">Numbers from your engine{calculations.length ? ` (${calculations.length})` : ""}</summary>
      <div className="flex flex-col gap-2 pb-3">
        {calculations.length > 0 && (
          <section className="flex flex-col gap-2" data-testid="ai-engine-numbers" aria-label="Numbers from your engine">
            <Source kind="model" className="w-fit" />
            <ul className="tok flex flex-col gap-1">{calculations.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="text-label text-muted-foreground">Correct, but the AI text may still misuse them.</p>
          </section>
        )}
        {facts != null && (
          <div>
            <p className="text-label text-muted-foreground">Facts sent to the model: recomputed by your Python engine for this run and step. The model saw only these and the instructions.</p>
            <pre className="tok mt-1 whitespace-pre-wrap break-words rounded-lg bg-card p-3 text-xs" data-testid="ai-facts">{JSON.stringify(facts, null, 1)}</pre>
          </div>
        )}
      </div>
    </details>
  )
}

function TurnView({ turn: t, slowAfter, onRetry }: { turn: Turn; slowAfter: number; onRetry?: () => void }) {
  const running = t.state === "waiting" || t.state === "streaming"
  const elapsed = useElapsed(t.startedAt, running)
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4" data-testid="ai-turn" data-state={t.state} aria-busy={running}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Source kind="ai" />
        <span className="text-label text-muted-foreground">{t.action === "followup" ? <>You asked: “{t.question}”</> : <>You asked: {ACTION_LABEL[t.action]}</>}</span>
      </header>
      {t.text && <div className="whitespace-pre-wrap break-words text-prose" data-testid="ai-text">{t.text}</div>}
      <div aria-live="polite" className="text-sm">
        {t.state === "waiting" && <p className="text-muted-foreground">Waiting for the first words… {elapsed} s</p>}
        {t.state === "streaming" && <p className="text-muted-foreground">Answering… {elapsed} s</p>}
        {running && elapsed >= slowAfter && <p className="text-muted-foreground">This is taking longer than usual for this model (usually under {slowAfter} s). You can stop it; the text so far is kept.</p>}
        {t.state === "stopped" && <p>Stopped. The partial answer above is kept here, but not used for follow-up questions.</p>}
        {t.state === "failed" && <p role="alert" className="text-negative">{t.error}</p>}
        {t.state === "done" && (
          <p className="text-muted-foreground" data-testid="ai-timing" data-help-id="ai.timing">
            First words after <span className="num">{secs(t.timings?.firstText)}</span>, finished after <span className="num">{secs(t.timings?.total)}</span>{t.finish === "length" ? "; cut off at the length limit. Ask “Explain in more detail” for a longer answer" : ""}.{" "}
            <InfoTip id="ai.timing" className="inline-flex align-middle" />
          </p>
        )}
        {t.state === "done" && (t.unverified?.length ?? 0) > 0 && (
          <p className="mt-1 rounded-lg bg-src-sim px-3 py-2 text-sm text-src-sim-ink" data-testid="ai-unverified">
            Check this answer: it mentions {t.unverified!.join(", ")}, {t.unverified!.length === 1 ? "a number" : "numbers"} not found in the numbers from your engine. Trust the engine’s numbers.
          </p>
        )}
      </div>
      {onRetry && (t.state === "failed" || t.state === "stopped") && <div><Button variant="outline" size="sm" onClick={onRetry}><RefreshDoubleIcon className="size-4" /> Try again</Button></div>}
    </article>
  )
}

/** The question box and the explanation actions, pinned at the bottom of the tutor tab. */
export function TutorComposer({ target }: { target: AssistTarget | null }) {
  const { a, continuing, full, fresh, fits } = useTutor(target)
  const [question, setQuestion] = useState("")
  const qId = useId()
  const hintId = useId()
  if (!a || a.locked || !target) return null
  const ready = a.status.state === "ready"
  const disabled = !ready || a.busy || full
  const send = (action: AssistAction, q?: string) => { a.ask(target, action, q, fresh); if (q) setQuestion("") }
  return (
    <div className="flex flex-col gap-2" data-testid="ai-actions">
      {fresh && <p className="text-sm font-medium">New conversation about the step on screen</p>}
      {full && <p className="text-sm text-muted-foreground" data-testid="ai-full">Conversation full: the model can't keep more in mind. A new one keeps this one above.</p>}
      <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>span>button:first-child]:min-h-11 lg:[&>button]:min-h-8 lg:[&>span>button:first-child]:min-h-8">
        {!continuing && <Button size="sm" className="bg-action text-action-ink hover:bg-action/90" data-help-id="ai.explain" disabled={disabled} onClick={() => send("explain")}>Explain this step</Button>}
        {/* These refer to an answer, so they appear once there is one. */}
        {/* A detailed answer may not fit after a short one; then it starts a new conversation (the answers so far stay). */}
        {continuing && <Button size="sm" variant="outline" className="bg-card" disabled={!ready || a.busy} onClick={() => fits("detail") && !full ? send("detail") : a.ask(target, "detail", undefined, true)}>{fits("detail") && !full ? "Explain in more detail" : "Explain in more detail (new conversation)"}</Button>}
        {continuing && <Button size="sm" variant="outline" className="bg-card" disabled={disabled || !fits("simpler")} onClick={() => send("simpler")}>Explain it more simply</Button>}
        {continuing && <Button size="sm" variant="outline" className="bg-card" disabled={disabled || !fits("example")} onClick={() => send("example")}>Show a small example</Button>}
        {continuing && <Button size="sm" variant={full ? "default" : "ghost"} disabled={a.busy || !ready} onClick={() => a.ask(target, "explain", undefined, true)} data-testid="ai-restart">Start a new conversation</Button>}
      </div>
      <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); const q = question.trim(); if (q && !disabled) send("followup", q) }}>
        <label htmlFor={qId} className="sr-only">{continuing ? "Ask a follow-up" : "Ask a short question"}</label>
        <div className="flex gap-2">
          <input id={qId} value={question} maxLength={MAX_QUESTION} onChange={(e) => setQuestion(e.target.value)} aria-describedby={hintId}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-base sm:text-sm" placeholder={continuing ? "Ask a follow-up…" : target.placeholder ?? "Ask a short question…"} enterKeyHint="send" />
          {a.busy
            ? <Button type="button" variant="outline" className="h-11 bg-card" onClick={a.stop}><XmarkIcon className="size-4" /> Stop</Button>
            : <Button type="submit" variant="outline" className="h-11 bg-card" disabled={disabled || !question.trim()}>Ask</Button>}
        </div>
        <p id={hintId} className="text-label text-muted-foreground">{a.busy ? "Write your next question now; Ask works when this answer ends." : "Sends only this step's facts, never your quiz answers."}</p>
      </form>
    </div>
  )
}
