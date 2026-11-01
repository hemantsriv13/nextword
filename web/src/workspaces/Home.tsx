// Home: what NextWord is, the one next step (from saved lesson progress only), the learning paths, what is
// running on this computer, and every tool. Nothing here is estimated: no percentages, no time left, no live
// hardware readings. Opening it never asks the AI to write; it only checks which model is running.
import { NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { InfoTip } from "@/components/lab/info-tip"
import { StatusBadge } from "@/components/lab/lesson-status"
import { SystemStatusList } from "@/components/lab/system-status"
import type { Route } from "@/content/glossary"
import { WORKSPACE_HELP } from "@/content/help"
import { WORKSPACES } from "@/content/journey"
import { FOUNDATION, PATHS } from "@/content/paths"
import { hrefFor } from "@/lib/hooks"
import { LESSON_BY_ID, LESSONS, STEPS, type LessonStatus } from "@/lib/lessons"
import { isNewLearner, recommend, stepState, tally, type Saved } from "@/lib/paths"
import { useLab } from "@/lib/store"
import { useSystemStatus } from "@/lib/system"

const ORDER: LessonStatus[] = ["Completed on your own", "Completed with help", "Reviewed with the solution", "Check skipped", "Skipped", "In progress", "Not started"]

const TOOL_GROUPS: { label: string; routes: Route[] }[] = [
  { label: "Learn step by step", routes: ["learn", "journey", "mlp"] },
  { label: "Experiment with your bigram", routes: ["playground", "data", "counts", "evaluation"] },
  { label: "Simulations of larger models", routes: ["neural", "attention", "decoding", "serving", "adapt"] },
  { label: "Reference", routes: ["toolkit", "glossary", "notebook"] },
]

export default function Home() {
  const place = useLab((s) => s.lessons.place)
  const records = useLab((s) => s.lessons.records)
  const checks = useLab((s) => s.checkpoints)
  const saved: Saved = { place, records, checks }
  const status = useSystemStatus()
  const rec = recommend(saved)
  const fresh = isNewLearner(saved)
  const counts = tally(saved)
  const placeLesson = place && LESSON_BY_ID.get(place.lesson)
  // "Continue learning" stays available when the recommendation is something else (e.g. a recheck).
  const showContinue = !fresh && placeLesson && rec.kind !== "continue" && rec.lesson !== place.lesson

  return (
    <div className="flex min-w-0 flex-col gap-12 p-4 sm:p-6 lg:px-8 lg:pt-8" data-testid="home">
      <header className="flex flex-col gap-2">
        <h1 className="text-lesson font-semibold sm:text-page">NextWord</h1>
        <p className="measure text-prose text-muted-foreground">
          See how a language model guesses the next character. You run two small, real models on this computer: one
          that counts, and a neural network you train. An optional AI tutor can reword a step; the numbers always
          come from the models.
        </p>
      </header>

      <section aria-labelledby="next-h" className="grid grid-cols-1 gap-6 rounded-2xl border border-canvas-edge bg-canvas p-4 sm:p-6 lg:p-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-testid="home-next">
        <div className="flex flex-col gap-3">
          <h2 id="next-h" className="text-section font-semibold" data-testid="home-next-title">{rec.title}</h2>
          <p className="measure text-prose">{rec.why}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild className="min-h-11 bg-action text-action-ink hover:bg-action/90" data-help-id="home.start">
              <a href={rec.href} data-testid="home-next-action">{fresh ? "Start lesson 1" : rec.kind === "continue" ? "Continue" : rec.kind === "beyond" ? "Open the MLP journey" : "Open the lesson"} <NavArrowRightIcon className="size-4" /></a>
            </Button>
            {showContinue && (
              <Button asChild variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal bg-card py-2 text-left" data-help-id="home.resume">
                <a href={`#/learn?lesson=${placeLesson.id}`} data-testid="home-continue">Continue learning: {placeLesson.title}, {STEPS[Math.min(place.step, STEPS.length - 1)].label.toLowerCase()}</a>
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:border-l lg:border-canvas-edge lg:pl-6" data-testid="home-progress" data-help-id="home.progress">
          <h3 className="flex items-center gap-0.5 text-sm font-semibold">Your lessons <span className="font-normal text-muted-foreground">({LESSONS.length} in all)</span><InfoTip id="home.progress" /></h3>
          {fresh ? (
            <p className="text-sm text-muted-foreground">None started yet. Counts appear as you finish lessons.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {ORDER.filter((s) => counts[s] > 0).map((s) => (
                <li key={s} className="flex items-center justify-between gap-3 text-sm"><StatusBadge status={s} /><span className="num">{counts[s]}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="paths-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="paths-h" className="text-section font-semibold">Learning paths</h2>
            <a className="inline-flex min-h-6 items-center text-sm underline underline-offset-2" href={hrefFor("paths")}>Open learning paths</a>
          </div>
          <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border" data-testid="home-paths">
            <PathRow n={1} title="Foundations" href={hrefFor("paths")} teaches="Twelve steps, from characters and counts to a trained network's loss, updates and overfitting, mostly through the Beginner lessons."
              needs="Nothing." progress={`${FOUNDATION.filter((s) => stepState(s, saved) === "done").length} of ${FOUNDATION.filter((s) => s.lessons.length).length} lesson steps done`} />
            {PATHS.map((p, i) => {
              const done = p.needsSteps.filter((id) => stepState(FOUNDATION.find((s) => s.id === id)!, saved) === "done").length
              return <PathRow key={p.id} n={i + 2} title={p.title} href={`${hrefFor("paths")}`} teaches={p.teaches} needs={p.needs}
                progress={`Builds on ${p.needsSteps.length} foundation step${p.needsSteps.length === 1 ? "" : "s"}; ${done} done`} note={p.note} />
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="system-h" className="flex flex-col gap-3">
            <h2 id="system-h" className="flex items-center gap-0.5 text-section font-semibold">This computer<InfoTip id="home.status" /></h2>
            <SystemStatusList status={status} compact />
          </section>
          <section aria-labelledby="more-h" className="flex flex-col gap-2">
            <h2 id="more-h" className="text-section font-semibold">Understand the system</h2>
            <ul className="flex flex-col gap-1 text-sm">
              <li><a className="inline-flex min-h-9 items-center underline underline-offset-2" href={hrefFor("how")}>How NextWord Works</a> <span className="text-muted-foreground">: models, data, tutor, hardware and roadmap</span></li>
              <li><a className="inline-flex min-h-9 items-center underline underline-offset-2" href={hrefFor("glossary")}>Glossary</a> <span className="text-muted-foreground">: every term, with an experiment</span></li>
              <li><a className="inline-flex min-h-9 items-center underline underline-offset-2" href="/docs/README.md">Project README</a> <span className="text-muted-foreground">: setup, features and limitations (opens as text)</span></li>
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="tools-h" className="flex flex-col gap-4" data-help-id="home.tools">
        <h2 id="tools-h" className="text-section font-semibold">Tools</h2>
        <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-2">
          {TOOL_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-muted-foreground">{g.label}</h3>
              <ul className="flex flex-col divide-y divide-border" data-testid="home-tools">
                {g.routes.map((r) => {
                  const w = WORKSPACES.find((x) => x.route === r)!
                  const h = WORKSPACE_HELP.find((x) => x.route === r)
                  return (
                    <li key={r} className="flex flex-col gap-0.5 py-2.5">
                      <a href={hrefFor(r)} className="inline-flex min-h-6 w-fit items-center font-medium underline-offset-2 hover:underline">{w.title}</a>
                      <span className="text-sm">{h?.practical ?? w.description}</span>
                      {h?.when && <span className="text-label text-muted-foreground">Use it when: {h.when.replace(/\.$/, "").replace(/^when(ever)?\s+/i, "").replace(/^\w/, (c) => c.toLowerCase())}.</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PathRow({ n, title, href, teaches, needs, progress, note }: { n: number; title: string; href: string; teaches: string; needs: string; progress: string; note?: string }) {
  return (
    <li className="flex flex-col gap-1 p-4">
      <a href={href} className="flex min-h-6 w-fit items-center gap-2 font-semibold underline-offset-2 hover:underline"><span className="num text-muted-foreground">{n}</span>{title}</a>
      <p className="text-sm">{teaches}</p>
      <p className="text-label font-medium">{progress}</p>
      <p className="text-label text-muted-foreground">Needs: {needs}</p>
      {note && <p className="text-label text-muted-foreground">{note}</p>}
    </li>
  )
}
