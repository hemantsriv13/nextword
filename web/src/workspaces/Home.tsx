import { NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Term } from "@/components/lab/glossary"
import { EmptyNote, Panel, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { findTerm, type Route } from "@/content/glossary"
import { JOURNEY, WORKSPACE_BY_ROUTE } from "@/content/journey"
import { api } from "@/lib/api"
import { hrefFor, useLoad } from "@/lib/hooks"
import { actions, useLab, type Evidence } from "@/lib/store"
import { cn } from "@/lib/utils"

export const GUIDE: { id: string; route: Route; minutes: number; title: string; detail: string }[] = [
  { id: "g1", route: "playground", minutes: 4, title: "Step through your engine", detail: "Press Step ten times on “The rain” with seed 1. For each step, find where the draw u lands in the interval strip." },
  { id: "g2", route: "playground", minutes: 4, title: "Recheck the bigram idea with a new example", detail: "In Compare side by side, predict whether “The rain” and “Spain” match, run both, then write why, without help." },
  { id: "g3", route: "counts", minutes: 4, title: "Turn counts into probabilities", detail: "Open the row for n, check one division by hand, draw with your engine, then ask about “!”." },
  { id: "g4", route: "data", minutes: 3, title: "See leakage happen", detail: "In Splits and leakage, record windows-first, then split-first. Compare the leaked counts." },
  { id: "g5", route: "evaluation", minutes: 5, title: "Measure on unseen text", detail: "Measure with k = 0, read why it is infinite, run the k sweep, save two runs and compare them." },
  { id: "g6", route: "decoding", minutes: 3, title: "Feel temperature", detail: "Draw 1,000 times at T = 0.5 and at T = 2. Then try top-k = 2." },
  { id: "g7", route: "neural", minutes: 5, title: "Watch a network overfit", detail: "Apply three updates in One training step. Then train on the small text, then the larger one, and compare validation." },
  { id: "g8", route: "notebook", minutes: 2, title: "Keep your evidence", detail: "Review what you saved, mark what you can now explain on your own, and export your data." },
]

function stageProgress(concepts: string[], evidence: Record<string, Evidence>) {
  const count = (k: keyof Evidence) => concepts.filter((c) => evidence[c]?.[k]).length
  return { explored: count("explored"), practiced: count("practiced"), explained: count("explained"), total: concepts.length }
}

function recommend(evidence: Record<string, Evidence>): { title: string; why: string; route: Route } {
  if (!evidence.bigram?.explained) return { title: "Recheck the bigram model on your own", why: "Your last bigram explanation was written with help. Next, recheck it alone with a new example.", route: "playground" }
  for (const stage of JOURNEY) {
    const next = stage.concepts.find((c) => !evidence[c]?.explored)
    if (next) {
      const g = findTerm(next)!
      return { title: g.experiment.label, why: `Next unexplored concept on the map: ${g.term.toLowerCase()}.`, route: g.experiment.route }
    }
  }
  return { title: "Write independent explanations", why: "You've explored every concept. Explaining them in your own words is the next level.", route: "glossary" }
}

export default function Home() {
  const evidence = useLab((s) => s.evidence)
  const lastRoute = useLab((s) => s.lastRoute) as Route
  const guide = useLab((s) => s.guide)
  const runs = useLab((s) => s.runs)
  const notes = useLab((s) => s.notes)
  const health = useLoad(() => api.health(), "home")
  const rec = recommend(evidence)
  const resume = WORKSPACE_BY_ROUTE.get(lastRoute) && lastRoute !== "home" ? WORKSPACE_BY_ROUTE.get(lastRoute)! : WORKSPACE_BY_ROUTE.get("playground")!
  const done = GUIDE.filter((g) => guide[g.id]).length
  const nextStep = GUIDE.find((g) => !guide[g.id])?.id
  const minutesLeft = GUIDE.filter((g) => !guide[g.id]).reduce((s, g) => s + g.minutes, 0)

  return (
    <Workspace
      title="Your learning map"
      subtitle={rec.why}
      actions={
        <>
          <Button asChild><a href={hrefFor(rec.route)}>{rec.title}<NavArrowRightIcon className="size-4" /></a></Button>
          <Button asChild variant="outline"><a href={hrefFor(resume.route)}>Resume {resume.short.toLowerCase()}</a></Button>
        </>
      }
    >
      <section aria-labelledby="map-h" className="flex flex-col gap-3">
        <h2 id="map-h" className="text-base font-semibold">From text to retrieval</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {JOURNEY.map((s, i) => {
            const p = stageProgress(s.concepts, evidence)
            const w = WORKSPACE_BY_ROUTE.get(s.route)!
            return (
              <li key={s.id} className="min-w-0">
                <a href={hrefFor(s.route)} className="flex h-full flex-col gap-2 rounded-lg border border-border p-4 hover:border-foreground/30 hover:bg-raised">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold"><span className="num mr-1.5 text-muted-foreground">{i + 1}.</span>{s.title}</span>
                    <span className="text-[12px] text-muted-foreground">{s.roadmap}</span>
                  </span>
                  <span className="text-sm">{s.question}</span>
                  <span className="mt-auto flex flex-col gap-1.5 pt-2">
                    <span className="flex h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                      <span className="bg-data" style={{ width: `${(p.explored / p.total) * 100}%` }} />
                    </span>
                    <span className="num text-[12px] text-muted-foreground">
                      {p.explored} of {p.total} explored{p.practiced ? `, ${p.practiced} practiced` : ""}{p.explained ? `, ${p.explained} explained` : ""}
                    </span>
                    <span className="text-[12px] text-muted-foreground">{s.source === "model" ? "Your engine" : s.source === "simulation" ? "Simulation" : "Your engine and simulations"} in {w.short}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
        <p className="text-[13px] text-muted-foreground">Counts only what you recorded. Explored means you ran an experiment, not that you mastered it.</p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel id="guide" title="First guided session" aside={<span className="num text-sm text-muted-foreground">{done} of {GUIDE.length} done, about {minutesLeft} min left</span>}>
          <ol className="flex flex-col">
            {GUIDE.map((g, i) => (
              <li key={g.id} className="flex items-start gap-3 border-t border-rule py-3 first:border-0 first:pt-0">
                <Checkbox id={g.id} checked={!!guide[g.id]} onCheckedChange={(on) => actions.setGuideStep(g.id, !!on)} className="mt-1" aria-label={`Mark step ${i + 1} done`} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={g.id} className={cn("text-sm font-medium", guide[g.id] && "text-muted-foreground line-through")}>{i + 1}. {g.title}</label>
                  {g.id === nextStep && <p className="text-sm text-muted-foreground">{g.detail}</p>}
                </div>
                <a href={hrefFor(g.route)} className="-my-3 inline-flex min-h-11 flex-none items-center whitespace-nowrap text-sm underline-offset-2 hover:underline">{WORKSPACE_BY_ROUTE.get(g.route)!.short}<span className="num ml-1 text-muted-foreground">{g.minutes} min</span></a>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel id="engines" title="Engines">
            <table className="w-full text-sm">
              <caption className="sr-only">Prediction engines</caption>
              <tbody>
                <tr className="border-b border-rule">
                  <td className="py-2 pr-2"><Term id="bigram">Character bigram</Term><span className="block text-[13px] text-muted-foreground">nextword/bigram.py</span></td>
                  <td className="py-2 text-right">
                    <Source kind="model" detail={health.data ? health.data.modelVersion.split("@")[1] : health.error ? "backend offline" : undefined} />
                  </td>
                </tr>
                <tr className="border-b border-rule">
                  <td className="py-2 pr-2">Neural MLP<span className="block text-[13px] text-muted-foreground">Stage 2, not built. Simulated in Neural training.</span></td>
                  <td className="py-2 text-right text-[13px] text-muted-foreground">planned</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Tiny transformer<span className="block text-[13px] text-muted-foreground">Stage 3, not built. Simulated in Attention.</span></td>
                  <td className="py-2 text-right text-[13px] text-muted-foreground">planned</td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel id="recent" title="Recent experiments" aside={runs.length > 0 && <a href={hrefFor("notebook")} className="text-sm hover:underline">View all</a>}>
            {runs.length === 0 ? <EmptyNote>Nothing run yet. Start with step 1 of the guided session.</EmptyNote> : (
              <ul className="flex flex-col">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id} className="border-t border-rule py-2 first:border-0 first:pt-0">
                    <a href={hrefFor(r.route as Route)} className="text-sm font-medium hover:underline">{r.title}</a>
                    <p className="truncate text-[13px] text-muted-foreground">{r.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel id="saved-notes" title="Saved notes" aside={notes.length > 0 && <a href={hrefFor("notebook")} className="text-sm hover:underline">View all</a>}>
            {notes.length === 0 ? <EmptyNote>Questions, predictions and explanations you save appear here.</EmptyNote> : (
              <ul className="flex flex-col">
                {notes.slice(0, 4).map((n) => <li key={n.id} className="truncate border-t border-rule py-2 text-sm first:border-0 first:pt-0">{n.text}</li>)}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Workspace>
  )
}
