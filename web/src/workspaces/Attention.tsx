import { useMemo, useState } from "react"
import { NavArrowDownIcon } from "@/components/icons"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { MatrixView, Tok } from "@/components/lab/charts"
import { SimCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, Explain, ExplainSection, Note, Panel, Segmented, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { attentionHead, inputMatrix, multiHead, shape, toyHeadWeights, transformerBlock, type Matrix } from "@/sim/attention"
import attentionSource from "@/sim/attention.ts?raw"
import { mulberry32, randomMatrix } from "@/sim/rng"

const D = 4

export default function Attention() {
  const [text, setText] = useState("the cat sat on the mat")
  const [causal, setCausal] = useState(true)
  const [positions, setPositions] = useState(true)
  const [heads, setHeads] = useState<"one" | "two">("one")
  const [query, setQuery] = useState<number | null>(null)
  const tokens = text.trim().split(/\s+/).filter(Boolean).slice(0, 8)
  const valid = tokens.length >= 2

  const sequenceKey = tokens.join(" ")
  const model = useMemo(() => {
    if (!valid) return null
    const input = inputMatrix({ tokens, d: D, usePositions: positions })
    const single = attentionHead(input.x, toyHeadWeights(D, D, 11), causal)
    const twoHeads = [toyHeadWeights(D, 2, 21), toyHeadWeights(D, 2, 22)]
    const wo = randomMatrix(D, D, mulberry32(23), 0.5)
    const multi = multiHead(input.x, twoHeads, wo, causal)
    return { input, single, multi, twoHeads, wo }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokens is rebuilt each render; sequenceKey is its value
  }, [sequenceKey, positions, causal, valid])

  const q = query !== null && query < tokens.length ? query : null

  return (
    <Workspace
      title="Attention explorer"
      subtitle="How each position builds its new vector from the others. The arithmetic is real; the vectors and weights are made-up toy numbers, not learned."
      explain={<AttentionExplain />}
    >
      <Panel id="seq" title="Sequence" source={<Source kind="simulation" detail="toy, seeded random weights" />}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="seq-in" className="text-sm font-medium">Tokens, separated by spaces (2 to 8)</label>
            <input id="seq-in" value={text} onChange={(e) => { setText(e.target.value); setQuery(null) }} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={causal} onCheckedChange={(v) => { setCausal(v); actions.logRun({ route: "attention", title: `Causal mask ${v ? "on" : "off"}`, summary: tokens.join(" "), source: "simulation" }, ["causal-mask"]) }} aria-label="Causal mask" /> <Term id="causal-mask">Causal mask</Term></label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={positions} onCheckedChange={setPositions} aria-label="Add positional information" /> <Term id="positional-encoding">Positional information</Term></label>
            <Segmented label="Heads" value={heads} onChange={setHeads} options={[{ value: "one", label: "One head, dₖ = 4" }, { value: "two", label: "Two heads, dₖ = 2" }]} />
          </div>
          {!valid ? <EmptyNote>Type at least two tokens.</EmptyNote> : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Pick a position to see what it can attend to:</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a query position">
                {tokens.map((t, i) => {
                  const allowed = q !== null && (!causal || i <= q)
                  return (
                    <button key={i} type="button" onClick={() => { setQuery(i); actions.logRun({ route: "attention", title: `Inspected position ${i + 1}`, summary: `${causal ? "masked" : "unmasked"}`, source: "simulation" }, ["attention", "qkv"]) }} aria-pressed={q === i}
                      className={cn("tok flex flex-col items-center rounded-md border px-3 py-1.5 text-sm", q === i ? "border-foreground bg-primary text-primary-foreground" : allowed ? "border-data bg-data-soft" : q !== null ? "border-dashed border-border text-muted-foreground" : "border-border hover:bg-raised")}>
                      <span>{t}</span>
                      <span className="num text-[11px] opacity-80">pos {i + 1}</span>
                    </button>
                  )
                })}
              </div>
              {q !== null && <p className="text-sm">Position {q + 1} (“{tokens[q]}”) can attend to {causal ? `positions 1–${q + 1}` : "every position"}{causal && q < tokens.length - 1 ? `; positions ${q + 2}–${tokens.length} are masked out.` : "."}</p>}
            </div>
          )}
        </div>
      </Panel>

      {model && (
        <>
          <Panel id="inputs" title="Step 1: token vectors plus positions" source={<Source kind="simulation" />}>
            <div className="flex flex-wrap items-start gap-6">
              <MatrixView name="E (toy embeddings)" m={model.input.embeddings} rowLabels={tokens} highlightRows={q !== null ? [q] : undefined} />
              <span className="self-center text-lg" aria-hidden="true">+</span>
              <MatrixView name="P (sinusoidal positions)" m={model.input.positions} rowLabels={tokens.map((_, i) => `pos ${i + 1}`)} />
              <span className="self-center text-lg" aria-hidden="true">=</span>
              <MatrixView name="X" m={model.input.x} rowLabels={tokens} highlightRows={q !== null ? [q] : undefined} caption={`n = ${tokens.length} positions, d = ${D}`} />
            </div>
            {!positions && <p className="mt-3 text-sm">With positions off, a repeated token (like “the”) gets an identical row of X wherever it appears, so attention can&apos;t tell the copies apart by position.</p>}
          </Panel>

          {heads === "one" ? (
            <SingleHead tokens={tokens} r={model.single} q={q} causal={causal} />
          ) : (
            <TwoHeads tokens={tokens} model={model} q={q} />
          )}

          <MaskCheck tokens={tokens} positions={positions} />
          <BlockDiagram x={model.input.x} tokens={tokens} causal={causal} />
        </>
      )}

      <GuidedCycle
        id="attention"
        conceptId="causal-mask"
        route="attention"
        question="With the causal mask on, how much weight can the first position give to the last one?"
        choices={[{ id: "zero", label: "Exactly zero" }, { id: "small", label: "A small amount" }, { id: "depends", label: "It depends on the words" }]}
        correct={model && causal && q === 0 ? (model.single.weights[0][tokens.length - 1] === 0 ? "zero" : "small") : undefined}
        observation={model && causal && q === 0 ? <>Row 1 of the weights: {model.single.weights[0].map((w, j) => <span key={j} className="num mr-1.5">{w.toFixed(3)}</span>)}. Its score for the last position was set to −∞ before softmax, and exp(−∞) = 0.</> : undefined}
        explainPrompt="Why would training a next-token model be broken if position 1 could see position 6?"
        change="Turn the mask off and pick position 1 again. Then edit the last token and watch row 1 of the output change."
        hints={["Pick position 1 with the mask on to see its row.", "When predicting token 2, the model must not already be shown token 2."]}
      />
    </Workspace>
  )
}

