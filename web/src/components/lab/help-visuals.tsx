// Small worked pictures for the "Learn this control" popovers. Every number in them is illustrative
// and labelled so: they show the mechanism, not a result of your engine.
import type { ReactNode } from "react"
import type { VisualId } from "@/content/help"
import { cn } from "@/lib/utils"

function Frame({ caption, children, numbers = true }: { caption: string; children: ReactNode; numbers?: boolean }) {
  return (
    <figure className="flex flex-col gap-2 rounded-lg bg-card p-3">
      {children}
      <figcaption className="text-label text-muted-foreground">{caption}{numbers && <> <span className="font-medium">Illustrative numbers.</span></>}</figcaption>
    </figure>
  )
}

function Chain({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="rounded-md bg-raised px-2 py-1">{it}</span>
          {i < items.length - 1 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
        </li>
      ))}
    </ol>
  )
}

function Bars({ rows, highlight }: { rows: [string, number][]; highlight?: string }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, p]) => (
          <tr key={k}>
            <th scope="row" className="tok w-10 py-0.5 text-left font-normal">{k}</th>
            <td className="py-0.5"><div className="h-2.5 rounded-full bg-raised" aria-hidden="true"><div className={cn("h-full rounded-full", k === highlight ? "bg-primary" : "bg-data")} style={{ width: `${p * 100}%` }} /></div></td>
            <td className="num w-12 py-0.5 text-right">{p.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Strip({ parts, u, chosen }: { parts: [string, number][]; u: number; chosen: string }) {
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, [, p]) => sum + p, 0))
  return (
    <div className="relative h-8 overflow-hidden rounded-md bg-raised" role="img" aria-label={`Stretches ${parts.map(([k, p]) => `${k} ${p}`).join(", ")}; the draw ${u} lands in ${chosen}`}>
      {parts.map(([k, p], i) => {
        const left = starts[i]
        return <div key={k} className={cn("tok absolute inset-y-0 flex items-center justify-center border-r-2 border-card text-sm", k === chosen ? "bg-primary text-primary-foreground" : "bg-data-soft")} style={{ left: `${left * 100}%`, width: `${p * 100}%` }}>{k}</div>
      })}
      <div className="absolute inset-y-0 w-[3px] bg-negative" style={{ left: `calc(${u * 100}% - 1.5px)` }} aria-hidden="true" />
    </div>
  )
}

