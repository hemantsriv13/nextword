// Replays of recorded training. Training is far too fast to watch, so the backend saves the weights at a
// few steps, and the batch used for those updates (nextword/lab/mlp_service.py). These views show those
// saved states again. Every value is a real saved or recomputed one; nothing between saved steps is drawn.
import { useMemo, useState, type ReactNode } from "react"
import { NavArrowLeftIcon, NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import type { RecordedHistory, RecordedUpdate } from "@/lib/mlp"
import { cn } from "@/lib/utils"
import { LineChart, Tok } from "./charts"
import { Source } from "./source"

const n4 = (x: number) => x.toFixed(4)
const q = (c: string) => `‘${c}’`

/** Rings the part of a view that "What should I look at?" points to. */
export function Look({ on, children, className }: { on: boolean; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg transition-shadow", on && "ring-2 ring-data ring-offset-4 ring-offset-canvas", className)} data-look={on ? "true" : undefined}>{children}</div>
}

/** The embedding number whose gradient is largest: the clearest one to follow through an update. */
export function followedWeight(rep: RecordedUpdate) {
  const e = rep.embedding
  const i = e.grad.reduce((best, g, k) => (Math.abs(g) > Math.abs(e.grad[best]) ? k : best), 0)
  return { name: `number ${i + 1} of ${q(e.token)}'s embedding`, before: e.before[i], grad: e.grad[i], after: e.after[i] }
}

/** One recorded update, a part at a time. */
export function UpdateReplay({ rep, look = false, compact = false }: { rep: RecordedUpdate; look?: boolean; compact?: boolean }) {
  const [part, setPart] = useState(compact ? 4 : 0)
  const parts = ["Weights before", "The batch it used", "The loss", "The gradient", "Weights after"]
  const w = followedWeight(rep)
  return (
    <div className="flex flex-col gap-3" data-testid="update-replay">
      <p className="flex flex-wrap items-center gap-2 text-sm"><Source kind="recorded" /> Update {rep.step.toLocaleString()}, saved while the network trained. Replayed a part at a time; it isn't training now.</p>
      <ol className="flex flex-wrap gap-1 text-xs" aria-label="Replay parts">
        {parts.map((p, i) => <li key={p}><button type="button" onClick={() => setPart(i)} aria-current={i === part ? "step" : undefined} className={cn("min-h-8 rounded-full border px-2.5", i === part ? "border-data bg-data-soft font-medium" : "border-border bg-card")}>{i + 1}. {p}</button></li>)}
      </ol>
      <Look on={look}>
        <div className="flex flex-col gap-1 rounded-lg bg-card p-3 text-sm" aria-live="polite" data-testid="update-replay-part" data-part={part}>
          {part === 0 && <p>{w.name}: <span className="num font-medium">{n4(w.before)}</span>. Weights fingerprint <span className="tok">{rep.fingerprintBefore}</span>.</p>}
          {part === 1 && (
            <div>
              <p>{rep.batchSize} training examples, picked at random by the seed (first {rep.batch.length} shown):</p>
              <ul className="mt-1 flex flex-wrap gap-2">{rep.batch.map((b) => <li key={b.index} className="flex items-center gap-1">{b.window.map((c, i) => <Tok key={i} tone="context">{c}</Tok>)}→<Tok tone="chosen">{b.target}</Tok></li>)}</ul>
            </div>
          )}
          {part === 2 && <p>Average loss on this batch before the update: <span className="num font-medium">{n4(rep.batchLoss)}</span> (recomputed now: {n4(rep.batchLossRecomputed)}).</p>}
          {part === 3 && <p>Gradient for {w.name}: <span className="num font-medium">{w.grad.toFixed(5)}</span>. {w.grad > 0 ? "Positive: the loss would grow if this weight went up, so it goes down." : "Negative: the loss would grow if this weight went down, so it goes up."}</p>}
          {part === 4 && (
            <div className="flex flex-col gap-1">
              <p className="num">{n4(w.before)} − {rep.lr} × ({w.grad.toFixed(5)}) = <span className="font-medium">{n4(w.after)}</span></p>
              <p>Batch loss after the update: <span className="num">{n4(rep.batchLossAfter)}</span> (was {n4(rep.batchLoss)}).</p>
              <p className="text-muted-foreground">Check: recomputing the update from the saved weights and batch {rep.check.matches ? "matches" : "does not match"} the weights saved after it (largest difference {rep.check.largestDifference.toExponential(1)}).</p>
            </div>
          )}
        </div>
      </Look>
      {!compact && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="bg-card" disabled={part === 0} onClick={() => setPart(part - 1)}><NavArrowLeftIcon className="size-4" /> Previous part</Button>
          <Button size="sm" variant="outline" className="bg-card" disabled={part === parts.length - 1} onClick={() => setPart(part + 1)}>Next part <NavArrowRightIcon className="size-4" /></Button>
        </div>
      )}
    </div>
  )
}

/** The saved moments of a real training run, with a slider over them. */
export function TrainingReplay({ history, dataset, trainSeconds, look = false, compact = false }: { history: RecordedHistory; dataset: string; trainSeconds?: number | null; look?: boolean; compact?: boolean }) {
  const steps = history.steps
  const [i, setI] = useState(steps.length - 1)
  const cur = steps[Math.min(i, steps.length - 1)]
  const series = useMemo(() => [
    { name: "Training text", tone: "data" as const, points: steps.map((s) => ({ x: s.step, y: s.train })) },
    { name: "Validation text", tone: "ink" as const, dashed: true, points: steps.map((s) => ({ x: s.step, y: s.val })) },
  ], [steps])
  return (
    <div className="flex flex-col gap-3" data-testid="training-replay">
      <p className="flex flex-wrap items-center gap-2 text-sm"><Source kind="recorded" /> {dataset}: {history.stepsTrained.toLocaleString()} updates{trainSeconds != null ? ` in ${trainSeconds.toFixed(2)} s` : ""}. A replay of {steps.length} saved moments; nothing between them is filled in.</p>
      <Look on={look}><LineChart series={series} height={compact ? 150 : 200} xLabel="Updates (saved moments only)" yLabel="Loss" ariaLabel="training and validation loss at the saved moments" markers={[{ x: cur.step, label: `update ${cur.step}` }]} /></Look>
      {!compact && (
        <div className="flex flex-col gap-2">
          <label htmlFor="replay-step" className="text-sm font-medium">Saved moment: update <span className="num">{cur.step.toLocaleString()}</span></label>
          <input id="replay-step" type="range" min={0} max={steps.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="h-11 w-full max-w-md accent-[var(--data)]" aria-valuetext={`update ${cur.step}`} />
          <p className="text-sm" data-testid="training-replay-now">Training loss <span className="num">{n4(cur.train)}</span>, validation loss <span className="num">{n4(cur.val)}</span>. For the validation example {history.window.map(q).join(" ")} → {q(history.target)}, p = <span className="num">{n4(cur.pTarget)}</span>; most likely {q(cur.top[0].token)}.</p>
        </div>
      )}
    </div>
  )
}
