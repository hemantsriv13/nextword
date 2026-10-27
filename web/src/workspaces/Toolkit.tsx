import { useState, type ReactNode } from "react"
import { NavArrowDownIcon, NavArrowRightIcon, SearchIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Term } from "@/components/lab/glossary"
import { useHelp } from "@/components/lab/help"
import { Panel, Segmented, Workspace } from "@/components/lab/layout"
import { useToolkitTour } from "@/components/lab/toolkit-tour"
import { CONCEPTS, CONTROLS, CONTROL_BY_ID, EFFECT_LABEL, TOURS, WORKSPACE_HELP, type ControlHelp } from "@/content/help"
import { findTerm } from "@/content/glossary"
import { WORKSPACE_BY_ROUTE } from "@/content/journey"
import { hrefFor, useRoute } from "@/lib/hooks"
import { useLab } from "@/lib/store"
import { cn } from "@/lib/utils"

type View = "pages" | "find" | "tours"

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")
/** Every word of the query appears somewhere in the text. */
const matches = (text: string, q: string) => {
  const words = norm(q).split(/\s+/).filter((w) => w.length > 1)
  const hay = norm(text)
  return words.length === 0 || words.every((w) => hay.includes(w))
}

export default function Toolkit() {
  const { params } = useRoute()
  const initialView = (params.get("view") as View) ?? (params.get("q") ? "find" : "pages")
  const [view, setView] = useState<View>(["pages", "find", "tours"].includes(initialView) ? initialView : "pages")
  return (
    <Workspace title="Toolkit Guide" subtitle="What each page, control and topic is for, where it lives, and where to go next. Every link opens the real place in the Lab and points at it; nothing runs until you press it yourself.">
      <Segmented label="Toolkit Guide view" value={view} onChange={setView} options={[{ value: "pages", label: "Find the right workspace" }, { value: "find", label: "Find a control or concept" }, { value: "tours", label: "Guided tours" }]} />
      {view === "pages" && <Pages />}
      {view === "find" && <Find initial={params.get("q") ?? ""} />}
      {view === "tours" && <Tours />}
    </Workspace>
  )
}

// ----------------------------------------------------------------------------- A. workspaces

