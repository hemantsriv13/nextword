import { useRef, useState } from "react"
import { CheckIcon, DownloadIcon, TrashIcon, UploadIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Term } from "@/components/lab/glossary"
import { EmptyNote, Note, Panel, Segmented, Workspace } from "@/components/lab/layout"
import { findTerm } from "@/content/glossary"
import { JOURNEY, WORKSPACE_BY_ROUTE } from "@/content/journey"
import { hrefFor } from "@/lib/hooks"
import { actions, download, EVIDENCE_LEVELS, storageAvailable, useLab, type NoteKind } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Route } from "@/content/glossary"

const KIND_LABEL: Record<NoteKind, string> = { note: "Note", question: "Question", prediction: "Prediction", explanation: "Explanation" }

export default function Notebook() {
  return (
    <Workspace title="Notebook" subtitle="Your notes, questions, evidence and experiment history. All of it is stored in this browser only.">
      <NotesPanel />
      <EvidencePanel />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RunsPanel />
        <BookmarksPanel />
      </div>
      <DataPanel />
    </Workspace>
  )
}

function NotesPanel() {
  const notes = useLab((s) => s.notes)
  const [kind, setKind] = useState<"note" | "question">("question")
  const [text, setText] = useState("")
  const [filter, setFilter] = useState<"all" | NoteKind>("all")
  const shown = notes.filter((n) => filter === "all" || n.kind === filter)
  return (
    <Panel id="notes" title="Notes and questions">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { actions.addNote({ kind, text: text.trim() }); setText("") } }}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "question", label: "Question" }, { value: "note", label: "Note" }]} />
        </div>
        <label htmlFor="nb-text" className="sr-only">{kind === "question" ? "Your question" : "Your note"}</label>
        <Textarea id="nb-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "question" ? "What are you unsure about?" : "What did you notice?"} />
        <Button type="submit" className="self-start" disabled={!text.trim()}>Save {kind}</Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{notes.length} saved</h3>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "question", label: "Questions" }, { value: "prediction", label: "Predictions" }, { value: "explanation", label: "Explanations" }, { value: "note", label: "Notes" }]} />
      </div>
      {shown.length === 0 ? <div className="mt-3"><EmptyNote>Nothing here yet. Predictions and explanations you save from any “Try it” section land here too.</EmptyNote></div> : (
        <ul className="mt-3 flex flex-col">
          {shown.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-4 border-t border-rule py-3">
              <div className="min-w-0">
                <p className={cn("whitespace-pre-wrap text-[15px]", n.resolved && "text-muted-foreground line-through")}>{n.text}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {KIND_LABEL[n.kind]}, {new Date(n.createdAt).toLocaleString()}
                  {n.conceptId && findTerm(n.conceptId) && <>, about <Term id={n.conceptId}>{findTerm(n.conceptId)!.term.toLowerCase()}</Term></>}
                  {n.route && WORKSPACE_BY_ROUTE.has(n.route as Route) && <>, from <a className="underline underline-offset-2" href={hrefFor(n.route as Route)}>{WORKSPACE_BY_ROUTE.get(n.route as Route)!.title}</a></>}
                </p>
              </div>
              <div className="flex flex-none gap-1">
                {n.kind === "question" && (
                  <Button variant="ghost" size="sm" onClick={() => actions.updateNote(n.id, { resolved: !n.resolved })} aria-pressed={!!n.resolved}>
                    <CheckIcon className="size-4" /> {n.resolved ? "Reopen" : "Answered"}
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label="Delete this note" onClick={() => actions.deleteNote(n.id)}><TrashIcon className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function EvidencePanel() {
  const evidence = useLab((s) => s.evidence)
  const recorded = JOURNEY.flatMap((s) => s.concepts.filter((c) => evidence[c] && Object.keys(evidence[c]).some((k) => k !== "explanation")).map((c) => ({ stage: s.title, id: c })))
  return (
    <Panel id="evidence" title="Your evidence">
      <p className="mb-3 text-sm text-muted-foreground">Recorded by you, per concept. “Explored” is set when you run a related experiment; everything else only when you tick it. Nothing here is checked by the Lab.</p>
      {recorded.length === 0 ? <EmptyNote>No evidence recorded yet.</EmptyNote> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Evidence levels per concept</caption>
            <thead><tr className="text-[12px] text-muted-foreground"><th className="py-2 text-left font-normal">Concept</th>{EVIDENCE_LEVELS.map((l) => <th key={l.id} className="px-2 py-2 text-center font-normal">{l.label}</th>)}</tr></thead>
            <tbody>
              {recorded.map(({ id }) => (
                <tr key={id} className="border-t border-rule">
                  <td className="py-2"><Term id={id}>{findTerm(id)?.term}</Term></td>
                  {EVIDENCE_LEVELS.map((l) => (
                    <td key={l.id} className="num px-2 py-2 text-center text-[13px]">{evidence[id]?.[l.id] ? <span title={`since ${evidence[id][l.id]}`}>{evidence[id][l.id]}</span> : <span className="text-muted-foreground">–</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[13px] text-muted-foreground">Carried over from GLOSSARY.md: bigram model and sampling, explained with assistance on 2026-10-25 (shown as practiced with assistance). An independent recheck with a new example is still pending.</p>
    </Panel>
  )
}

function RunsPanel() {
  const runs = useLab((s) => s.runs)
  return (
    <Panel id="runs" title="Recent experiments">
      {runs.length === 0 ? <EmptyNote>Experiments you run anywhere in the Lab are listed here.</EmptyNote> : (
        <ul className="flex max-h-96 flex-col overflow-auto">
          {runs.map((r) => (
            <li key={r.id} className="border-t border-rule py-2 first:border-0">
              <a href={hrefFor(r.route as Route)} className="text-sm font-medium hover:underline">{r.title}</a>
              <p className="text-[13px] text-muted-foreground">{r.summary}</p>
              <p className="text-[12px] text-muted-foreground">{r.source === "model" ? "Your model" : r.source === "simulation" ? "Simulation" : "Worked example"}, {new Date(r.at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function BookmarksPanel() {
  const bookmarks = useLab((s) => s.bookmarks)
  return (
    <Panel id="bookmarks" title="Bookmarked terms">
      {bookmarks.length === 0 ? <EmptyNote>Bookmark terms from any glossary entry.</EmptyNote> : (
        <ul className="flex flex-col">
          {bookmarks.map((b) => {
            const g = findTerm(b)
            return g ? (
              <li key={b} className="flex items-start justify-between gap-3 border-t border-rule py-2 first:border-0">
                <div><Term id={b}>{g.term}</Term><p className="text-[13px] text-muted-foreground">{g.plain}</p></div>
                <Button variant="ghost" size="sm" onClick={() => actions.toggleBookmark(b)}>Remove</Button>
              </li>
            ) : null
          })}
        </ul>
      )}
    </Panel>
  )
}

function DataPanel() {
  const file = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const ok = storageAvailable()
  return (
    <Panel id="data" title="Your data">
      <div className="flex flex-col gap-4 text-sm">
        <p>Preferences, evidence, notes, bookmarks, saved evaluation runs and experiment history live in this browser&apos;s local storage. Training texts and the engine stay with the Python backend in the project folder.</p>
        {!ok && <Note tone="warning">This browser is not letting the Lab save (private window or blocked storage). Changes last until you close the tab; export to keep them.</Note>}
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>Only this browser, on this computer, sees it. Another browser starts empty.</li>
          <li>Clearing site data, or the browser freeing space, deletes it without warning. Browsers usually allow about 5 MB.</li>
          <li>Export now and then to keep a copy you control.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { download(`nextword-lab-${new Date().toISOString().slice(0, 10)}.json`, actions.exportJson()); setStatus({ ok: true, text: "Exported." }) }}><DownloadIcon className="size-4" /> Export everything</Button>
          <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose an exported Lab file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              f.text().then((t) => { try { actions.importJson(t); setStatus({ ok: true, text: `Imported ${f.name}.` }) } catch (err) { setStatus({ ok: false, text: `Couldn't import ${f.name}: ${(err as Error).message}.` }) } })
              e.target.value = ""
            }} />
          <Button variant="outline" onClick={() => file.current?.click()}><UploadIcon className="size-4" /> Import a file</Button>
          {confirmReset ? (
            <span className="inline-flex items-center gap-2">
              <span>Erase all notes, evidence and history in this browser?</span>
              <Button variant="outline" className="text-negative" onClick={() => { actions.reset(); setConfirmReset(false); setStatus({ ok: true, text: "Reset. Everything is back to the start." }) }}>Erase</Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>Keep</Button>
            </span>
          ) : (
            <Button variant="ghost" className="text-negative" onClick={() => setConfirmReset(true)}><TrashIcon className="size-4" /> Reset the Lab</Button>
          )}
        </div>
        {status && <p role="status" className={status.ok ? "text-positive" : "text-negative"}>{status.text}</p>}
        <p className="text-[13px] text-muted-foreground">Importing replaces what is here now. Export first if you want to keep it.</p>
      </div>
    </Panel>
  )
}
