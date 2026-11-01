// Beginner lessons: learn to read an experiment from the very start. Each lesson asks one plain question,
// shows a small example, asks for a prediction, shows what the real engine computed, explains why, and only
// then names the idea. A check with a different example closes it.
// - The app decides the order, the results (nextword/lab/lessons.py), progress and grading.
// - The written text (content/lessons.json) works without the local AI; the tutor only rewords.
// - The tutor is off while a check is open, and isn't offered on the check step at all.
import { useEffect, useState } from "react"
import { CheckIcon, EyeIcon, InfoCircleIcon, LightBulbIcon, NavArrowRightIcon, RefreshDoubleIcon, UndoIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { AssistProvider, useAssist, type AssistTarget } from "@/components/lab/ask-ai"
import { ExplanationPanel } from "@/components/lab/explanation"
import { IntervalStrip, ProbBars, Tok } from "@/components/lab/charts"
import { Look, TrainingReplay, UpdateReplay } from "@/components/lab/replay"
import { CheckpointStatus, useCheckpoints } from "@/components/lab/checkpoint"
import { Term } from "@/components/lab/glossary"
import { ErrorNote, LoadingRows, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { lessonKey, type LessonRef } from "@/lib/assist"
import { CHECKPOINT_BY_ID, statusOf } from "@/lib/checkpoints"
import { hrefFor } from "@/lib/hooks"
import { checkpointId, LESSON_BY_ID, LESSONS, lessonResult, lessonStatus, PARTS, resumePlace, STATUS_TONE, STEPS, termsSoFar, type LessonResult, type LessonStatus, type LessonText, type Place } from "@/lib/lessons"
import { actions, useLab } from "@/lib/store"
import type { Route } from "@/content/glossary"
import { cn } from "@/lib/utils"

const n4 = (x: number) => x.toFixed(4)
const q = (c: string) => `‘${c}’`

export default function Learn() {
  return <AssistProvider><LearnPage /></AssistProvider>
}

function LearnPage() {
  const place = useLab((s) => s.lessons.place)
  const records = useLab((s) => s.lessons.records)
  const checks = useLab((s) => s.checkpoints)
  const [open, setOpen] = useState<Place | null>(place)

  if (!open) return <Overview records={records} checks={checks} onOpen={(p) => { actions.setLessonPlace(p); setOpen(p) }} resume={resumePlace(place, records, checks)} />
  return <LessonView place={open} onPlace={(p) => { actions.setLessonPlace(p); setOpen(p) }} onOverview={() => setOpen(null)} />
}

// ----------------------------------------------------------------------------- overview

function StatusBadge({ status }: { status: LessonStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span data-testid="lesson-status" className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium leading-5",
      tone === "done" && "bg-success text-positive", tone === "help" && "bg-data-soft text-foreground", tone === "skip" && "bg-src-sim text-src-sim-ink",
      tone === "open" && "bg-raised text-foreground ring-1 ring-inset ring-border", tone === "none" && "text-muted-foreground")}>
      {tone === "done" && <CheckIcon className="size-3.5" aria-hidden="true" />}{status}
    </span>
  )
}

