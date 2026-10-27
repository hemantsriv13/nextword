import { useEffect, useMemo, useState } from "react"
import { DiceThreeIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { IntervalStrip, ProbBars, Tok } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, NumberField, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { api, type CountTable } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync, useLoad } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { pickByDraw } from "@/sim/decoding"
import { mulberry32 } from "@/sim/rng"
import { charCount, visible } from "@/sim/tokenize"

const GUIDE: Guide = {
  question: "What exactly has your engine learned from its training text, and how does that become a probability?",
  scope: "The count table, the rows and the single draws are your Python engine's. The 1,000 repeated draws and the smoothing panel are browser simulations on the engine's numbers: your engine itself never smooths.",
  sources: ["model", "simulation"],
  nodes: [
    { id: "table", label: "Count table", kind: "input", target: "matrix", carries: "one row of counts",
      goesIn: "The training text chosen at the top right.",
      happens: "The engine counts every pair of neighbouring characters into one table: rows are the current character, columns the next.",
      why: "This table is the whole model. There is nothing else stored.",
      comesOut: "A grid of counts. Most cells are zero: those pairs never happened.",
      next: "Selecting a row picks the counts for one context character.",
      tryIt: "Switch between Counts and Row probabilities shading: the same cells, a different scale." },
    { id: "row", label: "Normalize one row", kind: "operation", target: "row", carries: "probabilities",
      goesIn: "The counts in the selected row.",
      happens: "Each count is divided by the row total.",
      why: "Raw counts depend on how common the context is. Dividing by the total gives shares that add up to one.",
      comesOut: "The conditional probability of each next character, given the context.",
      next: "A random draw uses these probabilities.",
      tryIt: "Pick a rare character's row: its probabilities rest on very few counts." },
    { id: "draw", label: "One draw", kind: "operation", target: "sample", carries: "a character",
      goesIn: "The row's probabilities and a seed.",
      happens: "Your engine lays the probabilities end to end and draws one random number.",
      why: "This is the single step generation repeats for every character it writes.",
      comesOut: "One character, and the draw that picked it.",
      next: "In generation, the chosen character becomes the next context; here the demonstration stops after one draw.",
      tryIt: "Change the seed and draw again; then run 1,000 draws and compare observed with expected." },
    { id: "unseen", label: "An unseen character", kind: "operation", target: "unseen", carries: "a refusal",
      goesIn: "Any single character.",
      happens: "The engine looks for its row; if the character never had a successor, there is none.",
      why: "Without counts there is nothing to divide. The engine refuses instead of inventing probabilities.",
      comesOut: "Either a row, or an error message from the engine.",
      next: "Smoothing is one way to avoid zeros; it is shown as a separate simulation.",
      tryIt: "Ask about “!”, which never appears in the sample." },
    { id: "smooth", label: "Smoothing (simulation)", kind: "output", target: "smooth",
      goesIn: "The same row's counts and a strength k.",
      happens: "k is added to every count, including the zeros and one slot for unknown characters, before dividing.",
      why: "Unseen pairs get a small probability instead of zero, which matters when scoring held-out text.",
      comesOut: "A smoothed distribution, for comparison only.",
      next: "The Evaluation bench measures what this does to held-out loss.",
      tryIt: "Slide k from 0 to 5 and watch the share given to unseen characters." },
  ],
  tour: [
    { target: "matrix", title: "The table is the whole model", plain: <><p>Each cell counts how often the row's character was followed by the column's character in the training text. Select a row button on the left to inspect one row.</p><p>Most cells are empty: those pairs never happened, so the engine will never produce them.</p></>,
      terms: [{ id: "bigram", role: "each cell counts one bigram." }] },
    { target: "row", title: "Counts become probabilities", plain: <><p>The selected row lists what followed its character and how often. Each count is divided by the row total, so the column of results adds up to one.</p><p>Dividing by the total is called normalization. The result is a conditional probability: how likely each next character is, given this one.</p></>,
      terms: [{ id: "normalization", role: "count ÷ row total." }, { id: "conditional-probability", role: "P(next | current), read from one row." }] },
    { target: "sample", title: "From a draw to a character", plain: <><p>The probabilities are laid end to end between 0 and 1. Draw with your engine picks one random number and shows which stretch it landed in.</p><p>The repeated draws below it use the same rule in the browser, so you can see the shares settle near the probabilities.</p></>,
      terms: [{ id: "sampling", role: "the draw that picks a character." }, { id: "seed", role: "makes a draw repeatable." }] },
    { target: "unseen", title: "When there is no row", plain: <><p>If a character never had a following character in the training text, the engine has no row for it. Ask the engine about one: it refuses with an error rather than guessing.</p></>,
      terms: [{ id: "unseen-context", role: "a context with no counts." }] },
    { target: "smooth", title: "Smoothing, as a separate simulation", plain: <><p>Smoothing adds a small amount k to every count before dividing, so nothing gets probability zero. Your engine does not do this; the panel computes it in the browser from your engine's counts.</p></>,
      terms: [{ id: "smoothing", role: "add k to every count, then divide by the new total." }] },
  ],
}

