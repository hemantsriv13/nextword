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
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { attentionHead, inputMatrix, multiHead, shape, toyHeadWeights, transformerBlock, type Matrix } from "@/sim/attention"
import attentionSource from "@/sim/attention.ts?raw"
import { mulberry32, randomMatrix } from "@/sim/rng"

const D = 4

const GUIDE: Guide = {
  question: "How does one position in a sequence build its new vector from the other positions, and why must it not see the future?",
  scope: "An interactive simulation with made-up toy numbers: the vectors and weights are seeded random values, not learned, and your bigram engine has no attention. The arithmetic is the real attention computation, at a size where every number fits on screen.",
  sources: ["simulation"],
  nodes: [
    { id: "x", label: "Token vectors + positions", kind: "input", target: "inputs", carries: "X, n × 4",
      goesIn: "The tokens you typed, as toy embedding rows, plus a position vector for each place.",
      happens: "Each token's vector and its position's vector are added.",
      why: "Without positions, the same word in two places would look identical.",
      comesOut: "X: one row of 4 numbers per position.",
      next: "Three projections of X give queries, keys and values." },
    { id: "qkv", label: "Queries, keys, values", kind: "operation", target: "qkv", tab: "one", carries: "Q, K, V",
      goesIn: "X and three weight matrices W_Q, W_K, W_V (each 4 × dₖ).",
      happens: "X is multiplied by each of them.",
      why: "A query is what a position looks for, a key is what a position offers to be matched on, a value is what it passes on if chosen. Keeping them separate lets matching and passing on differ.",
      comesOut: "Three matrices, one row per position.",
      next: "Each query is compared with every key." },
    { id: "scores", label: "Scores and scaling", kind: "operation", target: "scores", tab: "one", carries: "scores, n × n",
      goesIn: "Q and K.",
      happens: "Q·Kᵀ: the dot product of each query row with each key row, then divided by √dₖ.",
      why: "A dot product is large when two vectors point the same way, so it measures match. Dividing by √dₖ keeps the scores from growing with the vector size.",
      comesOut: "A score for every (query, key) pair.",
      next: "The causal mask removes future positions." },
    { id: "mask", label: "Causal mask", kind: "operation", target: "scores", tab: "one", carries: "allowed scores",
      goesIn: "The scaled scores.",
      happens: "Every score for a later position is set to −∞.",
      why: "In next-token training, position i must predict token i + 1. If it could read later positions, it could copy the answer instead of learning to predict it.",
      comesOut: "Scores where only the past and the present remain.",
      next: "Softmax turns each row into weights.",
      tryIt: "Turn the mask off and watch the upper-right cells fill in." },
    { id: "weights", label: "Normalized weights", kind: "operation", target: "scores", tab: "one", carries: "weights, n × n",
      goesIn: "The masked scores.",
      happens: "Softmax along each row: e to the power of each score, divided by the row's sum. −∞ becomes exactly 0.",
      why: "Weights that are positive and sum to one say how much of each value to take.",
      comesOut: "The attention weights: each row adds up to 1.",
      next: "They weight the value rows." },
    { id: "out", label: "Weighted values", kind: "output", target: "out", tab: "one",
      goesIn: "The weights and V.",
      happens: "For each position, the value rows are added up, each multiplied by its weight.",
      why: "This is how information moves between positions: a position's new vector is a blend of the values it attended to.",
      comesOut: "One new vector per position.",
      next: "In a transformer block it is added back to X and passed through a feed-forward layer (shown at the bottom)." },
  ],
  tour: [
    { target: "seq", title: "Pick a position to follow", plain: <><p>Every view below can follow one position: the query. It is the position whose new vector is being built. Position 3 is selected to start; pick any other.</p><p>The highlighted positions are the ones it may look at. With the causal mask on, that is itself and everything before it.</p></>,
      terms: [{ id: "attention", role: "how a position takes information from others." }] },
    { target: "inputs", title: "Vectors in, one row per position", plain: <><p>Each token starts as a row of 4 toy numbers, and a position vector is added so that order is visible. The result X has one row per position: shape n × 4.</p></>,
      terms: [{ id: "positional-encoding", role: "the P matrix added to E." }, { id: "embedding", role: "the toy row for each token." }] },
    { target: "qkv", tab: "one", title: "Three views of each position", plain: <><p>Q, K and V are X multiplied by three different weight matrices. They hold the same information, re-arranged three ways: what a position looks for (query), what it can be found by (key), and what it hands over (value).</p></>,
      terms: [{ id: "qkv", role: "three projections of X." }] },
    { target: "scores", tab: "one", title: "Match, scale, mask, normalize", plain: <><p>The selected query is compared with every key by a dot product: a bigger number means a better match. The scores are divided by √dₖ, future positions are set to −∞, and softmax turns each row into weights that add up to 1.</p><p>The breakdown under the matrices shows these numbers for the selected position only.</p></>,
      terms: [{ id: "causal-mask", role: "blocks every later position." }, { id: "softmax", role: "row of scores to row of weights." }] },
    { target: "out", tab: "one", title: "The new vector is a weighted blend", plain: <><p>The selected position's output is each value row multiplied by its weight, all added up. That is the only way information moves from one position to another here.</p><p>These weights show where the numbers came from in this one toy layer. They are not an explanation of a model's reasoning.</p></> },
    { target: "check", title: "Proof that the future can't leak", plain: <><p>Change the last token and watch which output rows change. With the mask on, earlier positions' outputs stay identical, because they never read the last position.</p></> },
  ],
}

export default function Attention() {
  const [text, setText] = useState("the cat sat on the mat")
  const [causal, setCausal] = useState(true)
  const [positions, setPositions] = useState(true)
  const [heads, setHeads] = useState<"one" | "two">("one")
  const [query, setQuery] = useState<number | null>(2)
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
    <Teach guide={GUIDE} onStep={(where) => where.tab === "one" && setHeads("one")}>
    <Workspace
      title="Attention explorer"
      subtitle="How each position builds its new vector from the others. The arithmetic is real; the vectors and weights are made-up toy numbers, not learned."
      explain={<AttentionExplain />}
    >
      <WorkspaceGuide />
      <Panel id="seq" title="Sequence" source={<Source kind="simulation" detail="toy, seeded random weights" />}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="seq-in" className="text-sm font-medium">Tokens, separated by spaces (2 to 8)</label>
            <input id="seq-in" data-help-id="attention.tokens" value={text} onChange={(e) => { setText(e.target.value); setQuery(null) }} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="flex items-center gap-2 text-sm" data-help-id="attention.mask"><Switch checked={causal} onCheckedChange={(v) => { setCausal(v); actions.logRun({ route: "attention", title: `Causal mask ${v ? "on" : "off"}`, summary: tokens.join(" "), source: "simulation" }, ["causal-mask"]) }} aria-label="Causal mask" /> <Term id="causal-mask">Causal mask</Term></label>
            <label className="flex items-center gap-2 text-sm" data-help-id="attention.positions"><Switch checked={positions} onCheckedChange={setPositions} aria-label="Add positional information" /> <Term id="positional-encoding">Positional information</Term></label>
            <Segmented label="Heads" helpId="attention.heads" value={heads} onChange={setHeads} options={[{ value: "one", label: "One head, dₖ = 4" }, { value: "two", label: "Two heads, dₖ = 2" }]} />
          </div>
          {!valid ? <EmptyNote>Type at least two tokens.</EmptyNote> : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Pick a position to see what it can attend to:</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a query position">
                {tokens.map((t, i) => {
                  const allowed = q !== null && (!causal || i <= q)
                  return (
                    <button key={i} type="button" data-help-id="attention.query" onClick={() => { setQuery(i); actions.logRun({ route: "attention", title: `Inspected position ${i + 1}`, summary: `${causal ? "masked" : "unmasked"}`, source: "simulation" }, ["attention", "qkv"]) }} aria-pressed={q === i}
                      className={cn("tok flex flex-col items-center rounded-md border px-3 py-1.5 text-sm", q === i ? "border-foreground bg-primary text-primary-foreground" : allowed ? "border-data bg-data-soft" : q !== null ? "border-dashed border-border text-muted-foreground" : "border-border hover:bg-raised")}>
                      <span>{t}</span>
                      <span className="num text-[11px] opacity-80">pos {i + 1}</span>
                    </button>
                  )
                })}
              </div>
              {q !== null && <p className="text-sm">Position {q + 1} (“{tokens[q]}”) can attend to {causal ? `positions 1–${q + 1}` : "every position"}{causal && q < tokens.length - 1 ? `; positions ${q + 2}–${tokens.length} are masked out.` : "."}</p>}
              {q !== null && !causal && q < tokens.length - 1 && model && (
                <Note tone="warning">
                  With the mask off, position {q + 1} can read the future: {tokens.slice(q + 1).map((t, k) => `“${t}” (position ${q + 2 + k}, weight ${model.single.weights[q][q + 1 + k].toFixed(2)})`).join(", ")}.
                  In next-token training, position {q + 1} has to predict “{tokens[q + 1]}”, which it can now read directly, so it could copy the answer instead of learning to predict it. At prediction time the future doesn&apos;t exist yet, so a model trained like this would fail.
                </Note>
              )}
            </div>
          )}
        </div>
      </Panel>

      {model && (
        <>
          <Panel id="inputs" title="Step 1: token vectors plus positions" source={<Source kind="simulation" />}
            teach={{
              calc: <Symbols rows={[
                ["n", "positions (tokens)", String(tokens.length)],
                ["d", "numbers per vector", String(D)],
                ...(q !== null ? [
                  [`E[${q + 1}]`, `toy embedding of “${tokens[q]}”`, model.input.embeddings[q].map((v) => v.toFixed(2)).join(", ")],
                  [`P[${q + 1}]`, `position ${q + 1}'s vector`, model.input.positions[q].map((v) => v.toFixed(2)).join(", ")],
                  [`X[${q + 1}]`, "their sum, element by element", model.input.x[q].map((v) => v.toFixed(2)).join(", ")],
                ] as [string, string, string][] : []),
              ]} />,
              code: <SimCode path="web/src/sim/attention.ts" symbol="inputMatrix" text={attentionSource} />,
            }}>
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
    </Teach>
  )
}

function WeightsGrid({ tokens, weights, masked, q }: { tokens: string[]; weights: Matrix; masked: Matrix; q: number | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-label">
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

/** The selected query's row, number by number: score, scaling, mask and weight for every key. */
function QueryRow({ tokens, r, q, dk }: { tokens: string[]; r: ReturnType<typeof attentionHead>; q: number; dk: number }) {
  return (
    <div className="mt-5 overflow-x-auto" data-testid="query-row">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="mb-1 text-left text-sm"><span className="font-medium">Row for position {q + 1} (“{tokens[q]}”)</span> <span className="text-muted-foreground">one line per key position</span></caption>
        <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Key</th><th scope="col" className="text-right font-normal">Q·K score</th><th scope="col" className="text-right font-normal">÷ √{dk}</th><th scope="col" className="pl-4 font-normal">Allowed?</th><th scope="col" className="text-right font-normal">Weight</th></tr></thead>
        <tbody>
          {tokens.map((t, j) => {
            const masked = r.masked[q][j] === -Infinity
            return (
              <tr key={j} className={cn("border-t border-rule", masked && "text-muted-foreground")}>
                <th scope="row" className="py-1 text-left font-normal"><span className="tok">{t}</span> <span className="num text-label text-muted-foreground">pos {j + 1}</span></th>
                <td className="num text-right">{r.scores[q][j].toFixed(3)}</td>
                <td className="num text-right">{r.scaled[q][j].toFixed(3)}</td>
                <td className="pl-4">{masked ? "no: future position, set to −∞" : j === q ? "yes: itself" : "yes: earlier position"}</td>
                <td className="num text-right font-medium">{r.weights[q][j].toFixed(3)}</td>
              </tr>
            )
          })}
          <tr className="border-t border-border"><th scope="row" className="py-1 text-left font-normal">Sum of weights</th><td /><td /><td /><td className="num text-right font-medium">{r.weights[q].reduce((a, b) => a + b, 0).toFixed(3)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function SingleHead({ tokens, r, q, causal }: { tokens: string[]; r: ReturnType<typeof attentionHead>; q: number | null; causal: boolean }) {
  const dk = shape(r.q)[1]
  return (
    <>
      <Panel id="qkv" title="Step 2: queries, keys and values" source={<Source kind="simulation" />}
        teach={{
          calc: q !== null ? <Symbols rows={[
            [`Q[${q + 1}]`, `what “${tokens[q]}” looks for: its row of X times W_Q`, r.q[q].map((v) => v.toFixed(2)).join(", ")],
            [`K[${q + 1}]`, "what it can be matched on", r.k[q].map((v) => v.toFixed(2)).join(", ")],
            [`V[${q + 1}]`, "what it passes on when attended to", r.v[q].map((v) => v.toFixed(2)).join(", ")],
            ["shapes", `X is ${tokens.length} × ${D}; each W is ${D} × ${dk}; Q, K, V are ${tokens.length} × ${dk}`, undefined],
          ]} /> : <p>Pick a position to see its query, key and value.</p>,
          code: <SimCode path="web/src/sim/attention.ts" symbol="attentionHead" text={attentionSource} />,
        }}>
        <p className="mb-4 text-sm">Q = X·W<sub>Q</sub>, K = X·W<sub>K</sub>, V = X·W<sub>V</sub>, each W of shape {D} × {dk}. A query asks “what am I looking for?”, a key says “what I contain”, a value is “what I pass on”. Concretely they are just three different linear projections of X.</p>
        <div className="flex flex-wrap items-start gap-6">
          <MatrixView name="Q" m={r.q} rowLabels={tokens} highlightRows={q !== null ? [q] : undefined} />
          <MatrixView name="K" m={r.k} rowLabels={tokens} />
          <MatrixView name="V" m={r.v} rowLabels={tokens} />
        </div>
      </Panel>
      <Panel id="scores" variant="canvas" title="Step 3: scores, scaling, mask, softmax" source={<Source kind="simulation" />}
        teach={{
          calc: q !== null ? <><p>For query position {q + 1}, each key j gives: score = Q[{q + 1}]·K[j], then ÷ √{dk} = ÷ {Math.sqrt(dk).toFixed(2)}, then −∞ if j is in the future, then softmax over the row. The breakdown table under the matrices lists every number.</p>
            <p>weight[j] = e^(scaled[j]) ÷ Σ e^(scaled[allowed]). Masked positions contribute e^(−∞) = 0 to both the top and the sum.</p></> : <p>Pick a position to see its row.</p>,
          code: <SimCode path="web/src/sim/attention.ts" symbol="attentionHead" text={attentionSource} />,
        }}>
        <div className="flex flex-wrap items-start gap-6">
          <MatrixView name="Q·Kᵀ" m={r.scores} rowLabels={tokens} colLabels={tokens} highlightRows={q !== null ? [q] : undefined} caption={`(${tokens.length} × ${dk}) · (${dk} × ${tokens.length})`} />
          <MatrixView name={`÷ √${dk} = ÷ ${Math.sqrt(dk).toFixed(2)}`} m={r.scaled} rowLabels={tokens} colLabels={tokens} />
          <MatrixView name={causal ? "masked: future → −∞" : "no mask"} m={r.masked} rowLabels={tokens} colLabels={tokens} mask={r.masked.map((row) => row.map((v) => v === -Infinity))} />
        </div>
        <div className="mt-6"><WeightsGrid tokens={tokens} weights={r.weights} masked={r.masked} q={q} /></div>
        {q !== null && <QueryRow tokens={tokens} r={r} q={q} dk={dk} />}
        <p className="mt-3 text-sm">Softmax runs along each row over the allowed positions only, so every row sums to 1. Scaling by √dₖ keeps scores from growing with the vector size, which would make softmax too peaked.</p>
      </Panel>
      <Panel id="out" title="Step 4: weighted sum of values" source={<Source kind="simulation" />}
        teach={{
          calc: q !== null ? <Symbols rows={[
            ...r.weights[q].map((w, j) => [`${w.toFixed(3)} × V[${j + 1}]`, `“${tokens[j]}”${w === 0 ? " (masked, adds nothing)" : ""}`, r.v[j].map((v) => (w * v).toFixed(3)).join(", ")] as [string, string, string]),
            [`out[${q + 1}]`, "the sum of the rows above", r.out[q].map((v) => v.toFixed(3)).join(", ")],
          ]} /> : <p>Pick a position to see its weighted sum.</p>,
          code: <SimCode path="web/src/sim/attention.ts" symbol="attentionHead" text={attentionSource} />,
        }}>
        {q === null ? <EmptyNote>Pick a position above to see its weighted sum.</EmptyNote> : (
          <div className="flex flex-col gap-3 text-sm">
            <p>Output for position {q + 1} = Σⱼ weight[{q + 1}, j] × V[j]:</p>
            <ul className="tok flex flex-col gap-1 text-label">
              {r.weights[q].map((w, j) => w > 0 && (
                <li key={j}>{w.toFixed(3)} × [{r.v[j].map((v) => v.toFixed(2)).join(", ")}] <span className="text-muted-foreground">({tokens[j]})</span></li>
              ))}
            </ul>
            <p>= <span className="tok">[{r.out[q].map((v) => v.toFixed(3)).join(", ")}]</span>, a new vector of {dk} numbers for position {q + 1}.</p>
            <p className="text-label text-muted-foreground">The weights show which values were mixed into this vector, in this toy layer. They are not a full account of why a real model produces an answer: real models stack many layers and heads, and the values themselves carry information.</p>
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
      <p className="mt-3 text-label text-muted-foreground">Different heads can spread weight differently. With toy weights, any “meaning” you see in a pattern is coincidence.</p>
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
          <input id="repl" data-help-id="attention.check" value={replacement} onChange={(e) => setReplacement(e.target.value.trim())} className="tok h-9 w-40 rounded-md border border-input bg-card px-3 text-sm" />
        </div>
      </div>
      <table className="mt-4 text-sm">
        <caption className="sr-only">Largest change in earlier outputs</caption>
        <thead><tr className="text-label text-muted-foreground"><th className="text-left font-normal">Mask</th><th className="px-4 text-right font-normal">Largest change in outputs 1–{tokens.length - 1}</th><th className="text-left font-normal">Verdict</th></tr></thead>
        <tbody>
          <tr className="border-t border-rule"><td className="py-1.5">On</td><td className="num px-4 text-right">{masked.toExponential(1)}</td><td className={masked < 1e-12 ? "text-positive" : "text-negative"}>{masked < 1e-12 ? "Earlier positions are unaffected" : "Leak"}</td></tr>
          <tr className="border-t border-rule"><td className="py-1.5">Off</td><td className="num px-4 text-right">{unmasked.toFixed(4)}</td><td>{unmasked > 1e-12 ? "Earlier positions changed: the future leaked in" : "No change"}</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-label text-muted-foreground">The same property is checked by an automated test in attention.test.ts.</p>
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
