// "Check your understanding": one shared dialog for every lesson checkpoint.
// Explore → answer → feedback → revisit if needed → retry → acknowledge completion → continue.
// - A wrong answer keeps you here, with feedback that names what to revisit, never the answer.
// - Hints come one at a time, only when asked for. The solution is a separate, explicit choice.
// - Revisit minimises the dialog and keeps your place; "Return to checkpoint" brings it back.
// - Escape returns to the lesson without advancing or recording a pass.
// Questions come from lib/checkpoints.ts and are frozen when the dialog opens.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { InfoCircleIcon, LightBulbIcon, NavArrowRightIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { CHECKPOINT_BY_ID, isCorrect, questionFor, shouldAsk, statusOf, type CheckpointDef, type Context, type Question } from "@/lib/checkpoints"
import { usePrefersReducedMotion } from "@/lib/hooks"
import { actions, getState, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { PixelCheer } from "./pixel-cheer"
import { Source } from "./source"

type Phase = "ask" | "wrong" | "matched" | "solution" | "passed" | "empty"

interface Session {
  def: CheckpointDef
  ctx: Context
  question: Question | null
  variant: number
  phase: Phase
  hints: number
  /** The solution of this exact question was shown: answering it now is not an unassisted pass. */
  solutionShown: boolean
  minimized: boolean
  retake: boolean
  nextLabel?: string
  onContinue: () => void
  revisit?: () => void
  opener: HTMLElement | null
}

interface Opts { onContinue?: () => void; nextLabel?: string; revisit?: () => void }

interface CheckpointApi {
  /** Before moving on: ask, unless this checkpoint was already passed (and practice mode is off). */
  beforeNext: (id: string, ctx: Context, opts: Opts & { onContinue: () => void }) => void
  /** Open a checkpoint again on purpose, even if it was passed. */
  retake: (id: string, ctx: Context, opts?: Opts) => void
  /** The section was shown. Visiting is recorded on its own and never counts as a pass. */
  visit: (id: string) => void
  open: boolean
}

const CheckpointContext = createContext<CheckpointApi | null>(null)
export const useCheckpoints = () => useContext(CheckpointContext)

const qid = (q: Question) => `${q.checkpoint}@${q.version}#${q.instance}`

export function CheckpointProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  const start = useCallback((id: string, ctx: Context, opts: Opts, retake: boolean) => {
    const def = CHECKPOINT_BY_ID.get(id)
    if (!def) { opts.onContinue?.(); return }
    const question = questionFor(def, ctx, 0)
    setSession({ def, ctx, question, variant: question?.variant ?? 0, phase: question ? "ask" : "empty", hints: 0, solutionShown: false, minimized: false, retake, nextLabel: opts.nextLabel, onContinue: opts.onContinue ?? (() => {}), revisit: opts.revisit, opener: document.activeElement as HTMLElement | null })
  }, [])

  const api = useMemo<CheckpointApi>(() => ({
    beforeNext: (id, ctx, opts) => {
      const def = CHECKPOINT_BY_ID.get(id)
      if (!def || !shouldAsk(getState().checkpoints[id], def.version, getState().prefs.checkpointPractice ?? false)) { opts.onContinue(); return }
      start(id, ctx, opts, false)
    },
    retake: (id, ctx, opts = {}) => start(id, ctx, opts, true),
    visit: (id) => {
      const def = CHECKPOINT_BY_ID.get(id)
      if (def) actions.recordCheckpoint(id, def.version, "", "visited")
    },
    open: !!session && !session.minimized,
  }), [start, session])

  return (
    <CheckpointContext.Provider value={api}>
      {children}
      {session && <CheckpointDialog session={session} setSession={setSession} />}
    </CheckpointContext.Provider>
  )
}

// ----------------------------------------------------------------------------- the dialog

