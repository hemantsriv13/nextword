import { createContext, useContext, useState, type ReactNode } from "react"
import { BookmarkIcon, BookmarkSolidIcon, CodeIcon, NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { findTerm, type GlossaryEntry } from "@/content/glossary"
import { WORKSPACE_BY_ROUTE } from "@/content/journey"
import { hrefFor } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { EvidenceRecorder } from "./evidence"

const GlossaryContext = createContext<{ open: (id: string) => void }>({ open: () => {} })

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const entry = openId ? findTerm(openId) : undefined
  return (
    <GlossaryContext.Provider value={{ open: setOpenId }}>
      {children}
      <Sheet open={!!entry} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-card sm:max-w-md">
          {entry && (
            <>
              <SheetTitle className="pr-8 text-xl">{entry.abbr && entry.abbr !== entry.term ? `${entry.abbr}: ${entry.term}` : entry.term}</SheetTitle>
              <SheetDescription className="sr-only">Glossary entry for {entry.term}</SheetDescription>
              <EntryBody entry={entry} onNavigate={() => setOpenId(null)} onOpenTerm={setOpenId} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </GlossaryContext.Provider>
  )
}

export function useGlossary() {
  return useContext(GlossaryContext)
}

/** A technical term in running text. Click (or Enter) opens its glossary entry. */
export function Term({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  const { open } = useGlossary()
  const entry = findTerm(id)
  if (!entry) return <>{children}</>
  return (
    <button
      type="button"
      onClick={() => open(id)}
      className={cn("cursor-help rounded-sm text-inherit underline decoration-muted-foreground/60 decoration-dotted underline-offset-[3px] hover:decoration-foreground", className)}
    >
      {children ?? entry.term}
    </button>
  )
}

const WHERE_LABEL: Record<GlossaryEntry["where"], string> = {
  model: "In your engine",
  simulation: "Interactive simulation in the Lab",
  example: "Worked example in the Lab",
  discussed: "Explained here; not built yet",
}

/** A glossary entry's illustrative values, as a two-column table. */
export function WorkedTable({ w }: { w: NonNullable<GlossaryEntry["worked"]> }) {
  return (
    <table className="w-full max-w-sm text-sm">
      <caption className="mb-1 text-left text-label text-muted-foreground">{w.caption}</caption>
      <thead><tr className="text-label text-muted-foreground"><th className="py-0.5 text-left font-normal">{w.head[0]}</th><th className="py-0.5 text-right font-normal">{w.head[1]}</th></tr></thead>
      <tbody>{w.rows.map(([a, b]) => <tr key={a} className="border-t border-rule"><td className="num py-0.5">{a}</td><td className="num py-0.5 text-right">{b}</td></tr>)}</tbody>
    </table>
  )
}

export function EntryBody({ entry, onNavigate, onOpenTerm }: { entry: GlossaryEntry; onNavigate?: () => void; onOpenTerm?: (id: string) => void }) {
  const bookmarked = useLab((s) => s.bookmarks.includes(entry.id))
  const workspace = WORKSPACE_BY_ROUTE.get(entry.experiment.route)
  return (
    <div className="mt-4 flex flex-col gap-5 text-prose leading-relaxed">
      <p className="text-base">{entry.plain}</p>
      {entry.say && <p className="-mt-3 text-sm text-muted-foreground">Read {entry.abbr} as “{entry.say}”.</p>}
      {entry.needs && entry.needs.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Builds on:{" "}
          {entry.needs.map((n, i) => (
            <span key={n}>
              {i > 0 && ", "}
              <button type="button" className="font-medium text-foreground underline decoration-dotted underline-offset-2" onClick={() => onOpenTerm?.(n)}>{findTerm(n)?.abbr ?? findTerm(n)?.term}</button>
            </span>
          ))}
        </p>
      )}
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-sm font-medium text-muted-foreground">Precisely</dt>
          <dd>{entry.technical}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-muted-foreground">Small example</dt>
          <dd>{entry.example}</dd>
          {entry.worked && <dd className="mt-2"><WorkedTable w={entry.worked} /></dd>}
        </div>
        <div>
          <dt className="text-sm font-medium text-muted-foreground">Common misconception</dt>
          <dd>{entry.misconception}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-muted-foreground">In this project</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{WHERE_LABEL[entry.where]}</span>
            {entry.code && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CodeIcon className="size-3.5" />
                <code className="tok text-label">{entry.code.path}</code>
                <span>({entry.code.symbol})</span>
              </span>
            )}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={hrefFor(entry.experiment.route)} onClick={onNavigate}>
            {entry.experiment.label}
            <NavArrowRightIcon className="size-4" />
          </a>
        </Button>
        <Button size="sm" variant="outline" data-help-id="glossary.bookmark" onClick={() => actions.toggleBookmark(entry.id)} aria-pressed={bookmarked}>
          {bookmarked ? <BookmarkSolidIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
          {bookmarked ? "Bookmarked" : "Bookmark"}
        </Button>
      </div>
      {workspace && <p className="-mt-3 text-sm text-muted-foreground">Opens {workspace.title}.</p>}
      {entry.related.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Related</h3>
          <ul className="flex flex-wrap gap-1.5">
            {entry.related.map((r) => {
              const rel = findTerm(r)
              if (!rel) return null
              return (
                <li key={r}>
                  <button type="button" className="rounded-md bg-secondary px-2 py-1 text-sm hover:bg-accent" onClick={() => onOpenTerm?.(r)}>
                    {rel.term}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <EvidenceRecorder conceptId={entry.id} />
    </div>
  )
}