function Overview({ records, checks, onOpen, resume }: { records: Record<string, import("@/lib/lessons").LessonRecord>; checks: Record<string, import("@/lib/checkpoints").CheckpointRecord>; onOpen: (p: Place) => void; resume: Place }) {
  const [confirmReset, setConfirmReset] = useState(false)
  const resumeLesson = LESSON_BY_ID.get(resume.lesson)!
  const started = Object.keys(records).length > 0
  return (
    <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6 lg:px-8 lg:pt-8" data-testid="lessons-overview">
      <header className="flex flex-col gap-3">
        <h1 className="text-lesson font-semibold sm:text-page">Beginner lessons</h1>
        <p className="measure text-prose text-muted-foreground">Start here if the technical words are new. Each lesson asks one question and lets you predict the answer. Then it shows what the real model computed, explains why, and only then gives the idea its name.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="bg-action text-action-ink hover:bg-action/90" onClick={() => onOpen(resume)} data-testid="lessons-continue">
            {started ? <>Continue: {resumeLesson.title}</> : <>Start with lesson 1: {resumeLesson.title}</>} <NavArrowRightIcon className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Your place is saved in this browser.</span>
        </div>
      </header>

      {PARTS.map((part) => (
        <section key={part.id} aria-labelledby={`part-${part.id}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`part-${part.id}`} className="text-section font-semibold">{part.title}</h2>
            <p className="text-sm text-muted-foreground">{part.about}</p>
          </div>
          <ol className="flex flex-col divide-y divide-border rounded-2xl border border-canvas-edge bg-canvas">
            {LESSONS.filter((l) => l.part === part.id).map((l) => {
              const n = LESSONS.indexOf(l) + 1
              const status = lessonStatus(records[l.id], checks[checkpointId(l.id)])
              const rec = records[l.id]
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5" data-testid={`lesson-row-${l.id}`}>
                  <span className="num w-6 flex-none text-sm text-muted-foreground">{n}</span>
                  <div className="min-w-0 flex-[1_1_16rem]">
                    <p className="font-medium">{l.title}</p>
                    <p className="text-sm text-muted-foreground">{l.question}</p>
                  </div>
                  <StatusBadge status={status} />
                  <div className="flex flex-none items-center gap-1">
                    <Button variant="outline" size="sm" className="bg-card" onClick={() => onOpen({ lesson: l.id, step: rec && status === "In progress" ? Math.min(rec.reached, STEPS.length - 1) : 0, example: 0 })}>
                      {status === "Not started" ? "Open" : status === "In progress" ? "Continue" : "Revisit"}<span className="sr-only">: {l.title}</span>
                    </Button>
                    {(status === "Not started" || status === "In progress") && (
                      <Button variant="ghost" size="sm" onClick={() => actions.skipLesson(l.id)}>Skip<span className="sr-only">: {l.title}</span></Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      <section aria-label="Statuses and progress" className="flex flex-col gap-2 text-sm">
        <details>
        <summary className="w-fit cursor-pointer py-2 font-semibold hover:text-data">What the statuses mean</summary>
        <ul className="mt-1 flex flex-col gap-1.5">
          <li><StatusBadge status="Completed on your own" /> You passed the check without hints.</li>
          <li><StatusBadge status="Completed with help" /> You passed the check after using hints.</li>
          <li><StatusBadge status="Reviewed with the solution" /> You looked at the check's solution and haven't passed a new question since.</li>
          <li><StatusBadge status="Check skipped" /> You finished the lesson but skipped its check. <StatusBadge status="Skipped" /> You skipped the lesson.</li>
        </ul>
        <p className="mt-2 text-muted-foreground">Help you ask for during a lesson (simpler wording, the tutor) is noted but doesn't change these. Only the check does, and the app grades it, not the AI.</p>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          {!confirmReset ? (
            <button type="button" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setConfirmReset(true)}>Start the lessons over</button>
          ) : (
            <>
              <span>Clear your place and every lesson status?</span>
              <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Keep them</Button>
              <Button size="sm" variant="ghost" onClick={() => { actions.resetLessons(); setConfirmReset(false) }}>Clear</Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// ----------------------------------------------------------------------------- one lesson

type Help = "simpler" | "look" | "matters"

function LessonView({ place, onPlace, onOverview }: { place: Place; onPlace: (p: Place) => void; onOverview: () => void }) {
  const lesson = LESSON_BY_ID.get(place.lesson)!
  const index = LESSONS.indexOf(lesson)
  const next = LESSONS[index + 1]
  const step = Math.min(place.step, STEPS.length - 1)
  const stepId = STEPS[step].id
  const resultKey = `${lesson.id}#${place.example}`
  // Results, errors and open help belong to one lesson, example (and step): stored with their key, so a
  // change of lesson or example shows nothing stale.
  const [loaded, setLoaded] = useState<{ key: string; r?: LessonResult; error?: unknown } | null>(null)
  const r = loaded?.key === resultKey ? loaded.r ?? null : null
  const error = loaded?.key === resultKey ? loaded.error ?? null : null
  const helpKey = `${resultKey}@${place.step}`
  const [helpState, setHelpState] = useState<{ key: string; kind: Help } | null>(null)
  const help = helpState?.key === helpKey ? helpState.kind : null
  const setHelp = (kind: Help | null) => setHelpState(kind ? { key: helpKey, kind } : null)
  const checkpoints = useCheckpoints()
  const reached = useLab((s) => s.lessons.records[lesson.id]?.reached ?? 0)
  const checkRec = useLab((s) => s.checkpoints[checkpointId(lesson.id)])
  const passed = ["Passed", "Passed with hints"].includes(statusOf(checkRec, 1))
  const prediction = useLab((s) => s.lessons.records[lesson.id]?.predictions?.[place.example])

  const load = () => lessonResult(lesson.id, place.example).then((x) => setLoaded({ key: resultKey, r: x }), (e) => setLoaded({ key: resultKey, error: e }))
  useEffect(() => {
    let alive = true
    lessonResult(lesson.id, place.example).then((x) => alive && setLoaded({ key: resultKey, r: x }), (e) => alive && setLoaded({ key: resultKey, error: e }))
    return () => { alive = false }
  }, [lesson.id, place.example, resultKey])
  useEffect(() => { checkpoints?.visit(checkpointId(lesson.id)) }, [lesson.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (s: number) => onPlace({ ...place, step: Math.max(0, Math.min(STEPS.length - 1, s)) })
  // A prediction belongs to one example: a new example after the result means predicting again.
  const another = () => r && onPlace({ ...place, example: (place.example + 1) % r.examples, step: Math.min(step, 1) })
  const toggle = (h: Help) => {
    setHelp(help === h ? null : h)
    if (h === "simpler" && help !== h) actions.recordLessonHelp(lesson.id, "simpler")
  }
  const nextLesson = () => next ? onPlace({ lesson: next.id, step: 0, example: 0 }) : onOverview()
  const startCheck = () => checkpoints?.beforeNext(checkpointId(lesson.id), {}, { onContinue: nextLesson, nextLabel: next ? `lesson ${index + 2}: ${next.title}` : "the lesson list", revisit: () => go(STEPS.findIndex((s) => s.id === "result")) })

  // The tutor opens once the result is shown (so it can't give a prediction away) and is off for the check.
  const tutorStep = stepId === "result" || stepId === "why" || stepId === "term" ? stepId : null
  const target: AssistTarget | null = tutorStep ? {
    request: { lesson: { id: lesson.id, step: tutorStep, example: place.example } satisfies LessonRef },
    key: lessonKey({ id: lesson.id, step: tutorStep, example: place.example }),
    stage: `lesson-${lesson.id}`, stageLabel: `${lesson.title}: ${STEPS[step].label}`,
    describe: `lesson ${index + 1}, example ${place.example + 1}, step “${STEPS[step].label}”`,
    placeholder: "What does this mean?",
  } : null

  const primary = (() => {
    switch (stepId) {
      case "question": return { label: "Make a prediction", on: () => go(1), disabled: false }
      case "predict": return { label: "Show what happened", on: () => go(2), disabled: !prediction }
      case "result": return { label: "Why did that happen?", on: () => go(3), disabled: false }
      case "why": return { label: "The word for it", on: () => go(4), disabled: false }
      case "term": return { label: "Check your understanding", on: () => go(5), disabled: false }
      default: return passed
        ? { label: next ? `Next lesson: ${next.title}` : "Back to all lessons", on: nextLesson, disabled: false }
        : { label: "Start the check", on: startCheck, disabled: false }
    }
  })()

  return (
    <Workspace
      title={`${index + 1}. ${lesson.title}`}
      subtitle={<span>{PARTS.find((p) => p.id === lesson.part)?.title} · lesson {index + 1} of {LESSONS.length}</span>}
      actions={<Button variant="outline" size="sm" onClick={onOverview} data-testid="lessons-all">All lessons</Button>}
      panel={<LessonPanel lesson={lesson} step={step} target={target} beforeResult={step < 2} />}
    >
      <nav aria-label="Lesson steps" data-testid="lesson-steps">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const available = i <= Math.max(reached, step) && !(i >= 2 && !prediction && i > step)
            return (
              <li key={s.id}>
                <button type="button" disabled={!available} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}
                  className={cn("flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-sm",
                    i === step ? "border-data bg-data-soft font-medium" : available ? "border-border bg-card hover:bg-raised" : "border-transparent text-muted-foreground")}>
                  <span className="num text-xs">{i + 1}</span>
                  {/* On a phone only the current step shows its name; the others keep it for screen readers. */}
                  <span className={i === step ? undefined : "sr-only sm:not-sr-only"}>{s.label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <section aria-labelledby="lesson-step-h" className="flex flex-col gap-5 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7" data-testid="lesson-step" data-step={stepId}>
        <h2 id="lesson-step-h" className="sr-only">{STEPS[step].label}</h2>
        {error != null && <ErrorNote error={error} onRetry={() => { setLoaded(null); void load() }} />}
        {stepId === "question" && <QuestionStep lesson={lesson} r={r} />}
        {stepId === "predict" && (r ? <PredictStep r={r} value={prediction} onPick={(v) => actions.setLessonPrediction(lesson.id, place.example, v)} /> : !error && <LoadingRows rows={3} label="Computing the example" />)}
        {stepId === "result" && (r ? <ResultStep lesson={lesson} r={r} prediction={prediction} look={help === "look"} /> : !error && <LoadingRows rows={4} label="Computing the result" />)}
        {stepId === "why" && <WhyStep lesson={lesson} r={r} look={help === "look"} />}
        {stepId === "term" && <TermStep lesson={lesson} />}
        {stepId === "check" && <CheckStep lesson={lesson} />}

        {help && (
          <div className="flex gap-3 rounded-xl bg-companion-callout p-4" data-testid={`lesson-help-${help}`} role="note">
            {help === "look" ? <EyeIcon className="mt-0.5 size-5 flex-none text-data" aria-hidden="true" /> : <LightBulbIcon className="mt-0.5 size-5 flex-none text-data" aria-hidden="true" />}
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-semibold">{help === "simpler" ? "More simply" : help === "look" ? "What to look at" : "Why this matters"}</h3>
              <p className="text-prose">{help === "simpler" ? lesson.simpler : help === "matters" ? lesson.matters : step < 2 ? `First read the question and make your prediction. Then: ${lesson.lookAt}` : lesson.lookAt}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-canvas-edge pt-4">
          <Button className="min-h-11 bg-action text-action-ink hover:bg-action/90" onClick={primary.on} disabled={primary.disabled} data-testid="lesson-primary">
            {primary.label} <NavArrowRightIcon className="size-4" />
          </Button>
          {primary.disabled && stepId === "predict" && <span className="text-sm text-muted-foreground">Choose an answer first. It's only a guess; it isn't graded.</span>}
          <span className="flex-1" />
          <button type="button" className="min-h-11 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => { actions.skipLesson(lesson.id); nextLesson() }}>
            Skip this lesson
          </button>
        </div>
      </section>

      <div role="toolbar" aria-label="Lesson help" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:h-auto [&>button]:min-h-11 [&>button]:justify-start [&>button]:whitespace-normal [&>button]:text-left" data-testid="lesson-controls">
        <Button variant="outline" className="bg-card" onClick={() => go(step - 1)} disabled={step === 0}><UndoIcon className="size-4" /> Go back one step</Button>
        <Button variant="outline" className="bg-card" aria-pressed={help === "simpler"} onClick={() => toggle("simpler")}><LightBulbIcon className="size-4" /> Explain more simply</Button>
        <Button variant="outline" className="bg-card" onClick={another} disabled={!r || r.examples < 2 || stepId === "check"}><RefreshDoubleIcon className="size-4" /> Show another example</Button>
        <Button variant="outline" className="bg-card" aria-pressed={help === "look"} onClick={() => toggle("look")}><EyeIcon className="size-4" /> What should I look at?</Button>
        <Button variant="outline" className="bg-card" aria-pressed={help === "matters"} onClick={() => toggle("matters")}><InfoCircleIcon className="size-4" /> Why does this matter?</Button>
      </div>
      {r && <p className="text-label text-muted-foreground">Example {place.example + 1} of {r.examples}{step >= 2 ? ". Another example starts again at the prediction." : "."}</p>}
    </Workspace>
  )
}

// ----------------------------------------------------------------------------- the right-hand panel

function TermList({ terms }: { terms: LessonText["term"][] }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {terms.map((t) => <div key={t.name}><dt className="font-medium"><Term id={t.glossary}>{t.name}</Term></dt><dd className="text-muted-foreground">{t.definition}</dd></div>)}
    </dl>
  )
}

function LessonPanel({ lesson, step, target, beforeResult }: { lesson: LessonText; step: number; target: AssistTarget | null; beforeResult: boolean }) {
  const off = beforeResult
    ? "The local AI tutor opens after you've made your prediction, so it can't give the answer away. Until then, use “What should I look at?” or “Explain more simply”."
    : "The tutor is off for the check, so it can't answer it for you. The check has its own hints, and its solution is shown only if you ask."
  const terms = termsSoFar(lesson.id, step)
  // Asking the tutor is noted on the lesson (like simpler wording); it doesn't change the check's status.
  const asked = useAssist()?.conv
  const askedHere = !!asked && asked.stage === `lesson-${lesson.id}` && asked.turns.length > 0
  useEffect(() => { if (askedHere) actions.recordLessonHelp(lesson.id, "tutor") }, [askedHere, lesson.id])
  return (
    <ExplanationPanel label={`Lesson ${LESSONS.indexOf(lesson) + 1}: ${STEPS[step].label}`} title={lesson.title} testid="lesson-explanation" desktopFrom={1100} tutor={{ target, off }}>
    <div className="flex flex-col gap-5" data-testid="lesson-panel">
      <p className="text-prose"><span className="font-medium">{lesson.question}</span></p>
      <section className="flex flex-col gap-2" aria-labelledby="words-h">
        <h3 id="words-h" className="font-semibold">Words so far</h3>
        {terms.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Each lesson adds its word after you've seen the idea.</p> : (
          <div className="flex flex-col gap-2" data-testid="lesson-terms">
            <TermList terms={terms.slice().reverse().slice(0, 3)} />
            {terms.length > 3 && (
              <details className="text-sm">
                <summary className="w-fit cursor-pointer py-2 text-muted-foreground hover:text-foreground">All {terms.length} words so far</summary>
                <TermList terms={terms.slice().reverse().slice(3)} />
              </details>
            )}
          </div>
        )}
      </section>
      <details className="text-sm" data-testid="lesson-detail">
        <summary className="w-fit cursor-pointer py-2 font-medium hover:text-data">More detail (optional)</summary>
        <p className="mt-1 text-prose">{lesson.detail}</p>
        <a className="mt-2 inline-block underline underline-offset-2" href={hrefFor(lesson.deeper.route as Route)}>{lesson.deeper.label}</a>
      </details>
    </div>
    </ExplanationPanel>
  )
}

// ----------------------------------------------------------------------------- steps

function ExampleView({ r }: { r: LessonResult }) {
  const x = r as Record<string, unknown>
  if (r.engine === "bigram") {
    return (
      <div className="flex flex-col gap-2" data-testid="lesson-example">
        <p className="text-label text-muted-foreground">The example text</p>
        <p className="tok w-fit rounded-lg bg-card px-3 py-2 text-lg">“{String(x.text)}”</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3" data-testid="lesson-example">
      <p className="text-sm"><span className="font-medium">Training text:</span> {String(x.dataset)}{x.level ? <> ({String(x.level)})</> : null}</p>
      {typeof x.trainingText === "string" && <p className="tok max-w-full overflow-hidden text-ellipsis whitespace-pre-wrap break-words rounded-lg bg-card px-3 py-2 text-sm">“{x.trainingText.slice(0, 120)}{x.trainingText.length > 120 ? "…" : ""}”</p>}
      {Array.isArray(x.window) && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">Window: {(x.window as string[]).map((c, i) => <Tok key={i} tone="context">{c}</Tok>)} <NavArrowRightIcon className="size-4" aria-label="then" /> next: <Tok tone="chosen">{String(x.target)}</Tok></p>
      )}
      <p className="text-label text-muted-foreground">This text trains only the small network in this lesson. It does not train Qwen, the AI tutor.</p>
    </div>
  )
}

function QuestionStep({ lesson, r }: { lesson: LessonText; r: LessonResult | null }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-label font-medium text-data">The question</p>
      <p className="text-lesson font-semibold" data-testid="lesson-question">{lesson.question}</p>
      <p className="measure text-prose">{lesson.setup}</p>
      {r ? <ExampleView r={r} /> : <LoadingRows rows={2} label="Loading the example" />}
    </div>
  )
}

function PredictStep({ r, value, onPick }: { r: LessonResult; value?: string; onPick: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid="lesson-predict">
      <legend className="mb-3 text-prose font-medium">{r.prediction.prompt}</legend>
      {r.prediction.show && (
        <ul className="flex flex-wrap gap-2 text-sm">{r.prediction.show.map((s) => <li key={s.token} className="rounded-md bg-card px-2 py-1"><Tok>{s.token}</Tok> score <span className="num">{n4(s.score)}</span></li>)}</ul>
      )}
      <div className="flex flex-col gap-2">
        {r.prediction.options.map((o) => (
          <label key={o} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-prose", value === o ? "border-data bg-card" : "border-canvas-edge hover:bg-card/60")}>
            <input type="radio" name="lesson-prediction" value={o} checked={value === o} onChange={() => onPick(o)} className="mt-1 accent-[var(--data)]" />
            <span>{o}</span>
          </label>
        ))}
      </div>
      <p className="text-label text-muted-foreground">A prediction is a guess before you see the answer. Wrong guesses are useful: they show what to look at.</p>
    </fieldset>
  )
}

function ResultStep({ lesson, r, prediction, look }: { lesson: LessonText; r: LessonResult; prediction?: string; look: boolean }) {
  const right = prediction === r.prediction.answer
  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex flex-col gap-1 rounded-xl p-4", right ? "bg-success" : "bg-raised")} role="status" data-testid="lesson-outcome">
        <p className="text-prose"><span className="font-medium">Your prediction:</span> {prediction ?? "none"}</p>
        <p className="text-prose"><span className="font-medium">What the model did:</span> {r.prediction.answer}</p>
        <p className="text-sm text-muted-foreground">{right ? "Your prediction matched." : prediction ? "Not what you predicted. The result below shows why." : "Go back one step to make a prediction."}</p>
      </div>
      <ResultView lesson={lesson.id} r={r} look={look} />
      <Facts r={r} />
    </div>
  )
}

function WhyStep({ lesson, r, look }: { lesson: LessonText; r: LessonResult | null; look: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-label font-medium text-data">Why</p>
      <p className="measure text-prose" data-testid="lesson-why">{lesson.why}</p>
      {r && <ResultView lesson={lesson.id} r={r} look={look} compact />}
    </div>
  )
}

function TermStep({ lesson }: { lesson: LessonText }) {
  return (
    <div className="flex flex-col gap-3" data-testid="lesson-term">
      <p className="text-label font-medium text-data">The word for it</p>
      <p className="text-lesson font-semibold"><Term id={lesson.term.glossary}>{lesson.term.name}</Term></p>
      <p className="measure text-prose">{lesson.term.definition}</p>
      <p className="text-sm text-muted-foreground">You've just seen this idea at work. Now it has a name. It's added to <span className="font-medium">Words so far</span> on the right.</p>
    </div>
  )
}

function CheckStep({ lesson }: { lesson: LessonText }) {
  const id = checkpointId(lesson.id)
  return (
    <div className="flex flex-col gap-3" data-testid="lesson-check">
      <p className="text-label font-medium text-data">Check</p>
      <p className="measure text-prose">One short question about the same idea, with a different example. The app checks your answer. Hints come one at a time if you ask, and the solution is shown only if you choose it. The tutor is off while the question is open.</p>
      {CHECKPOINT_BY_ID.get(id) && <CheckpointStatus id={id} ctx={{}} />}
    </div>
  )
}

function Facts({ r }: { r: LessonResult }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-raised p-4" aria-label="Computed by the app" data-testid="lesson-facts">
      <Source kind="model" detail={r.engine === "mlp" ? "small MLP trained in this app" : "bigram engine"} className="w-fit" />
      <ul className="flex flex-col gap-1 text-sm">{r.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </section>
  )
}

// ----------------------------------------------------------------------------- results, one per lesson

function ResultView({ lesson, r, look, compact = false }: { lesson: string; r: LessonResult; look: boolean; compact?: boolean }) {
  const x = r as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (lesson) {
    case "characters":
      return (
        <div className="flex flex-col gap-2">
          <Look on={look}><p className="flex flex-wrap gap-1.5" aria-label={`${x.count} characters`}>{(x.tokens as string[]).map((t, i) => <Tok key={i} tone={t === "␣" ? "chosen" : "plain"} className="min-w-8 text-base">{t}</Tok>)}</p></Look>
          <p className="text-sm"><span className="num font-medium">{x.count}</span> characters, <span className="num">{(x.distinct as string[]).length}</span> of them different.</p>
        </div>
      )
    case "pairs":
      return (
        <Look on={look}>
          <ol className="flex flex-wrap gap-2" aria-label={`${x.count} pairs`}>
            {(x.pairs as [string, string][]).map(([a, b], i) => <li key={i} className="flex items-center gap-1 rounded-md bg-card px-2 py-1"><Tok>{a}</Tok><span aria-label="then">→</span><Tok>{b}</Tok></li>)}
          </ol>
        </Look>
      )
    case "counts":
      return (
        <div className="flex flex-col gap-3">
          <p className="tok text-lg" aria-label={`the text, with each ${x.context} highlighted`}>{[...String(x.text)].map((c, i) => <span key={i} className={cn((x.places as number[]).includes(i) && "rounded bg-context text-context-ink", (x.places as number[]).includes(i - 1) && "rounded bg-data-soft")}>{c}</span>)}</p>
          <Look on={look}>
            <p className="mb-1 text-sm font-medium">Row for {q(x.context)}: what came next, and how often</p>
            <ProbBars ariaLabel={`counts after ${x.context}`} items={(x.row as { token: string; count: number }[]).map((t, i) => ({ key: t.token, label: <Tok>{t.token}</Tok>, value: t.count, highlight: i === 0 }))} valueFormat={(v) => String(v)} />
          </Look>
        </div>
      )
    case "probability":
      return (
        <Look on={look}>
          <p className="mb-1 text-sm font-medium">Row for {q(x.context)}, as fractions of {x.total}</p>
          <ProbBars ariaLabel={`probabilities after ${x.context}`} items={(x.row as { token: string; count: number; p: number }[]).map((t) => ({ key: t.token, label: <Tok>{t.token}</Tok>, value: t.p, highlight: t.token === x.target, detail: `${t.count}/${x.total}` }))} valueFormat={(v) => v.toFixed(4)} />
        </Look>
      )
    case "sampling":
      return (
        <Look on={look}>
          <IntervalStrip ariaLabel={`the line from 0 to 1 after ${x.context}`} segments={(x.intervals as { token: string; p: number }[]).map((s) => ({ key: s.token, label: s.token, p: s.p }))} draw={x.draw} chosen={x.token} />
        </Look>
      )
    case "generation":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Start <Tok tone="context">{x.prompt}</Tok>, wrote <span className="tok">“{x.generated}”</span> (seed {x.seed})</p>
          <Look on={look}>
            <table className="w-full max-w-lg text-sm">
              <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1 font-normal">Step</th><th className="font-normal">Row read</th><th className="font-normal">Random number</th><th className="font-normal">Wrote</th></tr></thead>
              <tbody>{(x.steps as { row: string; draw: number; token: string }[]).map((s, i) => <tr key={i} className="border-t border-border"><td className="num py-1">{i + 1}</td><td><Tok tone="context">{s.row}</Tok></td><td className="num">{n4(s.draw)}</td><td><Tok tone="chosen">{s.token}</Tok></td></tr>)}</tbody>
            </table>
          </Look>
        </div>
      )
    case "learning":
      return (
        <div className="flex flex-col gap-3">
          {!compact && <ExampleView r={r} />}
          <Look on={look}>
            <ProbBars ariaLabel="probability of the right character" max={1} items={[
              { key: "b", label: "Before", value: x.pBefore, muted: true, detail: "random weights" },
              { key: "a", label: "After", value: x.pAfter, highlight: true, detail: `${x.steps} updates` },
            ]} valueFormat={(v) => v.toFixed(4)} />
          </Look>
          <p className="text-sm text-muted-foreground">Blind guess among {x.vocabSize} characters: 1/{x.vocabSize} = {(1 / x.vocabSize).toFixed(4)}.</p>
        </div>
      )
    case "embeddings":
      return (
        <Look on={look}>
          <table className="text-sm" aria-label="embeddings before and after training">
            <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1 pr-4 font-normal">Character</th><th className="pr-4 font-normal">Before training</th><th className="font-normal">After training</th></tr></thead>
            <tbody>{(x.before as { char: string; values: number[] }[]).map((b, i) => (
              <tr key={i} className="border-t border-border"><td className="py-1 pr-4"><Tok>{b.char}</Tok></td><td className="num pr-4">({b.values.map(n4).join(", ")})</td><td className="num">({(x.after[i].values as number[]).map(n4).join(", ")})</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-sm">Joined: {x.context} characters × {x.embed} numbers = <span className="num font-medium">{x.joined}</span> numbers.</p>
        </Look>
      )
    case "hidden":
      return (
        <div className="flex flex-col gap-3">
          <Look on={look}>
            <p className="text-sm font-medium">Hidden value 1 (trained network)</p>
            <p className="num text-sm">{(x.x as number[]).map((xi: number, i: number) => `${n4(x.weights[i])} × ${n4(xi)}`).join(" + ")} + bias {n4(x.bias)} = <span className="font-medium">{n4(x.pre)}</span></p>
            <p className="num mt-1 text-sm">tanh({n4(x.pre)}) = <span className="font-medium">{n4(x.h)}</span></p>
          </Look>
          {!compact && <p className="text-sm text-muted-foreground">All {x.hiddenSize} hidden values after tanh: <span className="num">{(x.allAfter as number[]).map((v) => v.toFixed(2)).join(", ")}</span></p>}
        </div>
      )
    case "softmax":
      return (
        <Look on={look}>
          <table className="text-sm" aria-label="scores and probabilities">
            <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1 pr-4 font-normal">Character</th><th className="pr-4 font-normal">Score</th><th className="font-normal">Probability</th></tr></thead>
            <tbody>{(x.scores as { token: string; score: number; p: number }[]).map((s) => <tr key={s.token} className={cn("border-t border-border", s.token === x.target && "font-medium")}><td className="py-1 pr-4"><Tok>{s.token}</Tok></td><td className="num pr-4">{n4(s.score)}</td><td className="num">{n4(s.p)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-sm text-muted-foreground">The top 5 of {x.vocab?.length ?? "all"} characters. All the probabilities add up to {Number(x.sum).toFixed(4)}.</p>
        </Look>
      )
    case "loss":
      return (
        <Look on={look}>
          <table className="text-sm" aria-label="probability and loss">
            <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1 pr-4 font-normal">Network</th><th className="pr-4 font-normal">p(right character)</th><th className="font-normal">Loss = −ln(p)</th></tr></thead>
            <tbody>
              <tr className="border-t border-border"><td className="py-1 pr-4">Random</td><td className="num pr-4">{n4(x.pBefore)}</td><td className="num">{n4(x.lossBefore)}</td></tr>
              <tr className="border-t border-border"><td className="py-1 pr-4">Trained ({x.steps} updates)</td><td className="num pr-4">{n4(x.pAfter)}</td><td className="num">{n4(x.lossAfter)}</td></tr>
            </tbody>
          </table>
        </Look>
      )
    case "update":
      return <UpdateReplay rep={x.replay} look={look} compact={compact} />
    case "training":
      return (
        <div className="flex flex-col gap-2">
          <TrainingReplay history={x.history} dataset={x.dataset} trainSeconds={x.trainSeconds} look={look} compact={compact} />
          <p className="text-label text-muted-foreground">This text trains only the small network in this lesson. It does not train Qwen, the AI tutor.</p>
        </div>
      )
    default:
      return null
  }
}
