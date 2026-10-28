import { useMemo, useState } from "react"
import { BookmarkSolidIcon, SearchIcon } from "@/components/icons"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EntryBody } from "@/components/lab/glossary"
import { EmptyNote, Workspace } from "@/components/lab/layout"
import { GLOSSARY, findTerm, type StageId } from "@/content/glossary"
import { JOURNEY } from "@/content/journey"
import { navigate, useMediaQuery, useRoute } from "@/lib/hooks"
import { useLab } from "@/lib/store"
import { cn } from "@/lib/utils"

const WHERE: Record<string, string> = { model: "Your engine", simulation: "Simulation", example: "Worked example", discussed: "Explained only" }

export default function Glossary() {
  const { params } = useRoute()
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<StageId | "all" | "bookmarked">("all")
  const bookmarks = useLab((s) => s.bookmarks)
  const evidence = useLab((s) => s.evidence)
  const wide = useMediaQuery("(min-width: 1000px)")
  const selectedId = params.get("term") ?? (wide ? GLOSSARY[0].id : null)
  const selected = selectedId ? findTerm(selectedId) : undefined

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GLOSSARY.filter((g) => (stage === "all" ? true : stage === "bookmarked" ? bookmarks.includes(g.id) : g.stage === stage))
      .filter((g) => !q || [g.term, g.abbr ?? "", ...(g.aliases ?? []), g.plain, g.technical].join(" ").toLowerCase().includes(q))
  }, [query, stage, bookmarks])

  const stageItems = [{ value: "all", label: "All stages" }, { value: "bookmarked", label: `Bookmarked (${bookmarks.length})` }, ...JOURNEY.map((s) => ({ value: s.id, label: s.title }))]

  return (
    <Workspace title="Glossary" subtitle={`${GLOSSARY.length} terms, each tied to an experiment in the Lab. Click any dotted term elsewhere to open it here.`}>
      <div className={cn("grid gap-6", wide ? "grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]" : "grid-cols-1")}>
        <section aria-label="Terms" className={cn("flex min-w-0 flex-col gap-3", !wide && selected && "hidden")}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="g-search" className="sr-only">Search the glossary</label>
            <input id="g-search" data-help-id="glossary.search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search terms" className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm" />
          </div>
          <Select value={stage} onValueChange={(v) => setStage(v as typeof stage)} items={stageItems}>
            <SelectTrigger aria-label="Filter by stage" data-help-id="glossary.filter"><SelectValue /></SelectTrigger>
            <SelectContent>{stageItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-label text-muted-foreground">{list.length} of {GLOSSARY.length}</p>
          {list.length === 0 ? <EmptyNote>No term matches “{query}”. Try a shorter word.</EmptyNote> : (
            <ul className="flex max-h-[70vh] flex-col overflow-auto rounded-md border border-border">
              {list.map((g) => {
                const ev = evidence[g.id]
                return (
                  <li key={g.id} className="border-b border-rule last:border-0">
                    <button type="button" onClick={() => navigate("glossary", { term: g.id })} aria-current={g.id === selected?.id ? "true" : undefined}
                      className={cn("flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-raised", g.id === selected?.id && "bg-active")}>
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {g.abbr && g.abbr !== g.term ? `${g.abbr}: ${g.term}` : g.term}
                        {bookmarks.includes(g.id) && <BookmarkSolidIcon className="size-3.5 text-muted-foreground" aria-label="Bookmarked" />}
                      </span>
                      <span className="line-clamp-1 text-label text-muted-foreground">{g.plain}</span>
                      <span className="text-label text-muted-foreground">{WHERE[g.where]}{ev?.explained ? ", explained by you" : ev?.explored ? ", explored" : ""}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        {selected ? (
          <article aria-labelledby="entry-title" className="min-w-0 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7">
            {!wide && <button type="button" className="mb-3 text-sm underline underline-offset-2" onClick={() => navigate("glossary")}>Back to all terms</button>}
            <h2 id="entry-title" className="text-lesson font-semibold">{selected.abbr && selected.abbr !== selected.term ? `${selected.abbr}: ${selected.term}` : selected.term}</h2>
            {selected.aliases && <p className="text-sm text-muted-foreground">Also: {selected.aliases.join(", ")}</p>}
            <EntryBody entry={selected} onOpenTerm={(id) => navigate("glossary", { term: id })} />
          </article>
        ) : wide ? <EmptyNote>Pick a term.</EmptyNote> : null}
      </div>
    </Workspace>
  )
}