const soft = (z: number[], t: number) => {
  const e = z.map((v) => Math.exp(v / t))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

export function HelpVisual({ id }: { id: VisualId }) {
  switch (id) {
    case "seed":
      return (
        <Frame caption="Same everything plus the same seed gives the same draws, so the same text.">
          <Chain items={["model", "prompt", "settings", <span key="s" className="font-medium">seed 2</span>]} />
          <p className="text-sm">→ draws 0.956, 0.31, 0.72 … → <span className="tok">“an cat”</span>, every time</p>
          <p className="text-sm text-muted-foreground">Seed 3 → other draws → possibly other characters. The probabilities of the first step are the same either way.</p>
        </Frame>
      )
    case "nextStep":
      return (
        <Frame caption="One step of a run that is already computed and stored.">
          <Chain items={[<span key="c">context <span className="tok">h</span></span>, <span key="r">row <span className="tok">e 4, a 1</span></span>, <span key="p">p <span className="tok">0.8, 0.2</span></span>, <span key="d">draw 0.96 → <span className="tok">a</span></span>, <span key="n">new context <span className="tok">a</span></span>]} />
        </Frame>
      )
    case "replay":
      return (
        <Frame numbers={false} caption="Replay shows the stored run again from its start.">
          <p className="text-sm"><span className="tok">run (seed 2)</span> → shown → <span className="font-medium">Replay</span> → the same run, shown again</p>
          <p className="text-sm text-muted-foreground">No request, no new random numbers, the same characters.</p>
        </Frame>
      )
    case "run":
      return (
        <Frame numbers={false} caption="What a run uses, and what becomes stale.">
          <Chain items={["inputs you set", "Python engine", "new result on screen"]} />
          <p className="text-sm text-muted-foreground">Change an input afterwards and the result stays as it was, marked as describing the earlier inputs, until you run again.</p>
        </Frame>
      )
    case "temperature": {
      const z = [2, 1, 0.2]
      return (
        <Frame caption="The same three scores at three temperatures. The scores themselves never change.">
          {[0.5, 1, 2].map((t) => (
            <div key={t} className="flex flex-col gap-0.5">
              <p className="text-label text-muted-foreground">T = {t}{t < 1 ? ", sharper" : t > 1 ? ", flatter" : ""}</p>
              <Bars rows={soft(z, t).map((p, i) => [["A", "B", "C"][i], p])} />
            </div>
          ))}
        </Frame>
      )
    }
    case "accept":
      return (
        <Frame caption="The suggestion becomes part of your text; the next suggestion starts from its last character.">
          <p className="tok text-sm">The rain<span className="rounded-sm bg-data-soft"> fell</span></p>
          <p className="text-sm">→ Accept →</p>
          <p className="tok text-sm">The rain fel<span className="rounded-sm bg-context text-context-ink">l</span></p>
        </Frame>
      )
    case "splits":
      return (
        <Frame numbers={false} caption="One text, three parts, three jobs.">
          <div className="flex h-7 overflow-hidden rounded-md text-label" role="img" aria-label="Training 80 percent, validation 10 percent, test 10 percent">
            <div className="flex w-[80%] items-center justify-center bg-raised">training: counted</div>
            <div className="flex w-[10%] items-center justify-center bg-data-soft">val</div>
            <div className="flex w-[10%] items-center justify-center bg-context text-context-ink">test</div>
          </div>
          <p className="text-sm">Validation: try settings, choose k. Test: score once, at the end.</p>
        </Frame>
      )
    case "context":
      return (
        <Frame numbers={false} caption="The bigram loop, with the feedback from output to context.">
          <Chain items={["training text", "count table"]} />
          <Chain items={["last character", "its row", "probabilities", "draw", "chosen", "append"]} />
          <p className="text-sm text-muted-foreground">↺ the appended character becomes the next context.</p>
        </Frame>
      )
    case "draw":
      return (
        <Frame caption="Probabilities laid end to end; the random number picks the stretch it lands in.">
          <Strip parts={[["e", 0.8], ["a", 0.2]]} u={0.93} chosen="a" />
          <p className="text-sm">u = 0.93 lands in <span className="tok">a</span>, although <span className="tok">e</span> was more likely.</p>
        </Frame>
      )
    case "normalize":
      return (
        <Frame caption="Each count divided by the row total.">
          <p className="tok text-sm">e: 4 ÷ 5 = 0.80 · a: 1 ÷ 5 = 0.20 · total 1.00</p>
          <Bars rows={[["e", 0.8], ["a", 0.2]]} />
        </Frame>
      )
    case "smoothing":
      return (
        <Frame caption="Add k = 1 to every count, including the zero, then divide.">
          <p className="tok text-sm">raw: e 4, a 1, x 0 → 0.80, 0.20, 0.00</p>
          <p className="tok text-sm">k = 1: e 5, a 2, x 1 → 0.62, 0.25, 0.13</p>
        </Frame>
      )
    case "update":
      return (
        <Frame caption="One weight, one update.">
          <p className="tok text-sm">w = 0.40, gradient = 0.25, learning rate = 0.5</p>
          <p className="tok text-sm">w ← 0.40 − 0.5 × 0.25 = 0.275</p>
          <p className="text-sm text-muted-foreground">Every weight moves like this at once; the loss for this example should then be lower.</p>
        </Frame>
      )
    case "mask":
      return (
        <Frame caption="With the mask, a position can only read itself and earlier positions.">
          <table className="tok text-sm" aria-label="Masked weights: row 1 reads position 1 only; row 2 reads positions 1 and 2; row 3 reads all three">
            <tbody>
              {[[1, 0, 0], [0.4, 0.6, 0], [0.2, 0.3, 0.5]].map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className={cn("w-12 px-1 py-0.5 text-right", j > i && "text-muted-foreground")}>{j > i ? "0" : v.toFixed(1)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Frame>
      )
    case "sources":
      return (
        <Frame numbers={false} caption="Three labels, three kinds of number.">
          <ul className="flex flex-col gap-1 text-sm">
            <li><span className="font-medium">Your model:</span> computed by your Python engine.</li>
            <li><span className="font-medium">Interactive simulation:</span> computed in the browser.</li>
            <li><span className="font-medium">Worked example:</span> fixed, stated values.</li>
          </ul>
        </Frame>
      )
  }
}
