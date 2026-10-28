import { useState, type ReactNode } from "react"
import { CheckIcon, LightBulbIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { InfoTip } from "./info-tip"

export interface Choice {
  id: string
  label: string
}

/**
 * Predict → run → observe → explain → change one variable.
 * Objective predictions are checked against `correct`, which the workspace computes from the
 * experiment's actual result. Free-text explanations are saved for review, never graded.
 */
export function GuidedCycle({ id, conceptId, route, question, choices, correct, observation, explainPrompt, change, hints = [] }: {
  id: string
  conceptId?: string
  route: string
  question: string
  choices?: Choice[]
  correct?: string
  observation?: ReactNode
  explainPrompt: string
  change: ReactNode
  hints?: ReactNode[]
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [written, setWritten] = useState("")
  const [hintCount, setHintCount] = useState(0)
  const [explanation, setExplanation] = useState("")
  const [saved, setSaved] = useState<"prediction" | "explanation" | null>(null)
  const predicted = choices ? picked !== null : written.trim().length > 0

  return (
    <section aria-labelledby={`${id}-cycle`} className="flex flex-col gap-4 rounded-2xl bg-raised p-5 sm:p-6">
      <h2 id={`${id}-cycle`} className="text-section font-semibold">Try it</h2>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex flex-col gap-2">
          <p><span className="font-medium">Predict.</span> {question} <span className="text-muted-foreground">(optional)</span>{choices && <InfoTip id="cycle.predict" className="ml-0.5 align-middle" />}</p>
          {choices ? (
            <div role="radiogroup" aria-label="Your prediction" data-help-id="cycle.predict" className="flex flex-col gap-1.5">
              {choices.map((c) => (
                <label key={c.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2", picked === c.id ? "border-foreground bg-raised" : "border-border hover:bg-raised")}>
                  <input type="radio" name={`${id}-predict`} value={c.id} checked={picked === c.id} onChange={() => setPicked(c.id)} className="mt-1 accent-[var(--foreground)]" />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <Textarea aria-label="Your prediction" rows={2} value={written} onChange={(e) => setWritten(e.target.value)} placeholder="What do you expect to see?" />
          )}
          {predicted && !choices && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => { actions.addNote({ kind: "prediction", text: written.trim(), conceptId, route }); setSaved("prediction") }}>
              Save prediction to notebook
            </Button>
          )}
        </li>
        <li>
          <p><span className="font-medium">Run</span> the experiment with the controls on the left.</p>
        </li>
        <li className="flex flex-col gap-2">
          <p className="font-medium">Observe.</p>
          {observation ? (
            <div className="rounded-md bg-raised p-3 leading-relaxed">{observation}</div>
          ) : (
            <p className="text-muted-foreground">Run it once; what the result shows appears here.</p>
          )}
          {observation && choices && picked && correct && (
            <p className={cn("flex items-start gap-2", picked === correct ? "text-positive" : "text-foreground")} role="status">
              {picked === correct ? <CheckIcon className="mt-0.5 size-4 flex-none" /> : <LightBulbIcon className="mt-0.5 size-4 flex-none text-muted-foreground" />}
              {picked === correct
                ? "Your prediction matches the result."
                : `The result points to: “${choices.find((c) => c.id === correct)?.label}”. Look at the observation above to see why.`}
            </p>
          )}
        </li>
        <li className="flex flex-col gap-2">
          <label htmlFor={`${id}-explain`}><span className="font-medium">Explain.</span> {explainPrompt}</label>
          <Textarea id={`${id}-explain`} rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" data-help-id="cycle.explain" disabled={!explanation.trim()} onClick={() => { actions.addNote({ kind: "explanation", text: explanation.trim(), conceptId, route }); setSaved("explanation"); setExplanation("") }}>
              Save to notebook
            </Button>
            {hints.length > 0 && hintCount < hints.length && (
              <Button size="sm" variant="ghost" onClick={() => setHintCount((n) => n + 1)}>
                <LightBulbIcon className="size-4" />
                {hintCount === 0 ? "Show a hint" : "Another hint"}
              </Button>
            )}
          </div>
          {hintCount > 0 && (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
              {hints.slice(0, hintCount).map((h, i) => <li key={i}>{h}</li>)}
            </ol>
          )}
          {saved && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-positive">
              <CheckIcon className="size-4" /> Saved to your notebook.
            </p>
          )}
        </li>
        <li>
          <p><span className="font-medium">Change one variable.</span> {change}</p>
        </li>
      </ol>
    </section>
  )
}