function WeightsGrid({ tokens, weights, masked, q }: { tokens: string[]; weights: Matrix; masked: Matrix; q: number | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[12px]">
        <caption className="mb-1 text-left text-sm"><span className="font-medium">Attention weights</span> <span className="num text-muted-foreground">shape {tokens.length} × {tokens.length}; rows: query, columns: key</span></caption>
        <thead><tr><th />{tokens.map((t, j) => <th key={j} scope="col" className="tok px-1 font-normal text-muted-foreground">{t}</th>)}<th className="px-2 text-right font-normal text-muted-foreground">row sum</th></tr></thead>
        <tbody>
          {weights.map((row, i) => (
            <tr key={i} className={cn(q !== null && q !== i && "opacity-50")}>
              <th scope="row" className="tok pr-2 text-right font-normal text-muted-foreground">{tokens[i]}</th>
              {row.map((w, j) => {
                const isMasked = masked[i][j] === -Infinity
                return (
                  <td key={j} className={cn("num min-w-[3.2em] rounded-[3px] px-1.5 py-1 text-right", isMasked && "bg-secondary text-muted-foreground", q === i && "outline outline-1 outline-foreground")}
                    style={isMasked ? undefined : { background: `color-mix(in oklab, var(--data) ${Math.round(w * 45)}%, var(--card))` }}
                    title={isMasked ? "masked: future position" : `${tokens[i]} → ${tokens[j]}: ${w.toFixed(4)}`}>
                    {isMasked ? "0" : w.toFixed(2)}
                  </td>
                )
              })}
              <td className="num px-2 text-right">{row.reduce((a, b) => a + b, 0).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SingleHead({ tokens, r, q, causal }: { tokens: string[]; r: ReturnType<typeof attentionHead>; q: number | null; causal: boolean }) {
  const dk = shape(r.q)[1]
  return (
    <>
      <Panel id="qkv" title="Step 2: queries, keys and values" source={<Source kind="simulation" />}>
        <p className="mb-4 text-sm">Q = X·W<sub>Q</sub>, K = X·W<sub>K</sub>, V = X·W<sub>V</sub>, each W of shape {D} × {dk}. A query asks “what am I looking for?”, a key says “what I contain”, a value is “what I pass on”. Concretely they are just three different linear projections of X.</p>
        <div className="flex flex-wrap items-start gap-6">
          <MatrixView name="Q" m={r.q} rowLabels={tokens} highlightRows={q !== null ? [q] : undefined} />
          <MatrixView name="K" m={r.k} rowLabels={tokens} />
          <MatrixView name="V" m={r.v} rowLabels={tokens} />
        </div>
      </Panel>
      <Panel id="scores" title="Step 3: scores, scaling, mask, softmax" source={<Source kind="simulation" />}>
        <div className="flex flex-wrap items-start gap-6">
          <MatrixView name="Q·Kᵀ" m={r.scores} rowLabels={tokens} colLabels={tokens} highlightRows={q !== null ? [q] : undefined} caption={`(${tokens.length} × ${dk}) · (${dk} × ${tokens.length})`} />
          <MatrixView name={`÷ √${dk} = ÷ ${Math.sqrt(dk).toFixed(2)}`} m={r.scaled} rowLabels={tokens} colLabels={tokens} />
          <MatrixView name={causal ? "masked: future → −∞" : "no mask"} m={r.masked} rowLabels={tokens} colLabels={tokens} mask={r.masked.map((row) => row.map((v) => v === -Infinity))} />
        </div>
        <div className="mt-6"><WeightsGrid tokens={tokens} weights={r.weights} masked={r.masked} q={q} /></div>
        <p className="mt-3 text-sm">Softmax runs along each row over the allowed positions only, so every row sums to 1. Scaling by √dₖ keeps scores from growing with the vector size, which would make softmax too peaked.</p>
      </Panel>
      <Panel id="out" title="Step 4: weighted sum of values" source={<Source kind="simulation" />}>
        {q === null ? <EmptyNote>Pick a position above to see its weighted sum.</EmptyNote> : (
          <div className="flex flex-col gap-3 text-sm">
            <p>Output for position {q + 1} = Σⱼ weight[{q + 1}, j] × V[j]:</p>
            <ul className="tok flex flex-col gap-1 text-[13px]">
              {r.weights[q].map((w, j) => w > 0 && (
                <li key={j}>{w.toFixed(3)} × [{r.v[j].map((v) => v.toFixed(2)).join(", ")}] <span className="text-muted-foreground">({tokens[j]})</span></li>
              ))}
            </ul>
            <p>= <span className="tok">[{r.out[q].map((v) => v.toFixed(3)).join(", ")}]</span>, a new vector of {dk} numbers for position {q + 1}.</p>
          </div>
        )}
        <div className="mt-4"><MatrixView name="Output = weights · V" m={r.out} rowLabels={tokens} highlightRows={q !== null ? [q] : undefined} /></div>
      </Panel>
    </>
  )
}

function TwoHeads({ tokens, model, q }: { tokens: string[]; model: { multi: ReturnType<typeof multiHead>; wo: Matrix }; q: number | null }) {
  return (
    <Panel id="heads" title="Two heads side by side" source={<Source kind="simulation" />}>
      <p className="mb-4 text-sm">Each head has its own W<sub>Q</sub>, W<sub>K</sub>, W<sub>V</sub> of shape {D} × 2, so each produces its own weights. Their outputs (n × 2 each) are concatenated to n × 4 and multiplied by W<sub>O</sub> (4 × 4).</p>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {model.multi.results.map((r, h) => (
          <div key={h} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Head {h + 1}</h3>
            <WeightsGrid tokens={tokens} weights={r.weights} masked={r.masked} q={q} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-start gap-6">
        <MatrixView name="concat(head 1, head 2)" m={model.multi.concat} rowLabels={tokens} />
        <MatrixView name="× W_O =" m={model.multi.out} rowLabels={tokens} />
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">Different heads can spread weight differently. With toy weights, any “meaning” you see in a pattern is coincidence.</p>
    </Panel>
  )
}

function MaskCheck({ tokens, positions }: { tokens: string[]; positions: boolean }) {
  const [replacement, setReplacement] = useState("dog")
  const changed = [...tokens.slice(0, -1), replacement || "?"]
  const diff = (causal: boolean) => {
    const w = toyHeadWeights(D, D, 11)
    const a = attentionHead(inputMatrix({ tokens, d: D, usePositions: positions }).x, w, causal).out
    const b = attentionHead(inputMatrix({ tokens: changed, d: D, usePositions: positions }).x, w, causal).out
    return Math.max(...a.slice(0, -1).flatMap((row, i) => row.map((v, j) => Math.abs(v - b[i][j]))))
  }
  const masked = diff(true)
  const unmasked = diff(false)
  return (
    <Panel id="check" title="Check: can the future leak backwards?" source={<Source kind="simulation" detail="recomputed live" />}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="repl" className="text-sm font-medium">Replace the last token “{tokens.at(-1)}” with</label>
          <input id="repl" value={replacement} onChange={(e) => setReplacement(e.target.value.trim())} className="tok h-9 w-40 rounded-md border border-input bg-card px-3 text-sm" />
        </div>
      </div>
      <table className="mt-4 text-sm">
        <caption className="sr-only">Largest change in earlier outputs</caption>
        <thead><tr className="text-[12px] text-muted-foreground"><th className="text-left font-normal">Mask</th><th className="px-4 text-right font-normal">Largest change in outputs 1–{tokens.length - 1}</th><th className="text-left font-normal">Verdict</th></tr></thead>
        <tbody>
          <tr className="border-t border-rule"><td className="py-1.5">On</td><td className="num px-4 text-right">{masked.toExponential(1)}</td><td className={masked < 1e-12 ? "text-positive" : "text-negative"}>{masked < 1e-12 ? "Earlier positions are unaffected" : "Leak"}</td></tr>
          <tr className="border-t border-rule"><td className="py-1.5">Off</td><td className="num px-4 text-right">{unmasked.toFixed(4)}</td><td>{unmasked > 1e-12 ? "Earlier positions changed: the future leaked in" : "No change"}</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-[13px] text-muted-foreground">The same property is checked by an automated test in attention.test.ts.</p>
    </Panel>
  )
}

function BlockDiagram({ x, tokens, causal }: { x: Matrix; tokens: string[]; causal: boolean }) {
  const block = useMemo(() => {
    const heads = [toyHeadWeights(D, 2, 21), toyHeadWeights(D, 2, 22)]
    const rng = mulberry32(31)
    const wo = randomMatrix(D, D, rng, 0.5), w1 = randomMatrix(D, 8, rng, 0.5), w2 = randomMatrix(8, D, rng, 0.35)
    return transformerBlock(x, heads, wo, w1, w2, causal)
  }, [x, causal])
  const nodes: { id: string; title: string; term?: string; body: string; m: Matrix }[] = [
    { id: "ln1", title: "Layer norm", term: "layer-norm", body: "Each position's vector is rescaled to mean 0 and variance 1.", m: block.ln1 },
    { id: "mha", title: "Multi-head attention", term: "multi-head", body: "Two heads, masked as set above, mix information across positions.", m: block.attn.out },
    { id: "res1", title: "Add the input back (residual)", term: "residual", body: "x + attention(LN(x)): the original vector passes straight through.", m: block.afterAttn },
    { id: "ln2", title: "Layer norm", term: "layer-norm", body: "Rescale again before the feedforward layer.", m: block.ln2 },
    { id: "ffn", title: "Feedforward (4 → 8 → 4, ReLU)", term: "feedforward", body: "A small network applied to each position separately.", m: block.ffn },
    { id: "res2", title: "Add back again (residual)", term: "residual", body: "The block's output has the same shape as its input, so blocks can be stacked.", m: block.out },
  ]
  return (
    <Panel id="block" title="One transformer block" source={<Source kind="simulation" detail="toy weights" />}>
      <p className="mb-4 text-sm">A <Term id="transformer">transformer</Term> stacks this block many times. Open a step to see its numbers; every step keeps the shape {tokens.length} × {D} except inside the feedforward layer.</p>
      <ol className="flex flex-col gap-2">
        <li className="flex items-center gap-2 text-sm"><Tok>X</Tok><span className="num text-muted-foreground">{tokens.length} × {D}</span></li>
        {nodes.map((n) => (
          <li key={n.id}>
            <Collapsible className="rounded-md border border-border">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-raised">
                <span><span className="font-medium">{n.title}</span> <span className="text-muted-foreground">{n.body}</span></span>
                <NavArrowDownIcon className="size-4 flex-none text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <MatrixView name={n.title} m={n.m} rowLabels={tokens} />
                {n.term && <p className="mt-2 text-sm"><Term id={n.term}>More about this</Term></p>}
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
        <li className="text-sm text-muted-foreground">In a language model, the last block feeds a projection to vocabulary logits, then softmax.</li>
      </ol>
    </Panel>
  )
}

function AttentionExplain() {
  return (
    <Explain
      plain={
        <>
          <p>Your bigram engine sees one previous character. <Term id="attention">Attention</Term> lets every position look at all earlier positions and decide how much each one matters, with weights it computes from the data.</p>
          <p>Each position makes a query; every position offers a key and a value. Query-key matches become weights, and the weights mix the values.</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen>
        <div className="flex flex-col gap-2">
          <p>Attention(Q, K, V) = softmax(Q·Kᵀ / √dₖ + M) · V</p>
          <p>M is the mask: 0 where position j ≤ i, −∞ where j &gt; i. Shapes: Q, K, V are n × dₖ; Q·Kᵀ is n × n; the output is n × dₖ.</p>
        </div>
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <SimCode path="web/src/sim/attention.ts" symbol="attentionHead" text={attentionSource} />
          <SimCode path="web/src/sim/attention.ts" symbol="softmaxRow" text={attentionSource} />
        </div>
      </ExplainSection>
      <ExplainSection title="What attention weights don't tell you">
        <p>The weights show how one layer mixed values. A real model has many layers and heads, plus feedforward layers and residual paths, so reading one weight matrix is not an explanation of the model&apos;s reasoning. Here, with toy weights, patterns mean nothing at all.</p>
      </ExplainSection>
      <Note>Stage 3 of your roadmap builds a tiny causal transformer in PyTorch and tests this mask property on it.</Note>
      <EvidenceRecorder conceptId="attention" compact />
    </Explain>
  )
}