function Pages() {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const list = WORKSPACE_HELP.filter((h) => {
    const w = WORKSPACE_BY_ROUTE.get(h.route)!
    return matches([w.title, w.description, h.practical, h.question, h.when, h.canDo.join(" "), h.source].join(" "), q)
  })
  return (
    <section aria-labelledby="tk-pages-h" className="flex flex-col gap-4">
      <h2 id="tk-pages-h" className="sr-only">Find the right workspace</h2>
      <SearchBox id="tk-pages-q" label="Search the workspaces" placeholder="For example: tokens, compare, why this character" value={q} onChange={setQ} />
      <p className="text-label text-muted-foreground">{list.length} of {WORKSPACE_HELP.length} pages</p>
      <ul className="flex flex-col divide-y divide-rule rounded-2xl border border-canvas-edge bg-canvas" data-testid="tk-pages">
        {list.map((h) => {
          const w = WORKSPACE_BY_ROUTE.get(h.route)!
          const expanded = open === h.route
          return (
            <li key={h.route}>
              <button type="button" onClick={() => setOpen(expanded ? null : h.route)} aria-expanded={expanded} className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-raised">
                <span className="min-w-0 flex-1">
                  <span className="block text-prose font-semibold">{w.title}</span>
                  <span className="block text-prose text-muted-foreground">{h.practical}</span>
                </span>
                <span className="mt-1 hidden flex-none text-label text-muted-foreground sm:block">{h.source}</span>
                <NavArrowDownIcon className={cn("mt-1 size-4 flex-none text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <div className="flex flex-col gap-4 px-5 pb-5">
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-prose md:grid-cols-2">
                    <Row k="What it is for">{w.description}.</Row>
                    <Row k="The question it answers">{h.question}</Row>
                    <Row k="When to use it">{h.when}</Row>
                    <Row k="Understand first">{h.first}</Row>
                    <Row k="What you can do here"><ul className="list-disc pl-5">{h.canDo.map((d) => <li key={d}>{d}</li>)}</ul></Row>
                    <Row k="What to expect">{h.expect}</Row>
                    <Row k="Where the numbers come from">{h.source}</Row>
                    <Row k="Where to go next">{h.next.map((r, i) => <span key={r}>{i > 0 && ", "}<a href={hrefFor(r)} className="underline underline-offset-2">{WORKSPACE_BY_ROUTE.get(r)!.title}</a></span>)}</Row>
                  </dl>
                  <Button asChild className="self-start bg-action text-action-ink hover:bg-action/90"><a href={hrefFor(h.route)}>Open {w.title}<NavArrowRightIcon className="size-4" /></a></Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div><dt className="text-label font-medium text-muted-foreground">{k}</dt><dd>{children}</dd></div>
}

function SearchBox({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative max-w-2xl">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-prose" />
    </div>
  )
}

// ----------------------------------------------------------------------------- B. controls and concepts

function Find({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial)
  const concepts = CONCEPTS.filter((c) => matches([c.question, c.also.join(" "), c.answer].join(" "), q))
  const controls = CONTROLS.filter((c) => matches([c.label, c.does, c.where, (c.questions ?? []).join(" "), c.term ? findTerm(c.term)?.term ?? "" : ""].join(" "), q))
  return (
    <section aria-labelledby="tk-find-h" className="flex flex-col gap-6">
      <h2 id="tk-find-h" className="sr-only">Find a control or concept</h2>
      <SearchBox id="tk-find-q" label="Search controls and concepts" placeholder="For example: why did I get different text? seed, temperature, validation" value={q} onChange={setQ} />
      {concepts.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-section font-semibold">Questions</h3>
          <ul className="flex flex-col gap-4" data-testid="tk-concepts">
            {concepts.map((c) => (
              <li key={c.id} className="rounded-2xl border border-canvas-edge bg-canvas p-5">
                <p className="text-prose font-semibold">{c.question}</p>
                <p className="measure mt-1 text-prose">{c.answer}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.controls.map((id) => <ShowMe key={id} entry={CONTROL_BY_ID.get(id)!} />)}
                  {c.terms.map((t) => <Term key={t} id={t} className="text-sm" />)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-section font-semibold">Controls and parts of the screen <span className="text-label font-normal text-muted-foreground">{controls.length} of {CONTROLS.length}</span></h3>
        <ul className="flex flex-col divide-y divide-rule" data-testid="tk-controls">
          {controls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-x-6 gap-y-2 py-3">
              <div className="min-w-0 flex-[1_1_24rem]">
                <p className="text-prose font-medium">{c.label} <span className="text-label font-normal text-muted-foreground">{c.where}</span></p>
                <p className="measure text-prose">{c.does}</p>
                <p className="text-label text-data">{EFFECT_LABEL[c.effect]}</p>
              </div>
              <ShowMe entry={c} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ShowMe({ entry }: { entry: ControlHelp }) {
  const help = useHelp()
  const where = entry.route === "any" ? "on this kind of page" : WORKSPACE_BY_ROUTE.get(entry.route)?.title
  return (
    <Button variant="outline" size="sm" onClick={() => help?.goTo(entry.id)} aria-label={`Show me where: ${entry.label}${where ? `, ${where}` : ""}`} disabled={entry.route === "any" && !entry.id.startsWith("shell.")}
      title={entry.route === "any" && !entry.id.startsWith("shell.") ? "This appears on several pages; open any workspace to find it." : undefined}>
      Show me where{entry.route !== "any" && where ? `: ${where}` : ""}
    </Button>
  )
}

// ----------------------------------------------------------------------------- C. tours

function Tours() {
  const tour = useToolkitTour()
  const positions = useLab((s) => s.prefs.tourPositions ?? {})
  return (
    <Panel id="tk-tours" title="Guided tours" className="max-w-4xl">
      <p className="measure mb-5 text-prose text-muted-foreground">Each tour moves through real parts of the Lab and points at them. Nothing advances by itself, nothing is run for you, and your inputs stay as they are. Times are estimates.</p>
      <ol className="flex flex-col gap-4" data-help-id="toolkit.tours">
        {TOURS.map((t) => {
          const at = positions[t.id] ?? 0
          return (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-canvas-edge bg-canvas p-5">
              <div className="min-w-0 flex-[1_1_22rem]">
                <p className="text-section font-semibold">{t.title}</p>
                <p className="text-label text-muted-foreground">{t.minutes} · {t.steps.length} steps{at > 0 ? ` · paused at step ${at + 1}` : ""}</p>
                <p className="measure mt-2 text-prose">{t.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {at > 0 && <Button className="bg-action text-action-ink hover:bg-action/90" onClick={() => tour?.start(t.id, at)}>Resume at step {at + 1}</Button>}
                <Button variant={at > 0 ? "outline" : "default"} className={at > 0 ? undefined : "bg-action text-action-ink hover:bg-action/90"} onClick={() => tour?.start(t.id, 0)}>{at > 0 ? "Start over" : "Start the tour"}</Button>
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