function rowOf(table: CountTable, context: string) {
  const row = table.rows[context] ?? {}
  const total = table.totals[context] ?? 0
  const items = Object.entries(row).map(([token, count]) => ({ token, count, p: total ? count / total : 0 }))
  items.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token))
  return { row, total, items }
}

export default function Counts() {
  const [corpus, setCorpus] = useState("sample")
  const [context, setContext] = useState("e")
  const { corpora } = useCorpora()
  const table = useLoad(() => api.table(corpus), corpus)
  const sample = useLoad(() => api.corpus(corpus), corpus)
  const t = table.data

  useEffect(() => {
    if (t) actions.logRun({ route: "counts", title: "Loaded the count table", summary: `${fmt.n(t.pairs)} pairs`, source: "model" }, ["conditional-probability", "normalization"])
  }, [t])

  const row = t ? rowOf(t, context) : undefined

  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Counts and probability"
      subtitle="Your engine's whole model is one table of counts. Pick a row to see how counts become probabilities and how one draw picks a character."
      actions={
        <div className="flex items-center gap-2">
          <span id="cc-label" className="text-sm text-muted-foreground">Training text</span>
          <Select value={corpus} onValueChange={(v) => setCorpus(String(v))} items={(corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}>
            <SelectTrigger aria-labelledby="cc-label" data-help-id="counts.corpus" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{(corpora ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      }
      explain={<CountsExplain context={context} row={row} />}
    >
      <WorkspaceGuide />
      <Panel id="matrix" variant="canvas" title="Count table" source={<Source kind="model" detail={t ? `${fmt.n(t.pairs)} pairs counted` : undefined} />}
        teach={{
          calc: t ? <Symbols rows={[
            ["pairs", "neighbouring pairs in the training text (characters − 1)", fmt.n(t.pairs)],
            ["V", "distinct characters, so rows and columns", String(t.vocab.length)],
            ["cells", "V × V possible pairs", fmt.n(t.vocab.length ** 2)],
            [`row ${visible(context)}`, "the selected row's total", row ? String(row.total) : "0"],
          ]} /> : undefined,
          code: <EngineCode path="nextword/bigram.py" symbol="count_bigrams" />,
        }}>
        {table.error ? <ErrorNote error={table.error} onRetry={table.retry} /> : !t ? <LoadingRows rows={8} label="Loading count table" /> : (
          <Heatmap table={t} selected={context} onSelect={setContext} />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel id="row" title="One row, normalized" source={<Source kind="model" />}
          teach={{
            calc: row && row.total > 0 ? <>
              <Symbols rows={[
                [`total(${visible(context)})`, "the sum of the row's counts", String(row.total)],
                ...row.items.slice(0, 6).map((i) => [`P(${visible(i.token)} | ${visible(context)})`, `${i.count} ÷ ${row.total}`, i.p.toFixed(4)] as [string, string, string]),
              ]} />
              <p>P(b | a) is read “the probability that the next character is b, given that the current one is a”. No smoothing: a character that never followed {visible(context)} has probability exactly 0.</p></> : <p>This row has no counts, so there is nothing to divide.</p>,
            code: <EngineCode path="nextword/bigram.py" symbol="next_token_probabilities" />,
          }}>
          {!t || !row ? <LoadingRows /> : row.total === 0 ? (
            <Note tone="warning">No pair in the training text starts with <Tok>{visible(context)}</Tok>. This is an <Term id="unseen-context">unseen context</Term>: the engine refuses to predict here.</Note>
          ) : (
            <NormalizationTable context={context} total={row.total} items={row.items} />
          )}
        </Panel>
        <Panel id="sample" title="From a draw to a character" source={<Source kind="model" detail="draw from your engine" />}
          teach={{
            calc: <p>The stretches run from 0 to 1 in the engine&apos;s order. With probabilities p₁, p₂, … the first stretch is [0, p₁), the second [p₁, p₁ + p₂), and so on. The engine draws u and picks the first stretch whose end is past u. The draw and the stretch it landed in are shown under the strip after you press Draw with your engine.</p>,
            code: <EngineCode path="nextword/bigram.py" symbol="sample_next" />,
          }}>
          {t && row && row.total > 0 ? <SamplingDemo key={`${corpus}:${context}`} corpus={corpus} context={context} items={row.items} /> : <EmptyNote>Pick a row that has counts.</EmptyNote>}
        </Panel>
      </div>

      <TryAnyCharacter corpus={corpus} onPick={setContext} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel id="change" title="Change the training text" source={<Source kind="model" detail="both tables counted by your engine" />}>
          {sample.data && t ? <BeforeAfter baseText={sample.data.text} baseTable={t} context={context} /> : <LoadingRows />}
        </Panel>
        <Panel id="smooth" title="Smoothing" source={<Source kind="simulation" detail="your engine does not smooth" />}
          teach={{
            calc: t ? <>
              <Symbols rows={[
                ["count", "how often the next character followed the context", undefined],
                ["k", "the smoothing strength set by the slider", undefined],
                ["V", `${t.vocab.length} known characters + 1 slot for an unknown one`, String(t.vocab.length + 1)],
                ["P", "(count + k) ÷ (row total + k × V)", undefined],
              ]} />
              <p>With k = 0 this is exactly the unsmoothed division above. Any k above 0 gives every unseen character the same small share, and the shares still add up to one.</p></> : undefined,
            code: <p className="text-sm text-muted-foreground">This panel&apos;s arithmetic is the formula above, computed inline in <code className="tok">web/src/workspaces/Counts.tsx</code> (function Smoothing). The Evaluation bench uses the same formula in <code className="tok">nextword/lab/service.py</code>.</p>,
          }}>
          {t ? <Smoothing table={t} context={context} /> : <LoadingRows />}
        </Panel>
      </div>

      {t && <CountsCycle table={t} />}
    </Workspace>
    </Teach>
  )
}

function Heatmap({ table, selected, onSelect }: { table: CountTable; selected: string; onSelect: (c: string) => void }) {
  const [mode, setMode] = useState<"count" | "p">("count")
  const vocab = table.vocab
  const max = Math.max(...Object.values(table.rows).flatMap((r) => Object.values(r)))
  const cells = vocab.length * vocab.length
  const filled = Object.values(table.rows).reduce((s, r) => s + Object.keys(r).length, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rows: the current character. Columns: the next one. <span className="num">{fmt.n(filled)}</span> of <span className="num">{fmt.n(cells)}</span> cells are non-zero; the rest never happened in this text.
        </p>
        <Segmented label="Shade cells by" helpId="counts.shade" value={mode} onChange={setMode} options={[{ value: "count", label: "Counts" }, { value: "p", label: "Row probabilities" }]} />
      </div>
      <div className="max-h-[520px] overflow-auto rounded-md border border-border">
        <table className="border-separate border-spacing-0 text-[11px]">
          <caption className="sr-only">Bigram counts. Use the row buttons to inspect a row.</caption>
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-card px-1 text-[11px] font-normal text-muted-foreground">now ↓ next →</th>
              {vocab.map((v) => <th key={v.token} scope="col" className="tok min-w-[22px] px-0.5 py-1 text-center font-normal">{v.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {vocab.map((r) => {
              const row = table.rows[r.token] ?? {}
              const total = table.totals[r.token] ?? 0
              const sel = r.token === selected
              return (
                <tr key={r.token}>
                  <th scope="row" className="sticky left-0 z-10 bg-card p-0">
                    <button data-help-id="counts.row"
                      type="button"
                      onClick={() => onSelect(r.token)}
                      aria-pressed={sel}
                      aria-label={`Row for ${r.label}, ${total} pairs`}
                      className={cn("tok h-[22px] w-9 rounded-sm text-center", sel ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                    >
                      {r.label}
                    </button>
                  </th>
                  {vocab.map((c) => {
                    const n = row[c.token] ?? 0
                    const strength = n === 0 ? 0 : mode === "count" ? Math.sqrt(n / max) : n / total
                    return (
                      <td
                        key={c.token}
                        className={cn("h-[22px] min-w-[22px] text-center", sel && "outline outline-1 -outline-offset-1 outline-foreground/40")}
                        style={{ background: n ? `color-mix(in oklab, var(--data) ${Math.round(8 + strength * 37)}%, var(--card))` : undefined }}
                        title={`${r.label} → ${c.label}: ${n}${total ? ` (${(n / total).toFixed(3)} of the row)` : ""}`}
                      >
                        <span className="num">{n || ""}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NormalizationTable({ context, total, items }: { context: string; total: number; items: { token: string; count: number; p: number }[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, 8)
  const restCount = items.slice(shown.length).reduce((s, i) => s + i.count, 0)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        After <Tok tone="context">{visible(context)}</Tok> the text continued <span className="num font-medium">{fmt.n(total)}</span> times. Each probability is its count divided by {fmt.n(total)}.
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Counts, the division, and the resulting probabilities</caption>
        <thead>
          <tr className="text-label text-muted-foreground">
            <th scope="col" className="py-1 text-left font-normal">Next</th>
            <th scope="col" className="py-1 text-right font-normal">Count</th>
            <th scope="col" className="py-1 text-right font-normal">÷ total</th>
            <th scope="col" className="py-1 text-right font-normal">= P(next | {visible(context)})</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.token} className="border-t border-rule">
              <td className="py-1"><Tok>{visible(i.token)}</Tok></td>
              <td className="num py-1 text-right">{i.count}</td>
              <td className="num py-1 text-right text-muted-foreground">÷ {total}</td>
              <td className="num py-1 text-right">{i.p.toFixed(3)}</td>
            </tr>
          ))}
          {restCount > 0 && (
            <tr className="border-t border-rule text-muted-foreground">
              <td className="py-1">{items.length - shown.length} others</td>
              <td className="num py-1 text-right">{restCount}</td>
              <td className="num py-1 text-right">÷ {total}</td>
              <td className="num py-1 text-right">{(restCount / total).toFixed(3)}</td>
            </tr>
          )}
          <tr className="border-t border-border font-medium">
            <td className="py-1">Total</td>
            <td className="num py-1 text-right">{total}</td>
            <td />
            <td className="num py-1 text-right">{items.reduce((s, i) => s + i.p, 0).toFixed(3)}</td>
          </tr>
        </tbody>
      </table>
      {items.length > 8 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show the top 8" : `Show all ${items.length}`}
        </Button>
      )}
      <ProbBars ariaLabel={`Distribution after ${visible(context)}`} limit={10} items={items.map((i) => ({ key: i.token, label: <Tok>{visible(i.token)}</Tok>, value: i.p }))} remainderLabel="characters" />
    </div>
  )
}

function SamplingDemo({ corpus, context, items }: { corpus: string; context: string; items: { token: string; count: number; p: number }[] }) {
  const [seed, setSeed] = useState(7)
  const draw = useAsync(api.generate)
  const [repeat, setRepeat] = useState<number[] | null>(null)
  // Show the engine's draw only while it matches the text, context and seed it was made with.
  const real = draw.data && draw.data.prompt === context && draw.data.corpus.id === corpus && draw.data.seed === seed ? draw.data.steps[0] : undefined
  const engineOrder = real ? real.intervalOrder : items.map((i) => i.token)
  const byToken = new Map(items.map((i) => [i.token, i.p]))
  const segments = engineOrder.map((t) => ({ key: t, label: visible(t), p: byToken.get(t) ?? 0 }))

  function repeatDraws() {
    const probs = segments.map((s) => s.p)
    const rng = mulberry32(seed)
    const counts = probs.map(() => 0)
    for (let i = 0; i < 1000; i++) counts[pickByDraw(probs, rng())]++
    setRepeat(counts)
    actions.logRun({ route: "counts", title: `1,000 draws after “${visible(context)}”`, summary: "observed vs expected frequencies", source: "simulation" }, ["sampling"])
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">The probabilities are laid end to end between 0 and 1. A random number u picks whichever interval it lands in. Bigger probability, bigger interval, more likely to be hit.</p>
      <IntervalStrip ariaLabel="Probability intervals in the engine's order" segments={segments} draw={real?.draw} chosen={real?.token} />
      <div className="flex flex-wrap items-end gap-3">
        <NumberField id="draw-seed" helpId="counts.draw-seed" label="Seed" value={seed} min={0} max={4294967295} onChange={setSeed} />
        <Button data-help-id="counts.draw" onClick={async () => { const r = await draw.run({ corpus, prompt: context, length: 1, seed }); if (r) actions.logRun({ route: "counts", title: "One draw from the engine", summary: `seed ${seed} picked ${visible(r.suggestion)}`, source: "model" }, ["sampling", "seed"]) }} disabled={draw.loading}>
          <DiceThreeIcon className="size-4" /> Draw with your engine
        </Button>
      </div>
      {draw.error && <ErrorNote error={draw.error} />}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Repeat 1,000 times</h3>
          <Source kind="simulation" detail="same interval rule, browser generator" />
        </div>
        <p className="text-label text-muted-foreground">Uses the same rule as sample_next on these exact probabilities, but a browser random generator, so the seed does not match Python&apos;s.</p>
        <Button variant="outline" size="sm" className="self-start" data-help-id="counts.draws-1000" onClick={repeatDraws}>Run 1,000 draws</Button>
        {repeat && (
          <table className="text-sm">
            <thead><tr className="text-label text-muted-foreground"><th className="text-left font-normal">Next</th><th className="text-right font-normal">Expected</th><th className="text-right font-normal">Observed</th></tr></thead>
            <tbody>
              {segments.map((s, i) => ({ s, i })).sort((a, b) => b.s.p - a.s.p).slice(0, 8).map(({ s, i }) => (
                <tr key={s.key} className="border-t border-rule">
                  <td className="py-0.5"><Tok>{s.label}</Tok></td>
                  <td className="num text-right">{(s.p * 1000).toFixed(0)}</td>
                  <td className="num text-right">{repeat[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function TryAnyCharacter({ corpus, onPick }: { corpus: string; onPick: (c: string) => void }) {
  const [ch, setCh] = useState("!")
  const res = useAsync(api.row)
  return (
    <Panel id="unseen" title="Ask about any character" source={<Source kind="model" detail="answer from next_token_probabilities" />}
      teach={{ code: <EngineCode path="nextword/bigram.py" symbol="next_token_probabilities" /> }}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void res.run(corpus, ch) }}>
        <div className="flex flex-col gap-2">
          <label htmlFor="anych" className="text-sm font-medium">Context character</label>
          <input id="anych" value={ch} maxLength={2} onChange={(e) => setCh(Array.from(e.target.value).slice(-1).join(""))} className="tok h-9 w-20 rounded-md border border-input bg-card px-3 text-center text-sm" />
        </div>
        <Button type="submit" data-help-id="counts.ask" disabled={Array.from(ch).length !== 1}>Ask the engine</Button>
        <p className="pb-2 text-label text-muted-foreground">Try “!”, which never appears in the sample.</p>
      </form>
      <div className="mt-3">
        {res.error ? (
          <div className="flex flex-col gap-1 rounded-md bg-raised p-3 text-sm">
            <p><span className="font-medium">The engine refused:</span> {res.error.message}.</p>
            <p className="text-muted-foreground">That is <Term id="unseen-context">unseen context</Term> handling: no counts means no distribution, and the engine says so instead of guessing.</p>
          </div>
        ) : res.data ? (
          <p className="text-sm">
            The engine has <span className="num">{res.data.total}</span> pairs after <Tok tone="context">{res.data.label}</Tok>; the most likely next character is <Tok>{res.data.candidates[0].label}</Tok> ({res.data.candidates[0].p.toFixed(3)}).{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => onPick(res.data!.context)}>Open its row</button>
          </p>
        ) : null}
      </div>
    </Panel>
  )
}

function BeforeAfter({ baseText, baseTable, context }: { baseText: string; baseTable: CountTable; context: string }) {
  const [text, setText] = useState(baseText + " The cat sat by the fire.")
  const after = useAsync(api.tableFromText)
  const before = rowOf(baseTable, context)
  const afterRow = after.data ? rowOf(after.data, context) : undefined
  const tokens = Array.from(new Set([...before.items.map((i) => i.token), ...(afterRow?.items.map((i) => i.token) ?? [])]))
  const rows = tokens
    .map((tok) => ({ tok, b: before.row[tok] ?? 0, a: afterRow?.row[tok] ?? 0, pb: before.total ? (before.row[tok] ?? 0) / before.total : 0, pa: afterRow?.total ? (afterRow.row[tok] ?? 0) / afterRow.total : 0 }))
    .sort((x, y) => Math.abs(y.pa - y.pb) - Math.abs(x.pa - x.pb))
    .slice(0, 8)
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="edited" className="text-sm">Edit the text (it starts as the current corpus plus one sentence), then recount. The row for <Tok tone="context">{visible(context)}</Tok> is compared.</label>
      <Textarea id="edited" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="tok text-label" />
      <Button data-help-id="counts.recount" className="self-start" onClick={async () => { const r = await after.run(text); if (r) actions.logRun({ route: "counts", title: "Recounted an edited text", summary: `${fmt.n(r.pairs)} pairs`, source: "model" }, ["corpus", "conditional-probability"]) }} disabled={after.loading || charCount(text) < 2}>
        {after.loading ? "Counting…" : "Recount with your engine"}
      </Button>
      {after.error && <ErrorNote error={after.error} />}
      {afterRow && (
        <table className="text-sm">
          <caption className="mb-1 text-left text-label text-muted-foreground">Largest changes in P(next | {visible(context)}). Row total {before.total} → {afterRow.total}.</caption>
          <thead><tr className="text-label text-muted-foreground"><th className="text-left font-normal">Next</th><th className="text-right font-normal">Before</th><th className="text-right font-normal">After</th><th className="text-right font-normal">Change</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tok} className="border-t border-rule">
                <td className="py-0.5"><Tok>{visible(r.tok)}</Tok></td>
                <td className="num text-right">{r.pb.toFixed(3)} <span className="text-muted-foreground">({r.b})</span></td>
                <td className="num text-right">{r.pa.toFixed(3)} <span className="text-muted-foreground">({r.a})</span></td>
                <td className="num text-right">{r.pa - r.pb >= 0 ? "+" : "−"}{Math.abs(r.pa - r.pb).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Smoothing({ table, context }: { table: CountTable; context: string }) {
  const [k, setK] = useState(1)
  const v = table.vocab.length + 1
  const { row, total } = rowOf(table, context)
  const items = table.vocab.map((t) => {
    const c = row[t.token] ?? 0
    return { token: t.token, c, raw: total ? c / total : 0, smooth: (c + k) / (total + k * v) }
  })
  const unknown = k / (total + k * v)
  const unseen = items.filter((i) => i.c === 0)
  const unseenMass = unseen.reduce((s, i) => s + i.smooth, 0) + unknown
  const sum = items.reduce((s, i) => s + i.smooth, 0) + unknown
  const top = [...items].sort((a, b) => b.smooth - a.smooth).slice(0, 6)
  return (
    <div className="flex flex-col gap-4">
      <SliderField id="k" helpId="counts.smoothing" label={<>Add-k strength, k</>} value={k} min={0} max={5} step={0.1} onChange={setK} format={(x) => x.toFixed(1)} hint={<>P = (count + k) ÷ (row total + k × {v}). {v} = {table.vocab.length} known characters + 1 slot for any unknown one.</>} />
      {total === 0 && k === 0 ? (
        <Note tone="warning">This row has no counts, so without smoothing every probability is 0 ÷ 0.</Note>
      ) : (
        <>
          <table className="text-sm">
            <thead><tr className="text-label text-muted-foreground"><th className="text-left font-normal">Next</th><th className="text-right font-normal">Raw</th><th className="text-right font-normal">Smoothed</th></tr></thead>
            <tbody>
              {top.map((i) => (
                <tr key={i.token} className="border-t border-rule">
                  <td className="py-0.5"><Tok>{visible(i.token)}</Tok></td>
                  <td className="num text-right">{i.raw.toFixed(3)}</td>
                  <td className="num text-right">{i.smooth.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            <span className="num font-medium">{unseen.length}</span> characters never followed <Tok tone="context">{visible(context)}</Tok>, plus the unknown slot. Raw: they get 0. Smoothed: together they get <span className="num font-medium">{fmt.pct(unseenMass)}</span>. Everything still sums to <span className="num">{sum.toFixed(3)}</span>.
          </p>
        </>
      )}
      <p className="text-label text-muted-foreground">Smoothing moves probability away from what was seen. It adds no knowledge. Its effect on held-out loss is measured on the Evaluation bench.</p>
    </div>
  )
}

function CountsCycle({ table }: { table: CountTable }) {
  const space = rowOf(table, " ")
  const choices = ["t", "a", "w"].map((c) => ({ id: c, label: `“${c}”` }))
  const best = [...choices].sort((x, y) => (space.row[y.id] ?? 0) - (space.row[x.id] ?? 0))[0]
  const [looked, setLooked] = useState(false)
  const obs = looked ? (
    <>After a space: “t” {space.row.t ?? 0}, “a” {space.row.a ?? 0}, “w” {space.row.w ?? 0} times, out of {space.total}. The choice with the largest count is <strong>“{best.id}”</strong>.</>
  ) : undefined
  return (
    <div className="flex flex-col gap-3">
      <GuidedCycle
        id="counts"
        conceptId="conditional-probability"
        route="counts"
        question="In this training text, which of these most often follows a space?"
        choices={choices}
        correct={looked ? best.id : undefined}
        observation={obs}
        explainPrompt="What exactly is P(t | ␣), in terms of the table?"
        change={<>Add a sentence with many words starting with “w” under Change the training text, recount, and compare.</>}
        hints={["Find the ␣ row in the table.", "Divide the cell count by the row total."]}
      />
      {!looked && <Button variant="outline" className="self-start" onClick={() => { setLooked(true); actions.logRun({ route: "counts", title: "Checked the ␣ row", summary: "prediction check", source: "model" }, ["conditional-probability"]) }}>Check against the ␣ row</Button>}
    </div>
  )
}

function CountsExplain({ context, row }: { context: string; row?: { total: number; items: { token: string; count: number; p: number }[] } }) {
  const top = row?.items[0]
  const calc = useMemo(() => top && row ? `${top.count} ÷ ${row.total} = ${top.p.toFixed(3)}` : null, [top, row])
  return (
    <Explain
      plain={
        <>
          <p>Each cell counts how often one character followed another. The row for a character is everything the engine knows about what comes after it.</p>
          <p>Dividing each count by the row total is <Term id="normalization">normalization</Term>. The result is a <Term id="conditional-probability">conditional probability</Term>: “given this character, how likely is each next one?”</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen>
        {calc && top ? (
          <p>P(<Tok>{visible(top.token)}</Tok> | <Tok tone="context">{visible(context)}</Tok>) = count ÷ row total = <span className="num">{calc}</span>. Every row&apos;s probabilities add up to 1 because each count is divided by the same total.</p>
        ) : <p className="text-muted-foreground">Pick a row with counts.</p>}
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <EngineCode path="nextword/bigram.py" symbol="count_bigrams" />
          <EngineCode path="nextword/bigram.py" symbol="next_token_probabilities" />
        </div>
      </ExplainSection>
      <ExplainSection title="What this cannot tell you">
        <p>A probability here is how often something happened in this one small text. It is not how correct, typical or true anything is. With 1,167 characters, many rows rest on a handful of counts.</p>
      </ExplainSection>
      <EvidenceRecorder conceptId="conditional-probability" compact />
    </Explain>
  )
}
