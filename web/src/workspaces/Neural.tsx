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
import { MathHelp, TermHelp } from "@/components/lab/term-help"
import { Symbols, Teach, TeachSpot, WorkspaceGuide, type FlowNode, type Guide } from "@/components/lab/teach"
import { TRAIN_LARGE, TRAIN_SMALL, VALIDATION } from "@/content/neuralTexts"
import { fmt } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { backward, countParams, forward, initParams, scalarDescent, sgdStep, zerosLike, type CurvePoint, type Params } from "@/sim/neural"
import neuralSource from "@/sim/neural.ts?raw"
import type { TrainMessage, TrainRequest } from "@/sim/train.worker"
import { InfoTip } from "@/components/lab/info-tip"

const node = (id: string, label: string, kind: FlowNode["kind"], target: string, carries: string | undefined, d: Omit<FlowNode, "id" | "label" | "kind" | "target" | "carries">): FlowNode => ({ id, label, kind, target, carries, ...d })

const GUIDE: Guide = {
  question: "How does a neural network turn context IDs into a prediction, and how does one training step change it?",
  scope: "Everything on this page is an interactive simulation in your browser, not your Python engine. It shows the computation a Stage 2 model will do, on a five-character vocabulary small enough to print every number. Your bigram engine does not use any of it.",
  sources: ["simulation"],
  nodes: [
    node("ids", "Context IDs", "input", "onestep", "2 IDs", { goesIn: "Two context tokens, picked in the panel, as their ID numbers.", happens: "Nothing yet; IDs are only labels.", why: "An ID says which row of the embedding table to use. It is not an amount.", comesOut: "Two whole numbers between 0 and 4.", next: "Each ID selects one row of E." }),
    node("embed", "Embedding lookup", "operation", "ns-embed", "2 rows of E", { goesIn: "The IDs and the embedding table E (5 rows × 2 columns: one row per token, two learned numbers each).", happens: "Row c₁ and row c₂ of E are copied out.", why: "This replaces a label with numbers the network can compute with and adjust.", comesOut: "Two vectors of 2 numbers.", next: "They are joined into one input vector.", tryIt: "Change Context token 1 and watch which row of E is outlined." }),
    node("x", "Combined input", "operation", "ns-embed", "x, 4 numbers", { goesIn: "The two embedding rows.", happens: "They are placed side by side.", why: "The hidden layer takes one vector; joining keeps the order of the context.", comesOut: "x, a vector of 4 numbers.", next: "x is multiplied by W1." }),
    node("hidden", "Hidden computation", "operation", "ns-hidden", "h, 3 numbers", { goesIn: "x and the parameters W1 (4 × 3) and b1 (3).", happens: "x·W1 + b1, then tanh squashes each of the 3 results into (−1, 1).", why: "The hidden layer mixes the context characters; tanh lets the network represent more than straight-line combinations.", comesOut: "h, 3 numbers.", next: "h is multiplied by W2." }),
    node("logits", "Logits", "operation", "ns-logits", "5 scores", { goesIn: "h and W2 (3 × 5), b2 (5).", happens: "h·W2 + b2 gives one score per vocabulary token.", why: "Each token needs a score to be compared with the others.", comesOut: "Logits: 5 unbounded scores. Bigger means more likely, but they are not probabilities.", next: "Softmax turns them into probabilities." }),
    node("probs", "Probabilities", "operation", "ns-logits", "5 probabilities", { goesIn: "The 5 logits.", happens: "Softmax: e to the power of each score, divided by the sum of those.", why: "Probabilities are positive and add up to one, so they can be sampled from and scored.", comesOut: "p, 5 probabilities.", next: "Prediction can stop here and sample. Training continues to the loss." }),
    node("loss", "Target loss", "operation", "ns-logits", "one number", { goesIn: "p and the correct next token.", happens: "Loss = −log(p of the correct token).", why: "It measures the miss: 0 if the model was certain and right, large if it gave the right token little probability.", comesOut: "One number, the loss.", next: "Backpropagation asks how each parameter affected it.", tryIt: "Change the correct next token and watch the loss change without any weight changing." }),
    node("grads", "Gradients", "operation", "ns-grad", "one per parameter", { goesIn: "The loss and every value computed on the way forward.", happens: "The chain rule runs backwards: first ∂L/∂logits = p − y, then back through W2, tanh, W1 and E.", why: "A gradient says how the loss would change if one parameter were nudged up a little; that tells the update which way to move it.", comesOut: "One gradient for each of the parameters, the same shapes as E, W1, b1, W2, b2.", next: "The update uses them." }),
    node("update", "Parameter update", "output", "ns-update", undefined, { goesIn: "Every parameter, its gradient and the learning rate.", happens: "Each parameter moves by −learning rate × its gradient.", why: "Moving against the gradient lowers the loss for this example, if the step is small enough.", comesOut: "New parameters. The next prediction uses them.", next: "The next training step, or prediction with the new weights.", tryIt: "Press Apply one update, compare before and after, then raise the learning rate a lot and try again." }),
  ],
  tour: [
    { target: "scalar", title: "First, gradient descent on one number", plain: <><p>Before a whole network, one number. The loss here is (w − 3)², lowest at w = 3. The gradient, 2(w − 3), says which way the loss goes up; each step moves w the other way, by learning rate × gradient.</p><p>Everything later on this page is this same move, applied to many numbers at once.</p></>,
      terms: [{ id: "gradient", role: "the slope of the loss at the current w." }, { id: "learning-rate", role: "how big each step is." }] },
    { target: "ns-tensors", title: "Every array in one step", plain: <><p>A tensor is just an array of numbers with a shape. This table lists every one used in one training step: what its rows and columns mean, its shape, where its values came from, and what uses it next.</p></>,
      terms: [{ id: "tensor", role: "an array of numbers with a shape, like 5 × 2." }, { id: "parameter", role: "the tensors that training changes: E, W1, b1, W2, b2." }] },
    { target: "ns-embed", title: "IDs pick rows of the embedding table", plain: <><p>Each context ID selects one row of E. The two rows are joined into x, four numbers. The IDs themselves are never multiplied: they only choose rows.</p></>,
      terms: [{ id: "embedding", role: "the learned row of numbers for one token." }] },
    { target: "ns-hidden", title: "The hidden layer mixes the context", plain: <><p>x is multiplied by W1 and b1 is added, giving three numbers. tanh squashes each into the range −1 to 1. The result h is a mixture of both context characters.</p></>,
      terms: [{ id: "forward-pass", role: "computing from input to output." }] },
    { checkpoint: "neural.loss", target: "ns-logits", title: "Scores, probabilities and the loss", plain: <><p>h·W2 + b2 gives one score per token: the logits. Softmax turns scores into probabilities that add up to one.</p><p>Up to here is ordinary prediction, also called inference. Training adds one more number: the loss, −log of the probability given to the correct token.</p></>,
      terms: [{ id: "logits", role: "the five raw scores." }, { id: "softmax", role: "scores to probabilities." }, { id: "cross-entropy", role: "the loss for the correct token." }, { id: "training-vs-inference", role: "prediction stops before the loss; training continues." }] },
    { target: "ns-grad", title: "Gradients: training only", plain: <><p>Ordinary prediction never computes these. During training, the gradient of the loss is worked out for every parameter, backwards from the logits: p − y says each score was too high (positive) or too low (negative).</p></>,
      terms: [{ id: "backpropagation", role: "the chain rule, run from the loss back to E." }] },
    { checkpoint: "neural.update", target: "ns-update", title: "The update, before and after", plain: <><p>Press Apply one update. Every parameter moves by −learning rate × its gradient, and the table compares chosen values before and after, with the loss for this example.</p><p>This is the only place weights change. Prediction alone never changes them.</p></>,
      terms: [{ id: "optimizer", role: "here plain SGD: θ ← θ − η × gradient." }] },
    { target: "train", title: "Many updates: a training run", plain: <><p>A training run repeats the step thousands of times on many pairs, and measures the loss on separate validation text as it goes. When validation loss rises while training loss falls, the network is memorising its training text.</p></>,
      terms: [{ id: "overfitting", role: "training loss falls while validation loss rises." }, { id: "batch", role: "how many pairs each update averages over." }] },
  ],
}