function CheckpointDialog({ session, setSession }: { session: Session; setSession: (s: Session | null) => void }) {
  const { def, question: q, phase } = session
  const [input, setInput] = useState("")
  const first = useRef<HTMLInputElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const reduced = usePrefersReducedMotion()
  const patch = (p: Partial<Session>) => setSession({ ...session, ...p })
  const record = (outcome: Parameters<typeof actions.recordCheckpoint>[3]) => q && actions.recordCheckpoint(def.id, def.version, qid(q), outcome)

  // Focus follows the step: the answer on a question, the main action on a result.
  useEffect(() => {
    if (session.minimized) return
    // A short delay lets the dialog's own focus handling settle first, so ours is the one that sticks.
    const t = window.setTimeout(() => {
      if (phase === "ask" || phase === "wrong") first.current?.focus()
      else primary.current?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [phase, session.minimized, session.variant])

  const close = () => {
    setSession(null)
    requestAnimationFrame(() => session.opener?.isConnected && session.opener.focus())
  }
  const continueOn = () => { setSession(null); session.onContinue() }

  function submit() {
    if (!q || !input.trim()) return
    if (!isCorrect(q, input)) { record("wrong"); patch({ phase: "wrong" }); return }
    if (session.solutionShown) { record("matched-after-solution"); patch({ phase: "matched" }); return }
    record(session.hints > 0 ? "passed-with-hints" : "passed")
    patch({ phase: "passed" })
  }

  function fresh() {
    const next = questionFor(def, session.ctx, session.variant + 1)
    setInput("")
    // A different example of the same idea; the user's own experiment is left untouched.
    patch({ question: next, variant: next?.variant ?? session.variant + 1, phase: next ? "ask" : "empty", hints: 0, solutionShown: false })
  }

  if (session.minimized) {
    return (
      <div role="region" aria-label="Checkpoint waiting" className="fixed inset-x-2 bottom-3 z-[57] mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion px-4 py-3 shadow-lg" data-testid="checkpoint-waiting">
        <p className="min-w-0 flex-1 text-sm"><span className="font-medium">Checkpoint waiting:</span> {def.section}. Your answer and hints are kept.</p>
        <Button size="sm" className="bg-action text-action-ink hover:bg-action/90" onClick={() => patch({ minimized: false })}>Return to checkpoint</Button>
        <Button size="sm" variant="ghost" onClick={close}>Close it</Button>
      </div>
    )
  }

  const status = statusOf(getState().checkpoints[def.id], def.version)
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[56] bg-black/30 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Dialog.Popup
          aria-labelledby={titleId}
          initialFocus={false}
          className={cn("fixed left-1/2 top-1/2 z-[57] flex max-h-[88dvh] w-[min(34rem,calc(100vw-20px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-[15px] border p-5 text-foreground shadow-xl outline-none sm:p-6",
            phase === "passed" ? "border-positive/40 border-t-[3px] border-t-positive bg-success" : "border-companion-edge border-t-[3px] border-t-data bg-companion",
            !reduced && "transition-[opacity,transform] duration-150 data-starting-style:opacity-0 data-starting-style:scale-[0.98]")}
          data-testid="checkpoint-dialog"
          data-phase={phase}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {phase === "passed"
                ? <PassedHeading id={titleId} hints={session.hints > 0} />
                : <Dialog.Title id={titleId} className="text-section font-semibold">{phase === "empty" ? "Section finished" : "Check your understanding"}</Dialog.Title>}
              <p className="text-label text-muted-foreground">After: {def.section}{session.retake ? ` · retake (current status: ${status})` : ""}</p>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Back to the lesson without checking" />}><XmarkIcon className="size-4" /></Dialog.Close>
          </div>

          {phase === "empty" && (
            <div className="flex flex-col gap-4">
              <p className="text-prose">There is no question that fits this run here (for example, it generated too few characters, or no row has more than one follower). Finishing the section is recorded only as a visit, not as understanding.</p>
              <div className="flex flex-wrap gap-2">
                <Button ref={primary} className="bg-action text-action-ink hover:bg-action/90" onClick={continueOn}>{session.nextLabel ? `Continue to ${session.nextLabel}` : "Continue"}</Button>
                <Button variant="ghost" onClick={close}>Stay here</Button>
              </div>
            </div>
          )}

          {phase === "passed" && q && (
            <div className="flex flex-col gap-4" data-testid="checkpoint-passed">
              <div className="flex items-center gap-4">
                <PixelCheer size={72} />
                <p className="text-prose">{q.passed}</p>
              </div>
              <p className="text-label text-muted-foreground">This is evidence about this one question, not proof of mastery. Your own explanations stay in the Notebook and the evidence panel.</p>
              <div className="flex flex-wrap gap-2">
                {!session.retake && session.nextLabel && <Button ref={primary} className="bg-action text-action-ink hover:bg-action/90" onClick={continueOn}>Continue to {session.nextLabel} <NavArrowRightIcon className="size-4" /></Button>}
                <Button ref={session.retake || !session.nextLabel ? primary : undefined} variant={session.retake || !session.nextLabel ? "default" : "ghost"} onClick={close}>Stay here</Button>
              </div>
            </div>
          )}

          {q && phase !== "passed" && phase !== "empty" && (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
              <p className="flex flex-wrap items-center gap-2 text-label text-muted-foreground"><Source kind={q.source === "Your model" ? "model" : "example"} /> {q.basis}</p>
              <fieldset className="flex flex-col gap-3" disabled={phase === "solution" || phase === "matched"}>
                <legend className="mb-3 text-prose font-medium">{q.prompt}</legend>
                {q.kind === "choice" ? (
                  <div className="flex flex-col gap-2">
                    {q.choices!.map((c, i) => (
                      <label key={c.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-prose", input === c.id ? "border-data bg-card" : "border-companion-edge hover:bg-card/60")}>
                        <input ref={i === 0 ? first : undefined} type="radio" name="checkpoint-answer" value={c.id} checked={input === c.id} onChange={() => { setInput(c.id); if (phase === "wrong") patch({ phase: "ask" }) }} className="mt-1 accent-[var(--data)]" />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="checkpoint-number" className="text-sm font-medium">Your answer</label>
                    <input ref={first} id="checkpoint-number" inputMode="decimal" autoComplete="off" value={input} onChange={(e) => { setInput(e.target.value); if (phase === "wrong") patch({ phase: "ask" }) }} aria-describedby="checkpoint-rounding" className="num h-11 w-40 rounded-md border border-input bg-card px-3 text-prose" />
                    <p id="checkpoint-rounding" className="text-label text-muted-foreground">{q.rounding}</p>
                  </div>
                )}
              </fieldset>

              <div role="status" aria-live="polite" className="empty:hidden">
                {phase === "wrong" && (
                  <p className="flex items-start gap-2 rounded-lg bg-card px-3 py-2.5 text-prose" data-testid="checkpoint-feedback">
                    <InfoCircleIcon className="mt-1 size-4 flex-none text-data" aria-hidden="true" /><span><span className="font-medium">Not quite yet.</span> {q.notYet.replace(/^Not quite yet\.\s*/, "")}</span>
                  </p>
                )}
                {phase === "matched" && (
                  <p className="rounded-lg bg-card px-3 py-2.5 text-prose" data-testid="checkpoint-feedback">That matches the solution you viewed, so it isn't counted as a pass. Try a new question to check it without help.</p>
                )}
              </div>

              {session.hints > 0 && (
                <ol className="flex flex-col gap-2" aria-label="Hints">
                  {q.hints.slice(0, session.hints).map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-prose"><LightBulbIcon className="mt-1 size-4 flex-none text-data" aria-hidden="true" /><span><span className="font-medium">Hint {i + 1} of 3.</span> {h}</span></li>
                  ))}
                </ol>
              )}

              {(phase === "solution" || phase === "matched") && (
                <div className="flex flex-col gap-2 rounded-lg bg-card p-4" data-testid="checkpoint-solution">
                  <p className="text-prose"><span className="font-medium">Answer:</span> {q.solution.answer}</p>
                  <p className="text-prose">{q.solution.explanation}</p>
                  <p className="tok text-sm">{q.solution.working}</p>
                  {session.revisit && <button type="button" className="self-start text-sm underline underline-offset-2" onClick={() => { patch({ minimized: true }); session.revisit!() }}>Back to the lesson step</button>}
                  <p className="text-label text-muted-foreground">Recorded as reviewed with the solution, until you pass a fresh question.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {phase === "ask" && <Button type="submit" className="bg-action text-action-ink hover:bg-action/90" disabled={!input.trim()}>Submit answer</Button>}
                {phase === "wrong" && <Button type="button" className="bg-action text-action-ink hover:bg-action/90" onClick={() => { patch({ phase: "ask" }); requestAnimationFrame(() => first.current?.focus()) }}>Try again</Button>}
                {(phase === "solution" || phase === "matched") && <Button ref={primary} type="button" className="bg-action text-action-ink hover:bg-action/90" onClick={fresh}>Try a new question</Button>}
                {session.revisit && <Button type="button" variant="outline" className="bg-card" onClick={() => { patch({ minimized: true }); session.revisit!() }}>Revisit this step</Button>}
                {(phase === "ask" || phase === "wrong") && session.hints < 3 && <Button type="button" variant="outline" className="bg-card" onClick={() => patch({ hints: session.hints + 1 })}><LightBulbIcon className="size-4" /> {session.hints === 0 ? "Get a hint" : "Another hint"}</Button>}
                {(phase === "ask" || phase === "wrong") && <Button type="button" variant="ghost" onClick={() => { record("solution-viewed"); patch({ phase: "solution", solutionShown: true }) }}>Show the solution</Button>}
              </div>
              {!session.retake && (
                <button type="button" className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => { record("skipped"); continueOn() }}>
                  Continue without checking{session.nextLabel ? ` (to ${session.nextLabel})` : ""}
                </button>
              )}
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PassedHeading({ id, hints }: { id: string; hints: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 24 24" className="size-8 flex-none" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="var(--positive)" opacity="0.14" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--positive)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="checkpoint-tick" />
      </svg>
      <Dialog.Title id={id} className="text-section font-semibold">{hints ? "Passed with hints" : "Checkpoint passed"}</Dialog.Title>
    </div>
  )
}

/** The status of a checkpoint and a way to take it again, for the lesson controls. */
export function CheckpointStatus({ id, ctx, revisit }: { id: string; ctx: Context; revisit?: () => void }) {
  const api = useCheckpoints()
  const rec = useLab((s) => s.checkpoints[id])
  const def = CHECKPOINT_BY_ID.get(id)
  if (!api || !def) return null
  const status = statusOf(rec, def.version)
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-foreground" data-testid="checkpoint-status">
      <span>Checkpoint for this section: <span className="font-medium text-foreground">{status}</span></span>
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => api.retake(id, ctx, { revisit })}>{status === "Passed" || status === "Passed with hints" ? "Retake checkpoint" : "Take the checkpoint"}</button>
    </p>
  )
}
