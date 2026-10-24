import { useEffect, useMemo, useRef, useState } from "react"
import { PlayIcon, UndoIcon, XmarkIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, MatrixView, Tok, VectorView } from "@/components/lab/charts"
import { SimCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, Note, NumberField, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { TRAIN_LARGE, TRAIN_SMALL, VALIDATION } from "@/content/neuralTexts"
import { fmt } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { backward, countParams, forward, initParams, scalarDescent, sgdStep, zerosLike, type CurvePoint, type Params } from "@/sim/neural"
import neuralSource from "@/sim/neural.ts?raw"
import type { TrainMessage, TrainRequest } from "@/sim/train.worker"

export default function Neural() {
  return (
    <Workspace
      title="Neural network training"
      subtitle="A tiny network you can watch learn: every number is computed in your browser, by a simplified model, not your Python engine."
      explain={<NeuralExplain />}
    >
      <Note>Stage 2 of your roadmap builds this model in PyTorch. Until then, everything on this page is an interactive simulation, and its curves are not results from a model you trained.</Note>
      <ScalarDescent />
      <OneStep />
      <TrainingRun />
      <PythonAdapter />
    </Workspace>
  )
}

// ----------------------------------------------------------------------------- one number

function ScalarDescent() {
  const [start, setStart] = useState(-2)
  const [lr, setLr] = useState(0.1)
  const [steps, setSteps] = useState(20)
  const path = useMemo(() => scalarDescent(start, 3, lr, steps), [start, lr, steps])
  const last = path.at(-1)!
  const diverged = Math.abs(last.w - 3) > Math.abs(start - 3)
  return (
    <Panel id="scalar" title="First, gradient descent on one number" source={<Source kind="simulation" detail="f(w) = (w − 3)²" />}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-5">
          <p className="text-sm">The loss is f(w) = (w − 3)², smallest at w = 3. The <Term id="gradient">gradient</Term> is f′(w) = 2(w − 3). Each step moves w by −<Term id="learning-rate">learning rate</Term> × gradient.</p>
          <SliderField id="w0" label="Starting w" value={start} min={-6} max={10} step={0.5} onChange={setStart} format={(v) => v.toFixed(1)} />
          <SliderField id="lr0" label="Learning rate" value={lr} min={0.01} max={1.2} step={0.01} onChange={setLr} format={(v) => v.toFixed(2)} hint="Above 1.0 each step overshoots by more than it corrects." />
          <SliderField id="st0" label="Steps" value={steps} min={1} max={60} step={1} onChange={setSteps} />
          <p className={cn("text-sm", diverged && "text-negative")}>
            After {path.length - 1} steps: w = <span className="num">{Number.isFinite(last.w) ? last.w.toFixed(4) : "overflow"}</span>, loss = <span className="num">{Number.isFinite(last.loss) ? last.loss.toExponential(2) : "∞"}</span>. {diverged ? "It is moving away from 3: the steps are too big." : Math.abs(last.w - 3) < 1e-3 ? "It has reached the minimum." : "Still on its way."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <LineChart ariaLabel="w after each step" series={[{ name: "w", tone: "data", points: path.map((p) => ({ x: p.step, y: p.w })) }, { name: "target (3)", tone: "grey", dashed: true, points: path.map((p) => ({ x: p.step, y: 3 })) }]} xLabel="step" yLabel="w" height={180} yMin={Math.min(0, ...path.map((p) => p.w).filter(Number.isFinite))} />
          <table className="text-sm">
            <caption className="sr-only">The first steps of gradient descent</caption>
            <thead><tr className="text-[12px] text-muted-foreground"><th className="text-right font-normal">Step</th><th className="text-right font-normal">w</th><th className="text-right font-normal">gradient 2(w − 3)</th><th className="text-right font-normal">update −lr × grad</th></tr></thead>
            <tbody>
              {path.slice(0, 4).map((p) => (
                <tr key={p.step} className="border-t border-rule">
                  <td className="num text-right">{p.step}</td>
                  <td className="num text-right">{p.w.toFixed(3)}</td>
                  <td className="num text-right">{p.grad.toFixed(3)}</td>
                  <td className="num text-right">{(-lr * p.grad).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- one step, fully shown

const STEP_VOCAB = ["␣", "a", "i", "n", "r"]
const STEP_CONFIG = { vocabSize: 5, context: 2, embed: 2, hidden: 3 }

function OneStep() {
  const [seed, setSeed] = useState(3)
  const [c0, setC0] = useState(4)
  const [c1, setC1] = useState(1)
  const [target, setTarget] = useState(2)
  const [lr, setLr] = useState(0.5)
  const [params, setParams] = useState<Params>(() => initParams(STEP_CONFIG, 3))
  const [previous, setPrevious] = useState<Params | null>(null)
  const [losses, setLosses] = useState<number[]>([])
  const ex = { context: [c0, c1], target }
  const f = forward(params, ex)
  const grad = zerosLike(params)
  const b = backward(params, ex, f, grad)
  const labels = STEP_VOCAB.map((t, i) => <span key={i}>{i} <span className="tok">{t}</span></span>)

  function reset(s = seed) {
    setParams(initParams(STEP_CONFIG, s))
    setPrevious(null)
    setLosses([])
  }
  function apply() {
    setPrevious(params)
    setLosses([...losses, f.loss])
    setParams(sgdStep(params, grad, lr))
    if (losses.length === 0) actions.logRun({ route: "neural", title: "Applied one gradient step", summary: `loss ${f.loss.toFixed(3)} before`, source: "simulation" }, ["forward-pass", "cross-entropy", "backpropagation", "gradient"])
  }
  const pick = (value: number, set: (n: number) => void, label: string, id: string) => (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-sm font-medium">{label}</span>
      <Select value={String(value)} onValueChange={(v) => { set(Number(v)); setPrevious(null) }} items={STEP_VOCAB.map((t, i) => ({ value: String(i), label: `${t}  (ID ${i})` }))}>
        <SelectTrigger aria-labelledby={id} className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>{STEP_VOCAB.map((t, i) => <SelectItem key={i} value={String(i)}>{t} (ID {i})</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )

  return (
    <Panel id="onestep" title="One training step, every number" source={<Source kind="simulation" detail={`${countParams(STEP_CONFIG)} parameters, seed ${seed}`} />}
      aside={
        <div className="flex items-center gap-2">
          <Button onClick={apply}><PlayIcon className="size-4" /> Apply one update</Button>
          <Button variant="ghost" onClick={() => reset()}><UndoIcon className="size-4" /> Reset weights</Button>
        </div>
      }>
      <div className="flex flex-wrap items-end gap-4">
        {pick(c0, setC0, "Context token 1", "c0")}
        {pick(c1, setC1, "Context token 2", "c1")}
        {pick(target, setTarget, "Correct next token", "tg")}
        <NumberField id="ws" label="Weight seed" value={seed} min={0} max={9999} onChange={(v) => { setSeed(v); reset(v) }} />
        <div className="w-56"><SliderField id="lr1" label="Learning rate" value={lr} min={0.05} max={3} step={0.05} onChange={setLr} format={(v) => v.toFixed(2)} /></div>
      </div>
      <p className="mt-3 text-sm">Vocabulary: {STEP_VOCAB.map((t, i) => <span key={i} className="mr-2"><Tok>{t}</Tok> = {i}</span>)} The weights start as seeded random numbers; nothing has been learned yet.</p>

      <ol className="mt-6 flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">1. Look up <Term id="embedding">embeddings</Term> by <Term id="token-id">token ID</Term></h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="E, the embedding table" m={params.E} rowLabels={labels} highlightRows={[c0, c1]} before={previous?.E} caption="One row per token. Rows for the context are outlined." />
            <VectorView name="x = [E[ctx 1], E[ctx 2]]" v={f.x} caption={`Two rows of 2 numbers, joined: shape ${STEP_CONFIG.context} × ${STEP_CONFIG.embed} → ${f.x.length}.`} />
          </div>
        </li>
        <li className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">2. <Term id="forward-pass">Forward pass</Term> through the hidden layer</h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="W1" m={params.W1} before={previous?.W1} caption="4 inputs × 3 hidden units" />
            <VectorView name="x·W1 + b1" v={f.pre} />
            <VectorView name="h = tanh(x·W1 + b1)" v={f.h} caption="tanh squashes each value into (−1, 1)." />
          </div>
        </li>
        <li className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">3. <Term id="logits">Logits</Term>, <Term id="softmax">softmax</Term> and <Term id="cross-entropy">loss</Term></h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="W2" m={params.W2} before={previous?.W2} colLabels={STEP_VOCAB} caption="3 hidden units × 5 tokens" />
            <VectorView name="logits = h·W2 + b2" v={f.logits} labels={STEP_VOCAB} />
            <VectorView name="p = softmax(logits)" v={f.probs} labels={STEP_VOCAB} digits={3} highlight={[target]} caption={`Sums to ${f.probs.reduce((a, b2) => a + b2, 0).toFixed(3)}.`} />
          </div>
          <p className="text-sm">The correct token is <Tok tone="chosen">{STEP_VOCAB[target]}</Tok> with p = <span className="num">{f.probs[target].toFixed(4)}</span>, so the loss is −log({f.probs[target].toFixed(4)}) = <span className="num font-semibold">{f.loss.toFixed(4)}</span>.</p>
        </li>
        <li className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">4. <Term id="backpropagation">Backpropagation</Term>: gradients</h3>
          <div className="flex flex-wrap items-start gap-6">
            <VectorView name="∂L/∂logits = p − y" v={b.dLogits} labels={STEP_VOCAB} digits={3} caption="y is 1 for the correct token, 0 elsewhere. Negative means: raise this logit." />
            <MatrixView name="∂L/∂W2 = hᵀ · (p − y)" m={grad.W2} colLabels={STEP_VOCAB} digits={3} />
            <VectorView name="∂L/∂h" v={b.dH} digits={3} />
            <VectorView name="∂L/∂x" v={b.dX} digits={3} caption="Split back into the two context rows of E." />
          </div>
        </li>
        <li className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">5. Update: every parameter moves by −{lr.toFixed(2)} × its gradient</h3>
          {losses.length === 0 ? (
            <EmptyNote>Press Apply one update. Changed cells turn bold above, and the loss for this example is recomputed.</EmptyNote>
          ) : (
            <p className="text-sm">
              Loss for this example after each update: {[...losses, f.loss].map((l, i) => <span key={i} className="num mr-2">{i > 0 && "→ "}{l.toFixed(4)}</span>)}
              {f.loss < losses[losses.length - 1] ? " It went down: the step moved the weights downhill for this example." : " It went up: the learning rate is too large for this step."}
            </p>
          )}
        </li>
      </ol>
      <p className="mt-4 text-[13px] text-muted-foreground">Shapes, end to end: IDs (2) → E rows (2 × 2) → x (4) → h (3) → logits (5) → p (5) → loss (1 number). Every token ID is used only to pick rows; the arithmetic is all matrix multiplication.</p>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- training run in a worker

interface RunResult {
  label: string
  settings: string
  curve: CurvePoint[]
  meta?: { vocabSize: number; trainPairs: number; valPairs: number; params: number }
  ms?: number
}

function TrainingRun() {
  const [text, setText] = useState<"small" | "large">("small")
  const [hidden, setHidden] = useState(16)
  const [lr, setLr] = useState(0.1)
  const [steps, setSteps] = useState(1000)
  const [batch, setBatch] = useState(1000)
  const [seed, setSeed] = useState(1)
  const [run, setRun] = useState<RunResult | null>(null)
  const [previous, setPrevious] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])

  const settingsLabel = `${text === "small" ? "small" : "larger"} text, hidden ${hidden}, lr ${lr}, ${steps} steps, batch ${batch >= 1000 ? "all" : batch}, seed ${seed}`

  function start() {
    worker.current?.terminate()
    if (run?.curve.length) setPrevious(run)
    setError(null)
    setRunning(true)
    const w = new Worker(new URL("../sim/train.worker.ts", import.meta.url), { type: "module" })
    worker.current = w
    const current: RunResult = { label: settingsLabel, settings: settingsLabel, curve: [] }
    setRun({ ...current })
    w.onmessage = (e: MessageEvent<TrainMessage>) => {
      const m = e.data
      if (m.type === "start") current.meta = { vocabSize: m.vocabSize, trainPairs: m.trainPairs, valPairs: m.valPairs, params: m.params }
      if (m.type === "point") current.curve = [...current.curve, m.point]
      if (m.type === "done") {
        current.ms = m.ms
        setRunning(false)
        w.terminate()
        actions.logRun({ route: "neural", title: "Training run", summary: settingsLabel, source: "simulation" }, ["overfitting", "batch", "epoch", "learning-rate"])
      }
      if (m.type === "error") { setError(m.message); setRunning(false); w.terminate() }
      setRun({ ...current })
    }
    w.onerror = (e) => { setError(e.message || "The training worker failed to start."); setRunning(false) }
    const req: TrainRequest = { trainText: text === "small" ? TRAIN_SMALL : TRAIN_LARGE, valText: VALIDATION, vocabFrom: TRAIN_LARGE + VALIDATION, settings: { context: 3, embed: 8, hidden, lr, steps, batchSize: batch, seed, evalEvery: Math.max(5, Math.round(steps / 60)) } }
    w.postMessage(req)
  }

  function cancel() {
    worker.current?.terminate()
    setRunning(false)
  }

  const curve = run?.curve ?? []
  const best = curve.length ? curve.reduce((m, p) => (p.val < m.val ? p : m)) : null
  const last = curve.at(-1)
  const uniform = run?.meta ? Math.log(run.meta.vocabSize) : null
  const overfit = !running && best && last && last.step > best.step && last.val > best.val + 0.1
  const series = [
    { name: "training loss", tone: "ink" as const, points: curve.map((p) => ({ x: p.step, y: p.train })) },
    { name: "validation loss", tone: "data" as const, points: curve.map((p) => ({ x: p.step, y: p.val })) },
    ...(previous ? [{ name: `validation, previous run`, tone: "grey" as const, dashed: true, points: previous.curve.map((p) => ({ x: p.step, y: p.val })) }] : []),
  ]

  return (
    <>
      <Panel id="train" title="A training run, and overfitting" source={<Source kind="simulation" detail="computed in a background worker" />}
        aside={running ? <Button variant="outline" onClick={cancel}><XmarkIcon className="size-4" /> Cancel</Button> : <Button onClick={start}><PlayIcon className="size-4" /> Train</Button>}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Training text</span>
              <Segmented label="Training text" value={text} onChange={setText} options={[{ value: "small", label: `Small (${TRAIN_SMALL.length} chars)` }, { value: "large", label: `Larger (${TRAIN_LARGE.length} chars)` }]} />
              <p className="text-[13px] text-muted-foreground">Validation is always the same separate text ({VALIDATION.length} chars), never trained on.</p>
            </div>
            <SliderField id="hid" label="Hidden units" value={hidden} min={4} max={64} step={4} onChange={setHidden} />
            <SliderField id="lr2" label="Learning rate" value={lr} min={0.01} max={1} step={0.01} onChange={setLr} format={(v) => v.toFixed(2)} />
            <SliderField id="steps" label="Steps (updates)" value={steps} min={50} max={3000} step={50} onChange={setSteps} />
            <SliderField id="batch" label={<Term id="batch">Batch size</Term>} value={batch} min={8} max={1000} step={8} onChange={setBatch} format={(v) => (v >= 1000 ? "all pairs" : String(v))} hint="Smaller batches are sampled at random each step." />
            <NumberField id="tseed" label="Seed" value={seed} min={0} max={9999} onChange={setSeed} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {error && <ErrorNote error={new Error(error)} />}
            {curve.length === 0 ? (
              <EmptyNote>Press Train. The curves are computed as the run goes; training takes a few seconds and can be cancelled.</EmptyNote>
            ) : (
              <LineChart ariaLabel="Training and validation loss over steps" series={series} xLabel="step" yLabel="loss (nats)" height={240} yMin={0} markers={best && !running ? [{ x: best.step, label: `lowest validation, step ${best.step}` }] : []} />
            )}
            {run?.meta && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div><dt className="text-[13px] text-muted-foreground">Parameters</dt><dd className="num">{fmt.n(run.meta.params)}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Training pairs</dt><dd className="num">{run.meta.trainPairs}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Validation pairs</dt><dd className="num">{run.meta.valPairs}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Uniform-guess loss</dt><dd className="num">{uniform?.toFixed(3)}</dd></div>
              </dl>
            )}
            {last && !running && best && (
              <p className="text-sm">
                Final training loss <span className="num">{last.train.toFixed(3)}</span>, validation <span className="num">{last.val.toFixed(3)}</span>. Validation was lowest at step {best.step} (<span className="num">{best.val.toFixed(3)}</span>).{" "}
                {overfit ? <strong>After that it rose while training loss kept falling: overfitting.</strong> : "It did not rise noticeably after its lowest point."}
                {run?.ms !== undefined && <span className="text-muted-foreground"> Took {(run.ms / 1000).toFixed(1)} s in your browser.</span>}
              </p>
            )}
          </div>
        </div>
      </Panel>
      <GuidedCycle
        id="neural"
        conceptId="overfitting"
        route="neural"
        question="Train on the small text, then on the larger one with everything else the same. Which ends with the lower validation loss?"
        choices={[{ id: "small", label: "The small text" }, { id: "large", label: "The larger text" }, { id: "same", label: "About the same" }]}
        correct={textComparison(previous, run, running)?.answer}
        observation={previous && run && !running && previous.curve.length && run.curve.length ? (
          <>Previous run ({previous.settings}): final validation {previous.curve.at(-1)!.val.toFixed(3)}. This run ({run.settings}): {run.curve.at(-1)!.val.toFixed(3)}.{previous.settings.replace(/^(small|larger)/, "") !== run.settings.replace(/^(small|larger)/, "") && " More than the training text changed between these runs, so they are not a clean comparison."}</>
        ) : undefined}
        explainPrompt="Why can training loss keep falling while validation loss rises?"
        change="Keep the small text and halve the hidden units. Does the gap between the curves shrink?"
        hints={["Training loss only measures the text the weights were fitted to.", "With 91 training pairs and over a thousand parameters, the network can memorise."]}
      />
      <Panel id="limits" title="What these curves do and don't show">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>They show this toy network, on these few hundred characters, with this seed. Another seed gives somewhat different curves.</li>
          <li>Rising validation loss shows the network fitting quirks of its training text. It does not show how a large model behaves.</li>
          <li>The lowest validation point suggests where to stop (early stopping), but choosing it with the validation text means the validation score is no longer an unbiased estimate; a separate test text is needed for that.</li>
        </ul>
      </Panel>
    </>
  )
}

/** When two finished runs differ only in their training text, say which ended lower on validation. */
function textComparison(a: RunResult | null, b: RunResult | null, running: boolean) {
  if (!a || !b || running || !a.curve.length || !b.curve.length) return null
  const rest = (s: string) => s.replace(/^(small|larger)/, "")
  if (rest(a.settings) !== rest(b.settings) || a.settings.startsWith("small") === b.settings.startsWith("small")) return null
  const small = (a.settings.startsWith("small") ? a : b).curve.at(-1)!.val
  const large = (a.settings.startsWith("small") ? b : a).curve.at(-1)!.val
  return { answer: Math.abs(small - large) < 0.05 ? "same" : small < large ? "small" : "large" }
}

// ----------------------------------------------------------------------------- future engine adapter

function PythonAdapter() {
  return (
    <Panel id="adapter" title="Your Python neural engine" source={<Source kind="model" detail="not built yet" />}>
      <p className="text-sm">When you build the Stage 2 PyTorch model, its training log will appear here next to the simulation, in the same chart. The Lab expects the backend to answer <code className="tok rounded bg-secondary px-1">GET /api/neural/runs</code> with a list of runs:</p>
      <pre className="tok mt-3 overflow-x-auto rounded-md bg-raised p-3 text-[12.5px] leading-relaxed">{`[{ "engine": "char-mlp", "modelVersion": "char-mlp@…",
   "settings": { "context": 3, "embed": 8, "hidden": 64, "lr": 0.1 },
   "curve": [{ "step": 0, "train": 3.3, "val": 3.3 }, …] }]`}</pre>
      <p className="mt-3 text-[13px] text-muted-foreground">The curve shape is the same CurvePoint type the simulation uses (web/src/sim/neural.ts), so nothing in this page needs rebuilding.</p>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- explanation

function NeuralExplain() {
  return (
    <Explain
      plain={
        <>
          <p>Instead of counting, a neural network holds <Term id="parameter">parameters</Term>: numbers it adjusts. It turns token IDs into <Term id="embedding">embeddings</Term>, mixes them, and scores every possible next token.</p>
          <p>Training repeats three steps: predict (forward pass), measure the miss (<Term id="cross-entropy">loss</Term>), and nudge every parameter downhill (<Term id="gradient">gradients</Term> and an update).</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen>
        <div className="flex flex-col gap-2">
          <p>Forward: x = [E[c₁], E[c₂]], h = tanh(x·W1 + b1), z = h·W2 + b2, p = softmax(z), L = −log p[target].</p>
          <p>Backward: ∂L/∂z = p − y. Then ∂L/∂W2 = hᵀ(p − y), ∂L/∂h = (p − y)W2ᵀ, ∂L/∂(x·W1 + b1) = ∂L/∂h ⊙ (1 − h²), and so on back to E.</p>
          <p>Update (plain <Term id="optimizer">SGD</Term>): θ ← θ − η ∂L/∂θ for every parameter θ.</p>
          <p>The gradients are checked against finite differences in <code className="tok">neural.test.ts</code>.</p>
        </div>
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <SimCode path="web/src/sim/neural.ts" symbol="forward" text={neuralSource} />
          <SimCode path="web/src/sim/neural.ts" symbol="backward" text={neuralSource} />
          <SimCode path="web/src/sim/neural.ts" symbol="sgdStep" text={neuralSource} />
        </div>
      </ExplainSection>
      <ExplainSection title="Batches and epochs here">
        <p>An <Term id="epoch">epoch</Term> is one pass over all training pairs. With batch size “all pairs”, every step is one epoch. With a smaller batch, each step samples that many pairs at random (with replacement), so epochs are only approximate.</p>
      </ExplainSection>
      <EvidenceRecorder conceptId="backpropagation" compact />
    </Explain>
  )
}
