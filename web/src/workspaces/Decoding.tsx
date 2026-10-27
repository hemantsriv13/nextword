import { useMemo, useState } from "react"
import { PlusIcon, TrashIcon, UndoIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ProbBars, Tok } from "@/components/lab/charts"
import { SimCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { Explain, ExplainSection, Note, NumberField, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { fmt } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { MAX_TEMPERATURE, MIN_TEMPERATURE, pipeline, rankOrder, repeatedDraws } from "@/sim/decoding"
import decodingSource from "@/sim/decoding.ts?raw"

interface Row { token: string; logit: number }

const GUIDE: Guide = {
  question: "Once a model has scored every possible next token, how is one token actually chosen, and what do temperature, top-k and top-p change?",
  scope: "The logits are a worked example you can edit; no trained model produced them. The stages and the repeated draws are a browser simulation. Your bigram engine produces probabilities directly from counts and only samples; it has no temperature, top-k or top-p yet (Stage 4).",
  sources: ["example", "simulation"],
  nodes: [
    { id: "logits", label: "Logits", kind: "input", target: "logits", carries: "scores",
      goesIn: "One score per candidate token, as a model's last layer would produce.",
      happens: "Nothing: they are the starting point, and nothing below changes them.",
      why: "Scores can be any real number. Only their differences matter for the probabilities.",
      comesOut: "A list of scores.",
      next: "They are divided by the temperature." },
    { id: "temp", label: "Divide by temperature", kind: "operation", target: "pipeline", carries: "scores ÷ T",
      goesIn: "The logits and T.",
      happens: "Every logit is divided by T, then softmax turns the results into probabilities.",
      why: "Dividing by T > 1 shrinks the gaps between scores, so probabilities even out; T < 1 widens them, so the top token takes more.",
      comesOut: "A tempered distribution. The logits and the model's weights are unchanged.",
      next: "Top-k may remove the tail.",
      tryIt: "Move T and watch only the second column of the stage table change." },
    { id: "topk", label: "Top-k, then renormalize", kind: "operation", target: "pipeline", carries: "the k most likely",
      goesIn: "The tempered probabilities and k.",
      happens: "All but the k most likely tokens are set to 0; the survivors are divided by their sum.",
      why: "It stops a long tail of unlikely tokens from being drawn now and then.",
      comesOut: "At most k tokens, summing to one.",
      next: "Top-p may cut further." },
    { id: "topp", label: "Top-p, then renormalize", kind: "operation", target: "pipeline", carries: "the final distribution",
      goesIn: "The renormalized top-k probabilities and p.",
      happens: "The smallest set of top tokens whose probabilities add up to at least p is kept; the rest are set to 0; the survivors are renormalized.",
      why: "Unlike a fixed k, it keeps many tokens when the model is unsure and few when it is confident.",
      comesOut: "The distribution sampling uses.",
      next: "A random draw, or greedy, picks one token." },
    { id: "sample", label: "Sample (or greedy)", kind: "output", target: "draws",
      goesIn: "The final distribution and a seeded random generator.",
      happens: "Sampling lays the probabilities end to end and picks the one the random number lands in; greedy always takes the largest.",
      why: "Sampling gives variety in proportion to the probabilities; greedy gives the same answer every time.",
      comesOut: "One token per draw.",
      next: "In generation, it is appended and the model scores the next position.",
      tryIt: "Draw 1,000 times and compare the observed shares with the final column." },
  ],
  tour: [
    { target: "logits", title: "Scores, not probabilities", plain: <><p>A model's last layer gives one score per candidate: a logit. Higher means more likely, but the numbers don't add up to anything. The third column shows the plain softmax of these scores.</p></>,
      terms: [{ id: "logits", role: "the raw scores you can edit." }, { id: "softmax", role: "turns scores into probabilities." }] },
    { target: "settings", title: "Three knobs, applied in order", plain: <><p>Temperature changes how sharp the probabilities are. Top-k and top-p remove unlikely tokens. Greedy skips the randomness entirely.</p><p>None of them touch the logits or the model's weights: they only change how a choice is made from the same scores.</p></>,
      terms: [{ id: "temperature", role: "divides the scores before softmax." }, { id: "greedy", role: "always the most likely token." }] },
    { target: "pipeline", title: "The distribution after each stage", plain: <><p>Read the table left to right: divide by T and apply softmax, keep the top k and renormalize, keep the top-p share and renormalize again. The last column is what sampling uses.</p><p>Renormalizing means dividing the survivors by their sum, so they add up to one again.</p></>,
      terms: [{ id: "top-k", role: "keep the k most likely." }, { id: "top-p", role: "keep the most likely until their share reaches p." }, { id: "normalization", role: "divide by the sum so it adds up to one." }] },
    { target: "draws", title: "Draws follow the final column", plain: <><p>Each draw picks one token from the final column. Over many draws, the shares come close to those probabilities. The same seed and settings give the same draws.</p></>,
      terms: [{ id: "sampling", role: "one random pick per draw." }, { id: "seed", role: "repeats the same draws." }] },
  ],
}

const PRESETS: Record<string, { label: string; rows: Row[] }> = {
  sentence: { label: "“The cat sat on the …”", rows: [{ token: "mat", logit: 3.2 }, { token: "floor", logit: 2.5 }, { token: "sofa", logit: 2.1 }, { token: "roof", logit: 1.0 }, { token: "moon", logit: -0.5 }, { token: "banana", logit: -2.0 }] },
  flat: { label: "Nearly flat", rows: [{ token: "red", logit: 1.0 }, { token: "blue", logit: 0.9 }, { token: "green", logit: 0.85 }, { token: "gold", logit: 0.7 }, { token: "grey", logit: 0.6 }] },
  peaked: { label: "One clear winner", rows: [{ token: "Paris", logit: 6.0 }, { token: "Lyon", logit: 2.0 }, { token: "Rome", logit: 1.5 }, { token: "London", logit: 1.0 }] },
}

export default function Decoding() {
  const [rows, setRows] = useState<Row[]>(PRESETS.sentence.rows)
  const [temperature, setTemperature] = useState(1)
  const [greedy, setGreedy] = useState(false)
  const [k, setK] = useState(0)
  const [p, setP] = useState(1)
  const [n, setN] = useState(1000)
  const [seed, setSeed] = useState(42)
  const [draws, setDraws] = useState<{ counts: number[]; n: number; seed: number; settings: string } | null>(null)

  const logits = rows.map((r) => r.logit)
  const valid = rows.length >= 2 && logits.every(Number.isFinite)
  const stages = useMemo(() => (valid ? pipeline(logits, { temperature, greedy, k, p }) : null), [valid, logits, temperature, greedy, k, p])
  const settingsKey = JSON.stringify({ rows, temperature, greedy, k, p })
  const winner = stages ? rankOrder(stages.final)[0] : 0

  function runDraws() {
    if (!stages) return
    const counts = repeatedDraws(stages.final, n, seed, greedy)
    setDraws({ counts, n, seed, settings: settingsKey })
    actions.logRun({ route: "decoding", title: `${fmt.n(n)} draws`, summary: greedy ? "greedy" : `T ${temperature}, k ${k || "off"}, p ${p < 1 ? p : "off"}, seed ${seed}`, source: "simulation" }, ["temperature", "sampling", ...(k ? ["top-k"] : []), ...(p < 1 ? ["top-p"] : []), ...(greedy ? ["greedy"] : [])])
  }

  const current = draws && draws.settings === settingsKey ? draws : null
  const topBefore = stages ? Math.max(...stages.softmax1) : 0
  const topAfter = stages ? Math.max(...stages.tempered) : 0
  const tempObservation = current && !greedy && temperature !== 1 ? (
    <>At T = 1 the top token has p = {topBefore.toFixed(3)}. At T = {temperature} it has {topAfter.toFixed(3)}. The logits did not change; only the division by T before softmax did.</>
  ) : undefined

  const top = stages ? rankOrder(stages.softmax1)[0] : 0
  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Decoding sandbox"
      subtitle="Turn a model's raw scores into one chosen token, stage by stage. These logits are yours to edit; no trained model is involved."
      explain={<DecodingExplain />}
    >
      <WorkspaceGuide />
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel id="logits" title="Logits" source={<Source kind="example" detail="values you set" />}
          teach={{
            calc: stages ? (() => {
              const ex = logits.map((z) => Math.exp(z))
              const sum = ex.reduce((a, b) => a + b, 0)
              return <><Symbols rows={[
                ["z", "the logits", logits.map((z) => z.toFixed(2)).join(", ")],
                ["eᶻ", "e to the power of each (always positive)", ex.map((v) => v.toFixed(2)).join(", ")],
                ["Σ eᶻ", "their sum", sum.toFixed(2)],
                [`p(${rows[top].token})`, `${ex[top].toFixed(2)} ÷ ${sum.toFixed(2)}`, stages.softmax1[top].toFixed(3)],
              ]} /><p>Adding the same number to every logit changes nothing: softmax only depends on the gaps between scores.</p></>
            })() : undefined,
            code: <SimCode path="web/src/sim/decoding.ts" symbol="softmax" text={decodingSource} />,
          }}
          aside={<Segmented label="Preset" helpId="decoding.presets" value={Object.entries(PRESETS).find(([, v]) => JSON.stringify(v.rows) === JSON.stringify(rows))?.[0] ?? "custom"} onChange={(v) => PRESETS[v] && setRows(PRESETS[v].rows)} options={[...Object.entries(PRESETS).map(([id, v]) => ({ value: id, label: v.label.length > 18 ? "Sentence" : v.label })), ...(Object.values(PRESETS).some((v) => JSON.stringify(v.rows) === JSON.stringify(rows)) ? [] : [{ value: "custom", label: "Custom" }])]} />}>
          <table className="w-full text-sm">
            <caption className="mb-2 text-left text-label text-muted-foreground"><Term id="logits">Logits</Term> are raw scores: any real number, higher means more likely.</caption>
            <thead><tr className="text-label text-muted-foreground"><th className="py-1 text-left font-normal">Token</th><th className="py-1 text-right font-normal">Logit</th><th className="py-1 text-right font-normal"><Term id="softmax">softmax</Term> at T = 1</th><th className="w-10" /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-rule">
                  <td className="py-1 pr-2"><input aria-label={`Token ${i + 1}`} value={r.token} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, token: e.target.value } : x)))} className="tok h-8 w-full rounded-md border border-input bg-card px-2 text-sm" /></td>
                  <td className="py-1 text-right">
                    <input aria-label={`Logit for ${r.token}`} data-help-id="decoding.logits" type="number" step="0.1" value={Number.isFinite(r.logit) ? r.logit : ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, logit: e.target.value === "" ? NaN : Number(e.target.value) } : x)))} className={cn("num h-8 w-24 rounded-md border border-input bg-card px-2 text-right text-sm", !Number.isFinite(r.logit) && "border-negative")} />
                  </td>
                  <td className="num py-1 text-right">{stages ? stages.softmax1[i].toFixed(3) : "–"}</td>
                  <td className="py-1 text-right">
                    <Button variant="ghost" size="icon" data-help-id="decoding.edit-rows" aria-label={`Remove ${r.token}`} disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))}><TrashIcon className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" data-help-id="decoding.edit-rows" disabled={rows.length >= 10} onClick={() => setRows([...rows, { token: `token${rows.length + 1}`, logit: 0 }])}><PlusIcon className="size-4" /> Add a token</Button>
            <Button variant="ghost" size="sm" data-help-id="decoding.edit-rows" onClick={() => setRows(PRESETS.sentence.rows)}><UndoIcon className="size-4" /> Reset</Button>
          </div>
          {!valid && <p role="alert" className="mt-2 text-sm text-negative">Every logit needs a number, and there must be at least two tokens.</p>}
        </Panel>

        <Panel id="settings" title="Decoding settings" source={<Source kind="simulation" />}
          teach={{ code: <SimCode path="web/src/sim/decoding.ts" symbol="pipeline" text={decodingSource} /> }}>
          <div className="flex flex-col gap-5">
            <label data-help-id="decoding.greedy" className="flex items-center justify-between gap-4 text-sm font-medium">
              <span><Term id="greedy">Greedy</Term>: always take the most likely token</span>
              <Switch checked={greedy} onCheckedChange={setGreedy} aria-label="Greedy decoding" />
            </label>
            <div className={cn("flex flex-col gap-5", greedy && "opacity-60")} aria-disabled={greedy}>
              <SliderField id="temp" helpId="decoding.temperature" label={<Term id="temperature">Temperature</Term>} value={temperature} min={MIN_TEMPERATURE} max={3} step={0.05} onChange={setTemperature} format={(v) => `T = ${v.toFixed(2)}`} hint={greedy ? "Not used by greedy decoding." : `Must be above 0 (here ${MIN_TEMPERATURE} to 3; the code accepts up to ${MAX_TEMPERATURE}). T → 0 approaches greedy.`} />
              <SliderField id="topk" helpId="decoding.filters" label={<Term id="top-k">Top-k</Term>} value={k} min={0} max={rows.length} step={1} onChange={setK} format={(v) => (v === 0 || v >= rows.length ? "off" : `keep ${v}`)} />
              <SliderField id="topp" helpId="decoding.filters" label={<Term id="top-p">Top-p</Term>} value={p} min={0.05} max={1} step={0.05} onChange={setP} format={(v) => (v >= 1 ? "off" : `keep ${fmt.pct(v, 0)} of mass`)} />
            </div>
            {greedy && <p className="text-sm">Greedy picks <Tok tone="chosen">{rows[winner]?.token}</Tok> every time. No randomness is involved, so the seed has no effect.</p>}
          </div>
        </Panel>
      </div>

      <Panel id="pipeline" variant="canvas" title="The distribution at each stage" source={<Source kind="simulation" />}
        teach={{
          calc: stages ? <><Symbols rows={[
            [`z ÷ T`, `${rows[top].token}: ${logits[top].toFixed(2)} ÷ ${temperature.toFixed(2)}`, greedy ? "not used (greedy)" : (logits[top] / temperature).toFixed(3)],
            ["softmax", `p(${rows[top].token}) at this temperature`, stages.tempered[top].toFixed(3)],
            ["top-k", k === 0 || k >= rows.length ? "off: every token kept" : `kept ${k} tokens, sum before renormalizing ${stages.afterK.reduce((a, b) => a + b, 0).toFixed(3)}`, stages.afterK[top] ? stages.afterK[top].toFixed(3) : "removed"],
            ["top-p", p >= 1 ? "off" : `smallest top set with share ≥ ${p.toFixed(2)}, taken from the renormalized top-k values`, stages.afterP[top] ? stages.afterP[top].toFixed(3) : "removed"],
            ["final", "renormalized: what sampling uses", stages.final[top].toFixed(3)],
          ]} /><p>The rows follow {rows[top].token}, the most likely token at T = 1. The logits never change; each stage only changes the probabilities made from them.</p></> : undefined,
          code: <><SimCode path="web/src/sim/decoding.ts" symbol="pipeline" text={decodingSource} /><SimCode path="web/src/sim/decoding.ts" symbol="topP" text={decodingSource} /></>,
        }}>
        {!stages ? <Note tone="warning">Fix the logits above to see the stages.</Note> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Probability of each token after each stage</caption>
              <thead>
                <tr className="text-label text-muted-foreground">
                  <th scope="col" className="py-1 text-left font-normal">Token</th>
                  <th scope="col" className="py-1 text-right font-normal">softmax, T = 1</th>
                  <th scope="col" className="py-1 text-right font-normal">{greedy ? "temperature (not used)" : `÷ T = ${temperature.toFixed(2)}`}</th>
                  <th scope="col" className="py-1 text-right font-normal">after top-k</th>
                  <th scope="col" className="py-1 text-right font-normal">after top-p (of renormalized top-k)</th>
                  <th scope="col" className="py-1 pl-4 text-left font-normal">renormalized: used to sample</th>
                </tr>
              </thead>
              <tbody>
                {rankOrder(stages.softmax1).map((i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="py-1.5"><Tok tone={greedy && i === winner ? "chosen" : "plain"}>{rows[i].token}</Tok></td>
                    {[stages.softmax1, stages.tempered, stages.afterK, stages.afterP].map((s, j) => (
                      <td key={j} className={cn("num py-1.5 text-right", s[i] === 0 && "text-muted-foreground")}>{s[i] === 0 ? "removed" : s[i].toFixed(3)}</td>
                    ))}
                    <td className="py-1.5 pl-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-40 rounded-[3px] bg-secondary"><div className="h-full rounded-[3px] bg-data" style={{ width: `${stages.final[i] * 100}%` }} /></div>
                        <span className="num">{stages.final[i].toFixed(3)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border text-muted-foreground">
                  <td className="py-1.5">Sum</td>
                  {[stages.softmax1, stages.tempered, stages.afterK, stages.afterP, stages.final].map((s, j) => (
                    <td key={j} className={cn("num py-1.5", j === 4 ? "pl-4" : "text-right")}>{s.reduce((a, b) => a + b, 0).toFixed(3)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-label text-muted-foreground">After filtering, the kept probabilities no longer sum to 1, so they are divided by their sum (renormalized) before sampling.</p>
            <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-label" aria-label="Order of the stages in the code">
              {["divide logits by T", "softmax", "top-k", "renormalize", "top-p", "renormalize", greedy ? "take the largest" : "sample"].map((label, i, all) => (
                <li key={i} className="flex items-center gap-2"><span className="rounded-md bg-raised px-2 py-0.5">{label}</span>{i < all.length - 1 && <span aria-hidden="true" className="text-muted-foreground">→</span>}</li>
              ))}
            </ol>
            <p className="mt-2 text-label text-muted-foreground">Fixed throughout: the logits, and the model weights that would have produced them. Temperature changes the probabilities made from the scores, never the scores or the weights.</p>
          </div>
        )}
      </Panel>

      <Panel id="draws" title="Repeated draws" source={<Source kind="simulation" detail="browser random generator" />}
        teach={{
          calc: current && stages ? <Symbols rows={rankOrder(stages.final).slice(0, 5).map((i) => [rows[i].token, `expected ${(stages.final[i] * current.n).toFixed(0)} of ${fmt.n(current.n)}`, `observed ${fmt.n(current.counts[i])}`] as [string, string, string])} /> : <p>Draw first; the numbers here then belong to those draws and their settings.</p>,
          code: <><SimCode path="web/src/sim/decoding.ts" symbol="pickByDraw" text={decodingSource} /><SimCode path="web/src/sim/decoding.ts" symbol="repeatedDraws" text={decodingSource} /></>,
        }}>
        <div className="flex flex-wrap items-end gap-4">
          <NumberField id="n" helpId="decoding.draw-settings" label="Number of draws" value={n} min={1} max={100000} onChange={setN} />
          <NumberField id="dseed" helpId="decoding.draw-settings" label="Seed" value={seed} min={0} max={4294967295} onChange={setSeed} />
          <Button data-help-id="decoding.draw" onClick={runDraws} disabled={!stages}>Draw {fmt.n(n)} times</Button>
        </div>
        {draws && !current && <p className="mt-3 text-sm text-muted-foreground">Settings changed since the last draws. Draw again to compare.</p>}
        {current && stages && (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Observed share, {fmt.n(current.n)} draws, seed {current.seed}</h3>
              <ProbBars ariaLabel="Observed share of draws per token" items={rankOrder(stages.final).map((i) => ({ key: String(i), label: <Tok>{rows[i].token}</Tok>, value: current.counts[i] / current.n, detail: fmt.n(current.counts[i]) }))} max={1} />
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <p>Expected share is the renormalized column above. With more draws, observed shares get closer to it.</p>
              <p>Same seed and same settings give exactly the same draws. A different seed gives different draws, though a single draw can still land on the same token by chance.</p>
              <p className="text-muted-foreground">This generator is not Python&apos;s, so these seeds don&apos;t reproduce your engine&apos;s results.</p>
            </div>
          </div>
        )}
      </Panel>

      <GuidedCycle
        id="decoding"
        conceptId="temperature"
        route="decoding"
        question="Raise the temperature above 1. What happens to the most likely token's probability?"
        choices={[{ id: "down", label: "It goes down; the distribution flattens" }, { id: "up", label: "It goes up" }, { id: "same", label: "It stays the same" }]}
        correct={tempObservation ? (topAfter < topBefore - 1e-12 ? "down" : topAfter > topBefore + 1e-12 ? "up" : "same") : undefined}
        observation={tempObservation}
        explainPrompt="Why does dividing logits by T > 1 flatten the distribution? What does temperature not change?"
        change="Keep T fixed and turn on top-k = 2. Which tokens can still be drawn?"
        hints={["Dividing by 2 halves every gap between logits.", "Softmax depends only on the gaps between logits."]}
      />
    </Workspace>
    </Teach>
  )
}

function DecodingExplain() {
  return (
    <Explain
      plain={
        <>
          <p>A model outputs a score for every token. <Term id="softmax">Softmax</Term> turns scores into probabilities. <Term id="temperature">Temperature</Term> stretches or squashes them first. <Term id="top-k">Top-k</Term> and <Term id="top-p">top-p</Term> cut away unlikely tokens. Then one token is drawn.</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen>
        <div className="flex flex-col gap-2">
          <p>softmax(z / T)ᵢ = exp(zᵢ / T) ÷ Σⱼ exp(zⱼ / T)</p>
          <p>For logits [2, 1, 0]: at T = 1, exp gives [7.39, 2.72, 1.00], sum 11.11, so p = [0.665, 0.245, 0.090]. At T = 2, the logits become [1, 0.5, 0] and p = [0.506, 0.307, 0.186].</p>
          <p>The code subtracts the largest logit before exp. That changes nothing mathematically but keeps exp from overflowing.</p>
        </div>
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <SimCode path="web/src/sim/decoding.ts" symbol="softmax" text={decodingSource} />
          <SimCode path="web/src/sim/decoding.ts" symbol="topP" text={decodingSource} />
          <SimCode path="web/src/sim/decoding.ts" symbol="pipeline" text={decodingSource} />
        </div>
      </ExplainSection>
      <ExplainSection title="Four things that are easy to get wrong">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Temperature changes the distribution you sample from, never the model&apos;s learned weights.</li>
          <li>Higher temperature is not more intelligence or creativity; it is more randomness.</li>
          <li>A seed fixes the random draws only under matching conditions: same model, settings, and generator.</li>
          <li>A token&apos;s probability is not <Term id="confidence">factual confidence</Term>. A fluent, likely continuation can be false.</li>
        </ul>
      </ExplainSection>
      <ExplainSection title="Your engine and decoding">
        <p>Your bigram engine only samples, at temperature 1, with no filtering. Adding temperature and top-k to it is part of Stage 4. The <Term id="greedy">greedy</Term> limit would always pick the most frequent next character.</p>
      </ExplainSection>
      <EvidenceRecorder conceptId="temperature" compact />
    </Explain>
  )
}