export default function Neural() {
  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Neural network training"
      subtitle="A tiny network you can watch learn: every number is computed in your browser, by a simplified model, not your Python engine."
      explain={<NeuralExplain />}
    >
      <WorkspaceGuide />
      <Note>Stage 2 of your roadmap builds this model in PyTorch. Until then, everything on this page is an interactive simulation, and its curves are not results from a model you trained.</Note>
      <ScalarDescent />
      <OneStep />
      <TrainingRun />
      <PythonAdapter />
    </Workspace>
    </Teach>
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
    <Panel id="scalar" title="First, gradient descent on one number" source={<Source kind="simulation" detail="f(w) = (w − 3)²" />}
      teach={{
        calc: <><Symbols rows={[
          ["w₀", "the starting value", start.toFixed(2)],
          ["f′(w₀)", "gradient 2(w₀ − 3)", path[0].grad.toFixed(3)],
          ["η", "learning rate", lr.toFixed(2)],
          ["w₁", `w₀ − η × f′(w₀) = ${start.toFixed(2)} − ${lr.toFixed(2)} × ${path[0].grad.toFixed(3)}`, path[1] ? path[1].w.toFixed(3) : "—"],
        ]} /><p>A negative gradient means the loss falls as w grows, so the step moves w up, toward 3.</p></>,
        code: <SimCode path="web/src/sim/neural.ts" symbol="scalarDescent" text={neuralSource} />,
      }}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-5">
          <p className="text-sm">The loss is f(w) = (w − 3)², smallest at w = 3. The <Term id="gradient">gradient</Term> is f′(w) = 2(w − 3). Each step moves w by −<Term id="learning-rate">learning rate</Term> × gradient.</p>
          <SliderField id="w0" helpId="neural.scalar" label="Starting w" value={start} min={-6} max={10} step={0.5} onChange={setStart} format={(v) => v.toFixed(1)} />
          <SliderField id="lr0" helpId="neural.scalar" label="Learning rate" value={lr} min={0.01} max={1.2} step={0.01} onChange={setLr} format={(v) => v.toFixed(2)} hint="Above 1.0 each step overshoots by more than it corrects." />
          <SliderField id="st0" helpId="neural.scalar" label="Steps" value={steps} min={1} max={60} step={1} onChange={setSteps} />
          <p className={cn("text-sm", diverged && "text-negative")}>
            After {path.length - 1} steps: w = <span className="num">{Number.isFinite(last.w) ? last.w.toFixed(4) : "overflow"}</span>, loss = <span className="num">{Number.isFinite(last.loss) ? last.loss.toExponential(2) : "∞"}</span>. {diverged ? "It is moving away from 3: the steps are too big." : Math.abs(last.w - 3) < 1e-3 ? "It has reached the minimum." : "Still on its way."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <LineChart ariaLabel="w after each step" series={[{ name: "w", tone: "data", points: path.map((p) => ({ x: p.step, y: p.w })) }, { name: "target (3)", tone: "grey", dashed: true, points: path.map((p) => ({ x: p.step, y: 3 })) }]} xLabel="step" yLabel="w" height={180} yMin={Math.min(0, ...path.map((p) => p.w).filter(Number.isFinite))} />
          <table className="text-sm">
            <caption className="sr-only">The first steps of gradient descent</caption>
            <thead><tr className="text-label text-muted-foreground"><th className="text-right font-normal">Step</th><th className="text-right font-normal">w</th><th className="text-right font-normal">gradient 2(w − 3)</th><th className="text-right font-normal">update −lr × grad</th></tr></thead>
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
  const [prevLr, setPrevLr] = useState(lr)
  const [losses, setLosses] = useState<number[]>([])
  const ex = { context: [c0, c1], target }
  const f = forward(params, ex)
  const grad = zerosLike(params)
  const b = backward(params, ex, f, grad)
  const labels = STEP_VOCAB.map((t, i) => <span key={i}>{i} <span className="tok">{t}</span></span>)
  // The step that produced the current weights, recomputed from the weights before it (no new randomness).
  const before = previous ? (() => {
    const pf = forward(previous, ex)
    const pg = zerosLike(previous)
    backward(previous, ex, pf, pg)
    return { f: pf, g: pg }
  })() : null
  const watched = [
    { name: `E[${c0}][0]`, what: `first embedding number of context token 1 (“${STEP_VOCAB[c0]}”)`, at: (q: Params) => q.E[c0][0], grad: (q: Params) => q.E[c0][0] },
    { name: "W1[0][0]", what: "first input to first hidden unit", at: (q: Params) => q.W1[0][0], grad: (q: Params) => q.W1[0][0] },
    { name: `W2[0][${target}]`, what: `hidden unit 1 to the correct token's score`, at: (q: Params) => q.W2[0][target], grad: (q: Params) => q.W2[0][target] },
    { name: `b2[${target}]`, what: "the correct token's bias", at: (q: Params) => q.b2[target], grad: (q: Params) => q.b2[target] },
  ]

  function reset(s = seed) {
    setParams(initParams(STEP_CONFIG, s))
    setPrevious(null)
    setLosses([])
  }
  function apply() {
    setPrevious(params)
    setPrevLr(lr)
    setLosses([...losses, f.loss])
    setParams(sgdStep(params, grad, lr))
    if (losses.length === 0) actions.logRun({ route: "neural", title: "Applied one gradient step", summary: `loss ${f.loss.toFixed(3)} before`, source: "simulation" }, ["forward-pass", "cross-entropy", "backpropagation", "gradient"])
  }
  const pick = (value: number, set: (n: number) => void, label: string, id: string, info = false) => (
    <div className="flex flex-col gap-2" data-help-id="neural.example">
      <span className="flex items-center gap-0.5"><span id={id} className="text-sm font-medium">{label}</span>{info && <InfoTip id="neural.example" />}</span>
      <Select value={String(value)} onValueChange={(v) => { set(Number(v)); setPrevious(null) }} items={STEP_VOCAB.map((t, i) => ({ value: String(i), label: `${t}  (ID ${i})` }))}>
        <SelectTrigger aria-labelledby={id} className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>{STEP_VOCAB.map((t, i) => <SelectItem key={i} value={String(i)}>{t} (ID {i})</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )

  return (
    <Panel id="onestep" variant="canvas" title="One training step, every number" source={<Source kind="simulation" detail={`${countParams(STEP_CONFIG)} parameters, seed ${seed}`} />}
      aside={
        <div className="flex items-center gap-2">
          <Button data-help-id="neural.apply" onClick={apply}><PlayIcon className="size-4" /> Apply one update</Button>
          <Button variant="ghost" data-help-id="neural.reset" onClick={() => reset()}><UndoIcon className="size-4" /> Reset weights</Button>
        </div>
      }>
      <div className="flex flex-wrap items-end gap-4">
        {pick(c0, setC0, "Context token 1", "c0", true)}
        {pick(c1, setC1, "Context token 2", "c1")}
        {pick(target, setTarget, "Correct next token", "tg")}
        <NumberField id="ws" helpId="neural.weight-seed" label="Weight seed" value={seed} min={0} max={9999} onChange={(v) => { setSeed(v); reset(v) }} />
        <div className="w-56"><SliderField id="lr1" helpId="neural.lr" label="Learning rate" value={lr} min={0.05} max={3} step={0.05} onChange={setLr} format={(v) => v.toFixed(2)} /></div>
      </div>
      <p className="mt-3 text-sm">Vocabulary: {STEP_VOCAB.map((t, i) => <span key={i} className="mr-2"><Tok>{t}</Tok> = {i}</span>)} The weights start as seeded random numbers; nothing has been learned yet.</p>

      <TeachSpot id="ns-tensors" className="mt-5">
        <TensorTable />
      </TeachSpot>

      <p className="mt-6 text-sm font-medium">Prediction (also called <TermHelp id="training-vs-inference" here="Parts 1 to 3 are inference: the network uses its current numbers to predict, and nothing changes. Training adds parts 4 and 5: the gradients and the update.">inference</TermHelp>): parts 1 to 3 run every time the network predicts.</p>
      <ol className="mt-3 flex flex-col gap-6">
        <li className="flex flex-col gap-3">
        <TeachSpot id="ns-embed" className="flex flex-col gap-3" teach={{
          calc: <Symbols rows={[
            ["c₁, c₂", "the context IDs", `${c0}, ${c1}`],
            [`E[${c0}]`, `row ${c0} of E`, params.E[c0].map((v) => v.toFixed(3)).join(", ")],
            [`E[${c1}]`, `row ${c1} of E`, params.E[c1].map((v) => v.toFixed(3)).join(", ")],
            ["x", "the two rows joined", f.x.map((v) => v.toFixed(3)).join(", ")],
          ]} />,
          code: <SimCode path="web/src/sim/neural.ts" symbol="forward" text={neuralSource} />,
        }}>
          <h3 className="text-sm font-semibold">1. Look up <Term id="embedding">embeddings</Term> by <Term id="token-id">token ID</Term></h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="E, the embedding table" m={params.E} rowLabels={labels} highlightRows={[c0, c1]} before={previous?.E} caption="One row per token. Rows for the context are outlined." />
            <VectorView name="x = [E[ctx 1], E[ctx 2]]" v={f.x} caption={`Two rows of 2 numbers, joined: shape ${STEP_CONFIG.context} × ${STEP_CONFIG.embed} → ${f.x.length}.`} />
          </div>
        </TeachSpot>
        </li>
        <li className="flex flex-col gap-3">
        <TeachSpot id="ns-hidden" className="flex flex-col gap-3" teach={{
          calc: <><Symbols rows={[
            ["x·W1[:,0] + b1[0]", f.x.map((v, i) => `${v.toFixed(2)}×${params.W1[i][0].toFixed(2)}`).join(" + ") + ` + ${params.b1[0].toFixed(2)}`, f.pre[0].toFixed(3)],
            ["h[0]", `tanh(${f.pre[0].toFixed(3)})`, f.h[0].toFixed(3)],
            ["h", "all three hidden units", f.h.map((v) => v.toFixed(3)).join(", ")],
          ]} /><p>Each hidden unit is a weighted sum of all four inputs plus its bias, then squashed by tanh.</p></>,
          code: <SimCode path="web/src/sim/neural.ts" symbol="forward" text={neuralSource} />,
        }}>
          <h3 className="text-sm font-semibold">2. <Term id="forward-pass">Forward pass</Term> through the hidden layer</h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="W1" m={params.W1} before={previous?.W1} caption="4 inputs × 3 hidden units" />
            <VectorView name="x·W1 + b1" v={f.pre} />
            <VectorView name="h = tanh(x·W1 + b1)" v={f.h} caption="tanh squashes each value into (−1, 1)." />
          </div>
        </TeachSpot>
        </li>
        <li className="flex flex-col gap-3">
        <TeachSpot id="ns-logits" className="flex flex-col gap-3" teach={{
          calc: (() => {
            const ex2 = f.logits.map((z) => Math.exp(z))
            const sum = ex2.reduce((a2, b3) => a2 + b3, 0)
            return <><Symbols rows={[
              ["z", "the logits, h·W2 + b2", f.logits.map((v) => v.toFixed(3)).join(", ")],
              ["eᶻ", "e raised to each score (always positive)", ex2.map((v) => v.toFixed(3)).join(", ")],
              ["Σ eᶻ", "their sum", sum.toFixed(3)],
              [`p[${STEP_VOCAB[target]}]`, `e^z ÷ Σ = ${ex2[target].toFixed(3)} ÷ ${sum.toFixed(3)}`, f.probs[target].toFixed(4)],
              ["L", `−log(${f.probs[target].toFixed(4)})`, f.loss.toFixed(4)],
            ]} /><p>A loss of {f.loss.toFixed(3)} nats; guessing uniformly over 5 tokens would give −log(1/5) = 1.609.</p></>
          })(),
          code: <><SimCode path="web/src/sim/neural.ts" symbol="softmax" text={neuralSource} /><SimCode path="web/src/sim/neural.ts" symbol="forward" text={neuralSource} /></>,
        }}>
          <h3 className="text-sm font-semibold">3. <TermHelp id="logits" here={`One score per token in this ${STEP_VOCAB.length}-token vocabulary, computed as h·W2 + b2.`} example={<>Right now the scores are {f.logits.map((z) => z.toFixed(2)).join(", ")} for {STEP_VOCAB.join(", ")}.</>}>Logits</TermHelp>, <TermHelp id="softmax" here="Turns the five logits into the probabilities p that the loss and sampling use." example={<>Token {STEP_VOCAB[target]}: exp({f.logits[target].toFixed(3)}) ÷ the sum of exp over all five scores = <span className="num">{f.probs[target].toFixed(4)}</span>.</>}>softmax</TermHelp> and <Term id="cross-entropy">loss</Term></h3>
          <div className="flex flex-wrap items-start gap-6">
            <MatrixView name="W2" m={params.W2} before={previous?.W2} colLabels={STEP_VOCAB} caption="3 hidden units × 5 tokens" />
            <VectorView name="logits = h·W2 + b2" v={f.logits} labels={STEP_VOCAB} />
            <VectorView name="p = softmax(logits)" v={f.probs} labels={STEP_VOCAB} digits={3} highlight={[target]} caption={`Sums to ${f.probs.reduce((a, b2) => a + b2, 0).toFixed(3)}.`} />
          </div>
          <p className="text-sm">The correct token is <Tok tone="chosen">{STEP_VOCAB[target]}</Tok> with p = <span className="num">{f.probs[target].toFixed(4)}</span>, so the loss, its <TermHelp id="nll" here="The training loss for this one example: the penalty for the probability the network gave the correct next token." example={<>p = {f.probs[target].toFixed(4)} for the correct token {STEP_VOCAB[target]}, so NLL = −ln({f.probs[target].toFixed(4)}) = <span className="num">{f.loss.toFixed(4)}</span> nats. Change the correct token and this changes without any weight changing.</>}>NLL</TermHelp>, is −<MathHelp id="ln" here="log here is the natural log, ln: the simulation uses JavaScript's Math.log, base e.">log</MathHelp>({f.probs[target].toFixed(4)}) = <span className="num font-semibold">{f.loss.toFixed(4)}</span> <TermHelp id="nats" here="The loss uses the natural log, so it is measured in nats." example={<>Guessing uniformly over {STEP_VOCAB.length} tokens would cost ln {STEP_VOCAB.length} = {Math.log(STEP_VOCAB.length).toFixed(3)} nats; this example costs {f.loss.toFixed(3)}.</>}>nats</TermHelp>.</p>
        </TeachSpot>
        </li>
        <li className="flex flex-col gap-1 rounded-md bg-raised px-4 py-3 text-sm">
          <span className="font-medium">Prediction ends here.</span>
          <span>To predict, the network would now sample from p (or take its largest value). Nothing above changed a weight. Parts 4 and 5 happen only during training.</span>
        </li>
        <li className="flex flex-col gap-3">
        <TeachSpot id="ns-grad" className="flex flex-col gap-3" teach={{
          calc: <><Symbols rows={[
            ["y", "1 for the correct token, 0 for the others", STEP_VOCAB.map((_, i) => (i === target ? 1 : 0)).join(", ")],
            ["p − y", "∂L/∂logits", b.dLogits.map((v) => v.toFixed(3)).join(", ")],
            [`∂L/∂W2[0][${target}]`, `h[0] × (p − y)[${target}] = ${f.h[0].toFixed(3)} × ${b.dLogits[target].toFixed(3)}`, grad.W2[0][target].toFixed(4)],
          ]} /><p>Negative entries in p − y belong to tokens whose scores should go up (only the correct one); positive entries to scores that should go down.</p></>,
          code: <SimCode path="web/src/sim/neural.ts" symbol="backward" text={neuralSource} />,
        }}>
          <h3 className="text-sm font-semibold">4. <Term id="backpropagation">Backpropagation</Term>: gradients</h3>
          <div className="flex flex-wrap items-start gap-6">
            <VectorView name="∂L/∂logits = p − y" v={b.dLogits} labels={STEP_VOCAB} digits={3} caption="y is 1 for the correct token, 0 elsewhere. Negative means: raise this logit." />
            <MatrixView name="∂L/∂W2 = hᵀ · (p − y)" m={grad.W2} colLabels={STEP_VOCAB} digits={3} />
            <VectorView name="∂L/∂h" v={b.dH} digits={3} />
            <VectorView name="∂L/∂x" v={b.dX} digits={3} caption="Split back into the two context rows of E." />
          </div>
        </TeachSpot>
        </li>
        <li className="flex flex-col gap-3">
        <TeachSpot id="ns-update" className="flex flex-col gap-3" teach={{
          calc: before ? <Symbols rows={watched.map((w) => [w.name, `${w.at(previous!).toFixed(4)} − ${prevLr.toFixed(2)} × ${w.grad(before.g).toFixed(4)}`, w.at(params).toFixed(4)] as [string, string, string])} /> : <p>Apply one update first; then this shows each watched parameter as before − learning rate × gradient = after.</p>,
          code: <SimCode path="web/src/sim/neural.ts" symbol="sgdStep" text={neuralSource} />,
        }}>
          <h3 className="text-sm font-semibold">5. Update: every parameter moves by −{lr.toFixed(2)} × its gradient</h3>
          {losses.length === 0 ? (
            <EmptyNote>Press Apply one update. Changed cells turn bold above, and the loss for this example is recomputed.</EmptyNote>
          ) : (
            <>
            {before && (
              <table className="w-full max-w-3xl text-sm" data-testid="before-after">
                <caption className="mb-1 text-left text-label text-muted-foreground">The last update, with learning rate {prevLr.toFixed(2)}</caption>
                <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Value</th><th scope="col" className="text-right font-normal">Before</th><th scope="col" className="text-right font-normal">Gradient</th><th scope="col" className="text-right font-normal">−lr × gradient</th><th scope="col" className="text-right font-normal">After</th></tr></thead>
                <tbody>
                  {watched.map((w) => (
                    <tr key={w.name} className="border-t border-rule">
                      <th scope="row" className="py-1 text-left font-normal"><span className="tok">{w.name}</span> <span className="text-muted-foreground">{w.what}</span></th>
                      <td className="num text-right">{w.at(previous!).toFixed(4)}</td>
                      <td className="num text-right">{w.grad(before.g).toFixed(4)}</td>
                      <td className="num text-right">{(-prevLr * w.grad(before.g)).toFixed(4)}</td>
                      <td className="num text-right font-medium">{w.at(params).toFixed(4)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <th scope="row" className="py-1 text-left font-normal">p of the correct token</th>
                    <td className="num text-right">{before.f.probs[target].toFixed(4)}</td><td /><td />
                    <td className="num text-right font-medium">{f.probs[target].toFixed(4)}</td>
                  </tr>
                  <tr className="border-t border-rule">
                    <th scope="row" className="py-1 text-left font-normal">Loss for this example</th>
                    <td className="num text-right">{before.f.loss.toFixed(4)}</td><td /><td />
                    <td className="num text-right font-medium">{f.loss.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="text-sm">
              Loss for this example after each update: {[...losses, f.loss].map((l, i) => <span key={i} className="num mr-2">{i > 0 && "→ "}{l.toFixed(4)}</span>)}
              {f.loss < losses[losses.length - 1] ? " It went down: the step moved the weights downhill for this example." : " It went up: the learning rate is too large for this step."}
            </p>
            </>
          )}
        </TeachSpot>
        </li>
      </ol>
      <p className="mt-4 text-label text-muted-foreground">Shapes, end to end: IDs (2) → E rows (2 × 2) → x (4) → h (3) → logits (5) → p (5) → loss (1 number). Every token ID is used only to pick rows; the arithmetic is all matrix multiplication.</p>
    </Panel>
  )
}

/** Every tensor of the one-step example: meaning of its axes, shape, origin and next use. */
function TensorTable() {
  const { vocabSize: V, context: C, embed: D, hidden: H } = STEP_CONFIG
  const rows: [string, string, string, string, string][] = [
    ["IDs", "the context positions", `${C}`, "your choice of context tokens", "pick rows of E"],
    ["E", "rows: tokens; columns: learned features", `${V} × ${D}`, "seeded random numbers, then updates", "embedding lookup"],
    ["x", "the chosen rows, side by side", `${C * D}`, "rows of E", "x·W1 + b1"],
    ["W1, b1", "rows: inputs; columns: hidden units", `${C * D} × ${H}, ${H}`, "seeded random numbers, then updates", "the hidden layer"],
    ["h", "one value per hidden unit", `${H}`, "tanh(x·W1 + b1)", "h·W2 + b2"],
    ["W2, b2", "rows: hidden units; columns: vocabulary tokens", `${H} × ${V}, ${V}`, "seeded random numbers, then updates", "the logits"],
    ["logits", "one score per vocabulary token", `${V}`, "h·W2 + b2", "softmax"],
    ["p", "one probability per token", `${V}`, "softmax(logits)", "sampling (prediction) or the loss (training)"],
    ["loss", "one number", "1", "−log p[correct]", "backpropagation (training only)"],
    ["gradients", "same layout as each parameter", "same as E, W1, b1, W2, b2", "backpropagation", "the update (training only)"],
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="mb-1 text-left text-sm font-medium">The arrays in this step</caption>
        <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Name</th><th scope="col" className="font-normal">What rows and columns mean</th><th scope="col" className="text-right font-normal">Shape</th><th scope="col" className="pl-4 font-normal">Values come from</th><th scope="col" className="font-normal">Used next by</th></tr></thead>
        <tbody>
          {rows.map(([n, m, shape, from, next]) => (
            <tr key={n} className="border-t border-rule">
              <th scope="row" className="tok py-1 pr-3 text-left font-normal">{n}</th>
              <td className="py-1 pr-3">{m}</td>
              <td className="num py-1 text-right">{shape}</td>
              <td className="py-1 pl-4 pr-3 text-muted-foreground">{from}</td>
              <td className="py-1 text-muted-foreground">{next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        teach={{
          calc: last && best ? <Symbols rows={[
            ["settings", "of the run shown", run!.settings],
            ["train loss", "mean −log p(correct) over the training pairs, at the last step", last.train.toFixed(3)],
            ["validation loss", "the same on the separate validation text", last.val.toFixed(3)],
            ["lowest validation", `at step ${best.step}`, best.val.toFixed(3)],
            ["uniform guess", `−log(1/${run!.meta?.vocabSize ?? "V"})`, uniform?.toFixed(3)],
          ]} /> : <p>Press Train; the numbers of the finished run appear here.</p>,
          code: <SimCode path="web/src/sim/neural.ts" symbol="train" text={neuralSource} />,
        }}
        aside={running ? <Button variant="outline" onClick={cancel}><XmarkIcon className="size-4" /> Cancel</Button> : <Button data-help-id="neural.train" onClick={start}><PlayIcon className="size-4" /> Train</Button>}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Training text</span>
              <Segmented label="Training text" value={text} onChange={setText} options={[{ value: "small", label: `Small (${TRAIN_SMALL.length} chars)` }, { value: "large", label: `Larger (${TRAIN_LARGE.length} chars)` }]} />
              <p className="text-label text-muted-foreground"><TermHelp id="split" here="Validation text is held out: the network never trains on it, so its loss shows whether learning carries over to new text.">Validation</TermHelp> is always the same separate text ({VALIDATION.length} chars), never trained on.</p>
            </div>
            <SliderField id="hid" helpId="neural.run-settings" label="Hidden units" value={hidden} min={4} max={64} step={4} onChange={setHidden} />
            <SliderField id="lr2" helpId="neural.lr" label="Learning rate" value={lr} min={0.01} max={1} step={0.01} onChange={setLr} format={(v) => v.toFixed(2)} />
            <SliderField id="steps" helpId="neural.run-settings" label="Steps (updates)" value={steps} min={50} max={3000} step={50} onChange={setSteps} />
            <SliderField id="batch" helpId="neural.run-settings" label={<Term id="batch">Batch size</Term>} value={batch} min={8} max={1000} step={8} onChange={setBatch} format={(v) => (v >= 1000 ? "all pairs" : String(v))} hint="Smaller batches are sampled at random each step." />
            <NumberField id="tseed" helpId="neural.run-settings" label="Seed" value={seed} min={0} max={9999} onChange={setSeed} />
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
                <div><dt className="text-label text-muted-foreground">Parameters</dt><dd className="num">{fmt.n(run.meta.params)}</dd></div>
                <div><dt className="text-label text-muted-foreground">Training pairs</dt><dd className="num">{run.meta.trainPairs}</dd></div>
                <div><dt className="text-label text-muted-foreground">Validation pairs</dt><dd className="num">{run.meta.valPairs}</dd></div>
                <div><dt className="text-label text-muted-foreground">Uniform-guess loss, <TermHelp id="nats" here="Both curves are mean −ln p over pairs, so they are in nats." example={run.meta ? <>A uniform guess over {run.meta.vocabSize} characters costs ln {run.meta.vocabSize} = {uniform?.toFixed(3)} nats. The curves should end below it.</> : undefined}>nats</TermHelp></dt><dd className="num">{uniform?.toFixed(3)}</dd></div>
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
      <p className="mt-3 text-label text-muted-foreground">The curve shape is the same CurvePoint type the simulation uses (web/src/sim/neural.ts), so nothing in this page needs rebuilding.</p>
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
