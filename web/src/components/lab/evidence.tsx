import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { findTerm } from "@/content/glossary"
import { actions, EVIDENCE_LEVELS, useLab } from "@/lib/store"

/** Lets you record your own evidence for one concept. Nothing here is checked automatically. */
export function EvidenceRecorder({ conceptId, compact = false }: { conceptId: string; compact?: boolean }) {
  const evidence = useLab((s) => s.evidence[conceptId]) ?? {}
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState("")
  const [selfMade, setSelfMade] = useState(false)
  const term = findTerm(conceptId)?.term ?? conceptId
  return (
    <section aria-labelledby={`ev-${conceptId}`} className="flex flex-col gap-3 rounded-lg bg-raised p-4">
      <div>
        <h3 id={`ev-${conceptId}`} className="text-sm font-medium">Your evidence for {term.toLowerCase()}</h3>
        {!compact && <p className="text-sm text-muted-foreground">You record these yourself. Opening a page records nothing.</p>}
      </div>
      <ul className="flex flex-col gap-2" data-help-id="evidence.levels">
        {EVIDENCE_LEVELS.filter((l) => l.id !== "explained").map((level) => {
          const id = `ev-${conceptId}-${level.id}`
          const date = evidence[level.id]
          return (
            <li key={level.id} className="flex items-start gap-2.5">
              <Checkbox id={id} checked={!!date} onCheckedChange={(on) => actions.setEvidence(conceptId, level.id, !!on)} className="mt-0.5" />
              <label htmlFor={id} className="text-sm leading-snug">
                {level.label}
                <span className="block text-muted-foreground">{date ? `Since ${date}` : level.hint}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {evidence.explained ? (
        <div className="text-sm">
          <p className="font-medium">Explained independently on {evidence.explained}</p>
          {evidence.explanation && <blockquote className="mt-1 text-muted-foreground">“{evidence.explanation}”</blockquote>}
          <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => actions.setEvidence(conceptId, "explained", false)}>
            Remove this record
          </Button>
        </div>
      ) : writing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim() && selfMade) {
              actions.recordExplanation(conceptId, draft.trim())
              setWriting(false)
              setDraft("")
            }
          }}
        >
          <label htmlFor={`ex-${conceptId}`} className="text-sm font-medium">In your own words, what is {term.toLowerCase()}?</label>
          <Textarea id={`ex-${conceptId}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={selfMade} onCheckedChange={(on) => setSelfMade(!!on)} className="mt-0.5" />
            I wrote this without hints or help
          </label>
          <p className="text-sm text-muted-foreground">The Lab saves your words; it does not grade them. Review them later in the Notebook.</p>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={!draft.trim() || !selfMade}>Save explanation</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setWriting(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setWriting(true)}>
          Record an independent explanation
        </Button>
      )}
    </section>
  )
}
