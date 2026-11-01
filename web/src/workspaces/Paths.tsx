// Learning paths: the order the existing lessons and tools teach in, with your saved progress. Every step
// links to lessons and pages that exist; progress comes only from the lessons' records and app-graded checks.
// The local AI is not involved here: it never chooses the order or certifies anything.
import { useState } from "react"
import { NavArrowDownIcon, NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/lab/lesson-status"
import { WORKSPACES } from "@/content/journey"
import { FOUNDATION, PATHS, type FoundationStep } from "@/content/paths"
import { hrefFor } from "@/lib/hooks"
import { LESSON_BY_ID, LESSONS } from "@/lib/lessons"
import { lessonHref, missingBefore, recommend, sessionPlan, statusOf, stepLesson, stepState, type Saved, type StepState } from "@/lib/paths"
import { useLab } from "@/lib/store"
import { cn } from "@/lib/utils"

const STATE_LABEL: Record<StepState, string> = {
  "done": "Done: every check passed", "needs a recheck": "Needs a recheck", "in progress": "In progress",
  "not started": "Not started", "skipped": "Skipped", "no lesson yet": "No lesson yet",
}

export default function Paths() {
  const place = useLab((s) => s.lessons.place)
  const records = useLab((s) => s.lessons.records)
  const checks = useLab((s) => s.checkpoints)
  const saved: Saved = { place, records, checks }
  const rec = recommend(saved)
  return (
    <div className="flex min-w-0 flex-col gap-12 p-4 sm:p-6 lg:px-8 lg:pt-8" data-testid="paths">
      <header className="flex flex-col gap-2">
        <h1 className="text-lesson font-semibold sm:text-page">Learning paths</h1>
        <p className="measure text-prose text-muted-foreground">Twelve steps through the {LESSONS.length} Beginner lessons and the tools. Start anywhere; each step says what it builds on.</p>
        <p className="text-sm"><span className="font-medium">Suggested:</span> <a className="underline underline-offset-2" href={rec.href}>{rec.title}</a> <span className="text-muted-foreground">({rec.why})</span></p>
      </header>

      <SessionPlanCard saved={saved} />

      <section aria-labelledby="foundation-h" className="flex flex-col gap-4">
        <h2 id="foundation-h" className="text-section font-semibold">Foundations</h2>
        <ol className="flex flex-col gap-3" data-testid="foundation">
          {FOUNDATION.map((s, i) => <StepRow key={s.id} n={i + 1} step={s} saved={saved} />)}
        </ol>
      </section>

      <section aria-labelledby="deeper-h" className="flex flex-col gap-4">
        <h2 id="deeper-h" className="text-section font-semibold">Deeper paths</h2>
        <ol className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-3">
          {PATHS.map((p) => (
            <li key={p.id} className="flex flex-col gap-2" data-testid={`path-${p.id}`}>
              <h3 className="font-semibold">{p.title}</h3>
              <p className="text-sm">{p.teaches}</p>
              <p className="text-label text-muted-foreground">Needs: {p.needs}</p>
              <ol className="flex flex-col gap-0.5 text-sm">
                {p.routes.map((r, j) => <li key={r}><span className="num mr-1.5 text-muted-foreground">{j + 1}.</span><a className="inline-flex min-h-6 items-center underline underline-offset-2" href={hrefFor(r)}>{WORKSPACES.find((w) => w.route === r)!.title}</a></li>)}
              </ol>
              {p.note && <p className="text-label text-muted-foreground">{p.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="key-h" className="flex flex-col gap-2 text-sm">
        <h2 id="key-h" className="font-semibold">What the statuses mean</h2>
        <ul className="flex flex-col gap-1.5">
          <li><StatusBadge status="Completed on your own" /> The lesson's check was passed without hints.</li>
          <li><StatusBadge status="Completed with help" /> Passed after using hints.</li>
          <li><StatusBadge status="Reviewed with the solution" /> You viewed the solution and haven't passed a new question since.</li>
          <li><StatusBadge status="Check skipped" /> Finished the lesson, skipped its check. <StatusBadge status="Skipped" /> Skipped the lesson.</li>
        </ul>
        <p className="text-muted-foreground">A step is done only when every one of its lessons' checks was passed. Asking the tutor or for simpler wording is noted on the lesson but never changes a status.</p>
      </section>
    </div>
  )
}

function StepRow({ n, step, saved }: { n: number; step: FoundationStep; saved: Saved }) {
  const state = stepState(step, saved)
  const lesson = stepLesson(step, saved)
  const missing = missingBefore(step, saved)
  const num = lesson ? LESSONS.indexOf(LESSON_BY_ID.get(lesson)!) + 1 : 0
  const action = !lesson
    ? { label: `Open ${step.tools[0].label.split(",")[0]}`, href: hrefFor(step.tools[0].route) }
    : { label: state === "done" ? "Revisit" : state === "in progress" || statusOf(lesson, saved) === "In progress" ? "Resume" : state === "needs a recheck" ? "Recheck" : "Start", href: lessonHref(lesson) }
  const label = lesson ? `${action.label} lesson ${num}` : action.label
  return (
    <li className={cn("grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl border p-4 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto]", state === "done" ? "border-border" : "border-canvas-edge bg-canvas")} data-testid={`step-${step.id}`} data-state={state}>
      <div className="flex flex-col gap-1">
        <p className="flex items-baseline gap-2"><span className="num text-muted-foreground">{n}</span><span className="font-semibold">{step.title}</span></p>
        <p className="text-sm">{step.question}</p>
        <p className="text-label text-muted-foreground" data-testid="step-state">{STATE_LABEL[state]}</p>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Understand first</dt><dd>{step.before}</dd>
        <dt className="text-muted-foreground">You'll use</dt>
        <dd>{step.lessons.length > 0 && <>{step.lessons.length === 1 ? "Lesson" : "Lessons"} {step.lessons.map((id) => LESSONS.indexOf(LESSON_BY_ID.get(id)!) + 1).join(" and ")}; then </>}
          {step.tools.map((t, i) => <span key={t.route + i}>{i > 0 && "; "}<a className="underline underline-offset-2" href={hrefFor(t.route)}>{t.label}</a> to {t.use}</span>)}</dd>
        <dt className="text-muted-foreground">Afterwards, explain</dt><dd>{step.after}</dd>
        {step.lessons.length > 0 && (<><dt className="text-muted-foreground">Your lessons</dt>
          <dd className="flex flex-wrap gap-x-3 gap-y-1">{step.lessons.map((id) => <span key={id} className="inline-flex items-center gap-1.5"><a className="underline underline-offset-2" href={lessonHref(id)}>{LESSON_BY_ID.get(id)!.title}</a><StatusBadge status={statusOf(id, saved)} /></span>)}</dd></>)}
        {step.noCheck && <><dt className="text-muted-foreground">Check</dt><dd>{step.noCheck}</dd></>}
      </dl>
      <div className="flex flex-col gap-2 lg:items-end">
        <Button asChild variant={state === "done" ? "outline" : "default"} className={cn("min-h-11", state === "done" ? "bg-card" : "bg-action text-action-ink hover:bg-action/90")}>
          <a href={action.href} data-testid="step-action">{label} <NavArrowRightIcon className="size-4" /></a>
        </Button>
        {missing.length > 0 && state !== "done" && (
          <p className="text-label text-muted-foreground lg:max-w-56 lg:text-right" data-testid="step-builds-on">Builds on {missing.map((m) => m.title.toLowerCase()).join(", ")}, not done yet. You can still start here.</p>
        )}
      </div>
    </li>
  )
}

/** An optional plan for one sitting, from the recommended lesson's own text and your saved state. */
function SessionPlanCard({ saved }: { saved: Saved }) {
  const [open, setOpen] = useState(false)
  const plan = sessionPlan(saved)
  if (!plan) return null
  const l = LESSON_BY_ID.get(plan.lesson)!
  return (
    <section aria-labelledby="session-h" className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:p-6" data-testid="session-plan">
      <button type="button" aria-expanded={open} aria-controls="session-body" onClick={() => setOpen(!open)} className="flex min-h-11 items-center gap-2 text-left">
        {open ? <NavArrowDownIcon className="size-4" aria-hidden="true" /> : <NavArrowRightIcon className="size-4" aria-hidden="true" />}
        <h2 id="session-h" className="text-section font-semibold">Plan a session <span className="font-normal text-muted-foreground">(optional): lesson {LESSONS.indexOf(l) + 1}, {l.title}</span></h2>
      </button>
      {open && (
        <ol id="session-body" className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <li className="flex flex-col gap-1"><span className="font-semibold">1. One concept</span><span>{plan.concept}</span></li>
          <li className="flex flex-col gap-1"><span className="font-semibold">2. One experiment</span><span>{plan.experiment}</span><a className="w-fit underline underline-offset-2" href={lessonHref(plan.lesson)}>Open the lesson</a></li>
          <li className="flex flex-col gap-1"><span className="font-semibold">3. One check</span><span>{plan.check}</span><span className="flex items-center gap-1.5 text-label text-muted-foreground">Now: <StatusBadge status={plan.checkStatus} /></span></li>
          <li className="flex flex-col gap-1"><span className="font-semibold">4. Recap, then next</span><span>{plan.recap}</span>{plan.next && <a className="w-fit underline underline-offset-2" href={plan.next.href}>Next: {plan.next.title}</a>}</li>
        </ol>
      )}
      <p className="text-label text-muted-foreground">Built from the lesson's own written text and your saved progress. The tutor can reword a lesson, but it doesn't choose what comes next or decide what you know.</p>
    </section>
  )
}
