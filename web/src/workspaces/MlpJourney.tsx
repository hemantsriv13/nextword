// The MLP journey: train a real character-level MLP (PyTorch, on this computer's CPU) and follow one
// example through it, stage by stage. Every number comes from the backend (nextword/lab/mlp_service.py).
// The local AI section explains the run; it is a different, larger model than the MLP being studied.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CheckIcon, NavArrowLeftIcon, NavArrowRightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AssistProvider, type AssistTarget } from "@/components/lab/ask-ai"
import { LineChart, MatrixView, ProbBars, Tok, VectorView } from "@/components/lab/charts"
import { CheckpointStatus, useCheckpoints } from "@/components/lab/checkpoint"
import { ExplanationPanel, TryThis } from "@/components/lab/explanation"
import { Term } from "@/components/lab/glossary"
import { InfoTip } from "@/components/lab/info-tip"
import { ErrorNote, LoadingRows, Note, NumberField, Segmented } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { mlpKey } from "@/lib/assist"
import { findTerm } from "@/content/glossary"
import { MLP_CHECKPOINTS, type Context } from "@/lib/checkpoints"
import type { Corpus } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt } from "@/lib/hooks"
import { TrainingReplay, UpdateReplay } from "@/components/lab/replay"
import { LEARNING_RATES, mlpApi, type RecordedHistory, type RecordedUpdate, type Checkpoint, type Comparison, type Generated, type Inspection, type MlpConfig, type MlpRun, type MlpStatus, type Split } from "@/lib/mlp"
import { cn } from "@/lib/utils"

export const MLP_STAGES = [
  { id: "text", label: "Text", purpose: "The text is split into training, validation and test parts." },
  { id: "examples", label: "Training examples", purpose: "Each window of characters is paired with the character after it." },
  { id: "embeddings", label: "Embeddings", purpose: "Each character becomes a list of learned numbers." },
  { id: "hidden", label: "Hidden layer", purpose: "The numbers are mixed and squeezed by tanh." },
  { id: "predictions", label: "Predictions", purpose: "Scores become probabilities for every next character." },
  { id: "loss", label: "Loss", purpose: "One number says how wrong the prediction was." },
  { id: "update", label: "Weight update", purpose: "Every weight moves a little to lower the loss." },
  { id: "generation", label: "Generation", purpose: "The trained network writes text, compared with the bigram." },
] as const
type StageId = (typeof MLP_STAGES)[number]["id"]

const FALLBACK: MlpConfig = { context: 3, embed: 8, hidden: 64, steps: 2000, batch: 32, lr: 0.1, seed: 1 }
const n4 = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toFixed(4))
const q = (c: string) => `‘${c}’`

// ----------------------------------------------------------------------------- page

export default function MlpJourney() {
  return <AssistProvider><MlpPage /></AssistProvider>
}

function MlpPage() {
  const { corpora } = useCorpora()
  const [status, setStatus] = useState<MlpStatus | null>(null)
  const [form, setForm] = useState<{ corpus: string } & MlpConfig>({ corpus: "sample", ...FALLBACK })
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<MlpRun | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [stage, setStage] = useState(0)
  const [checkpoint, setCheckpoint] = useState<Checkpoint>("trained")
  const [split, setSplit] = useState<Split>("train")
  const [index, setIndex] = useState(0)
  const [ins, setIns] = useState<Inspection | null>(null)
  const [finished, setFinished] = useState(false)
  const [follow, setFollow] = useState(0) // bumped to poll a run again after it resumes

  const refreshStatus = useCallback(() => mlpApi.status().then(setStatus, setError), [])
  useEffect(() => {
    let alive = true
    mlpApi.status().then((s) => {
      if (!alive) return
      setStatus(s)
      if (s.defaults) setForm((f) => ({ ...f, ...s.defaults! }))
      // Open the most recent saved run, so the lesson has real numbers as soon as the page loads.
      if (s.training) setRunId(s.training)
      else if (s.saved[0]) setRunId(s.saved[0].id)
    }, (e) => alive && setError(e))
    return () => { alive = false }
  }, [])

  // Follow the run; poll while it trains.
  useEffect(() => {
    if (!runId) return
    let alive = true
    let timer = 0
    const tick = () => mlpApi.run(runId).then((r) => {
      if (!alive) return
      setRun(r)
      if (r.state === "training") timer = window.setTimeout(tick, 400)
      else void refreshStatus()
    }, (e) => alive && setError(e))
    timer = window.setTimeout(tick, 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [runId, refreshStatus, follow])

  const cp: Checkpoint = checkpoint === "trained" && !run?.fingerprints.trained ? "initial" : checkpoint
  const fingerprint = run ? (cp === "trained" ? run.fingerprints.trained : run.fingerprints.initial) : undefined
  const total = run ? (split === "train" ? run.examples.train : run.examples.val) : 0
  const safeIndex = Math.min(index, Math.max(0, total - 1))

  // The example on screen, through the chosen checkpoint's weights.
  useEffect(() => {
    if (!run || !fingerprint || run.state === "training" && cp === "trained") return
    let alive = true
    mlpApi.inspect({ run: run.id, checkpoint: cp, split, index: safeIndex }).then((r) => alive && setIns(r), (e) => alive && setError(e))
    return () => { alive = false }
  }, [run?.id, run?.state, cp, fingerprint, split, safeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => startWith(form)
  const startWith = async (settings: { corpus: string } & MlpConfig) => {
    setError(null)
    setFinished(false)
    try {
      const r = await mlpApi.start(settings)
      setIns(null)
      setRun(r)
      setRunId(r.id)
      setCheckpoint("trained")
      setIndex(0)
    } catch (e) { setError(e) }
  }
  const stop = async () => { if (run) await mlpApi.stop(run.id).catch(setError) }
  const resume = async () => {
    if (!run) return
    setError(null)
    try {
      const r = await mlpApi.resume(run.id)
      setIns(null)
      setRun(r)
      setRunId(r.id)
      setFollow((n) => n + 1) // follow it again while it trains
    } catch (e) { setError(e) }
  }
  /** Train a new run with the same text and settings as this one. */
  const restart = () => { if (run) { setForm({ corpus: run.corpus.id, ...run.config }); void startWith({ corpus: run.corpus.id, ...run.config }) } }
  const reset = async () => {
    if (!run) return
    try {
      await mlpApi.reset(run.id)
      setRun(null); setRunId(null); setIns(null)
      void refreshStatus()
    } catch (e) { setError(e) }
  }

  const changed = run ? (Object.keys(FALLBACK) as (keyof MlpConfig)[]).filter((k) => run.config[k] !== form[k]).concat(run.corpus.id !== form.corpus ? ["corpus" as keyof MlpConfig] : []) : []
  // Datasets first (tiny, medium, large), then the Lab's other texts. Pasted texts are limited to 200,000 characters.
  const LEVEL = { tiny: 0, medium: 1, large: 2 }
  const choices = (corpora ?? []).filter((c) => (c.origin === "dataset" ? c.chars <= 1_500_000 : c.chars <= 200_000))
    .sort((a, b) => (a.level ? LEVEL[a.level] : 3) - (b.level ? LEVEL[b.level] : 3))

  return (
    <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6 lg:px-8 lg:pt-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-lesson font-semibold sm:text-page">Neural MLP journey</h1>
        <p className="measure text-prose text-muted-foreground">Train a small neural network on a text. Then follow one example through it, from characters to a prediction, its loss, and the update that lowers it.</p>
        <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
          <Source kind="model" detail={status?.torch ? `character MLP, PyTorch ${status.torch} on the CPU` : "character MLP"} />
          <span>Trained here, from random weights. The explaining AI below is a different, pretrained model.</span>
        </div>
      </header>

      {status && !status.available && (
        <Note tone="warning">The MLP needs PyTorch, which isn't installed. In the project folder run <code className="tok">.venv\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu torch</code>, then restart the Lab. The rest of the Lab works without it.</Note>
      )}

      <TrainingPanel form={form} setForm={setForm} status={status} run={run} choices={choices}
        onStart={start} onStop={stop} onReset={reset} onResume={resume} onRestart={restart} onOpen={(id) => { setIns(null); setRunId(id) }} />
      {error != null && <ErrorNote error={error} onRetry={() => { setError(null); void refreshStatus() }} />}
      {run && changed.length > 0 && run.state !== "training" && (
        <Note tone="warning">You changed the {changed.join(", ")}. The lesson still shows run {run.id}. Press Train to make a new run with the new settings.</Note>
      )}

      {!run ? (
        status?.available ? <Note>Press <span className="font-medium">Train</span> to train a first run. The lesson then follows one of its examples, using its real weights.</Note> : null
      ) : (
        <Lesson run={run} cp={cp} setCheckpoint={setCheckpoint} split={split} setSplit={(s) => { setSplit(s); setIndex(0) }}
          index={safeIndex} setIndex={setIndex} total={total} ins={ins && ins.run === run.id && ins.checkpoint === cp && ins.fingerprint === fingerprint && ins.split === split && ins.index === safeIndex ? ins : null}
          stage={stage} setStage={setStage} finished={finished} setFinished={setFinished} />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------- training

function TrainingPanel({ form, setForm, status, run, choices, onStart, onStop, onReset, onResume, onRestart, onOpen }: {
  form: { corpus: string } & MlpConfig
  setForm: (f: { corpus: string } & MlpConfig) => void
  status: MlpStatus | null
  run: MlpRun | null
  choices: Corpus[]
  onStart: () => void
  onStop: () => void
  onReset: () => void
  onResume: () => void
  onRestart: () => void
  onOpen: (id: string) => void
}) {
  const lim = status?.limits
  const training = run?.state === "training"
  const set = <K extends keyof MlpConfig>(k: K, v: MlpConfig[K]) => setForm({ ...form, [k]: v })
  const curve = run?.curve ?? []
  return (
    <section aria-labelledby="mlp-train-h" className="flex flex-col gap-5 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7" data-testid="mlp-training">
      <h2 id="mlp-train-h" className="text-section font-semibold">Train a run</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-8 xl:items-end">
        <div className="col-span-2 flex flex-col gap-2">
          <span id="mlp-corpus" className="flex items-center gap-0.5 text-sm font-medium">Training text<InfoTip id="mlp.corpus" /></span>
          <Select value={form.corpus} onValueChange={(v) => setForm({ ...form, corpus: String(v) })} items={choices.map((c) => ({ value: c.id, label: c.name }))}>
            <SelectTrigger aria-labelledby="mlp-corpus" className="bg-card" data-help-id="mlp.corpus"><SelectValue /></SelectTrigger>
            <SelectContent>{choices.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} <span className="num text-muted-foreground">({fmt.n(c.chars)} chars)</span></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <NumberField id="mlp-context" helpId="mlp.context" label="Window" value={form.context} min={lim?.context[0] ?? 1} max={lim?.context[1] ?? 8} onChange={(v) => set("context", v)} width="w-20" />
        <NumberField id="mlp-embed" helpId="mlp.embed" label={<Term id="embedding">Embedding size</Term>} value={form.embed} min={lim?.embed[0] ?? 2} max={lim?.embed[1] ?? 32} onChange={(v) => set("embed", v)} width="w-20" />
        <NumberField id="mlp-hidden" helpId="mlp.hidden" label={<Term id="hidden-layer">Hidden size</Term>} value={form.hidden} min={lim?.hidden[0] ?? 4} max={lim?.hidden[1] ?? 256} onChange={(v) => set("hidden", v)} width="w-20" />
        <NumberField id="mlp-steps" helpId="mlp.steps" label="Updates" value={form.steps} min={lim?.steps[0] ?? 1} max={lim?.steps[1] ?? 20000} onChange={(v) => set("steps", v)} width="w-24" />
        <NumberField id="mlp-batch" helpId="mlp.batch" label={<Term id="batch">Batch</Term>} value={form.batch} min={lim?.batch[0] ?? 1} max={lim?.batch[1] ?? 512} onChange={(v) => set("batch", v)} width="w-20" />
        <NumberField id="mlp-seed" helpId="mlp.seed" label={<Term id="seed">Seed</Term>} value={form.seed} min={0} max={2147483647} onChange={(v) => set("seed", v)} width="w-24" />
        <div className="flex flex-col gap-2">
          <span id="mlp-lr" className="flex items-center gap-0.5 text-sm font-medium"><Term id="learning-rate">Learning rate</Term><InfoTip id="mlp.lr" /></span>
          <Select value={String(form.lr)} onValueChange={(v) => set("lr", Number(v))} items={LEARNING_RATES.map((r) => ({ value: String(r), label: String(r) }))}>
            <SelectTrigger aria-labelledby="mlp-lr" className="w-24 bg-card" data-help-id="mlp.lr"><SelectValue /></SelectTrigger>
            <SelectContent>{LEARNING_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {choices.find((c) => c.id === form.corpus) && <DatasetNote corpus={choices.find((c) => c.id === form.corpus)!} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="bg-action text-action-ink hover:bg-action/90" data-help-id="mlp.start" onClick={onStart} disabled={!status?.available || training}>{training ? "Training…" : "Train"}</Button>
        <Button variant="outline" data-help-id="mlp.stop" onClick={onStop} disabled={!training}>Stop</Button>
        <Button variant="ghost" data-help-id="mlp.reset" onClick={onReset} disabled={!run || training}>Remove this run</Button>
        {status && status.saved.length > 0 && (
          <span className="ml-auto flex items-center gap-2">
            <span id="mlp-saved" className="flex items-center gap-0.5 text-sm text-muted-foreground">Saved runs<InfoTip id="mlp.saved" /></span>
            <Select value={run?.id ?? ""} onValueChange={(v) => onOpen(String(v))} items={status.saved.map((s) => ({ value: s.id, label: s.id }))}>
              <SelectTrigger aria-labelledby="mlp-saved" className="w-56 bg-card" data-help-id="mlp.saved"><SelectValue placeholder="Open a saved run" /></SelectTrigger>
              <SelectContent>{status.saved.map((s) => <SelectItem key={s.id} value={s.id}>{s.corpus?.name}, {fmt.n(s.step)} of {fmt.n(s.config.steps)} updates{s.state === "stopped" || s.state === "interrupted" ? ` (${s.state}, incomplete)` : ""} <span className="num text-muted-foreground">{s.id}</span></SelectItem>)}</SelectContent>
            </Select>
          </span>
        )}
      </div>
      {run && (
        <div className="flex flex-col gap-4" data-testid="mlp-progress">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap justify-between gap-x-4 text-sm">
              <span><span className="font-medium">{stateLabel(run)}</span> · run <span className="tok">{run.id}</span> on {run.corpus.name}</span>
              <span className="num text-muted-foreground">{fmt.n(run.step)} of {fmt.n(run.config.steps)} updates{run.msPerStep != null ? ` · ${run.msPerStep.toFixed(2)} ms per update` : ""}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label="Training progress" aria-valuemin={0} aria-valuemax={run.config.steps} aria-valuenow={run.step}>
              <div className="h-full bg-data transition-[width] duration-300" style={{ width: `${(100 * run.step) / run.config.steps}%` }} />
            </div>
          </div>
          {run.state === "error" && <Note tone="warning">Training failed: {run.error}</Note>}
          {(run.state === "stopped" || run.state === "interrupted") && (
            <div className="flex flex-col gap-3 rounded-xl bg-raised p-4" data-testid="mlp-incomplete">
              <p className="text-sm">
                <span className="font-medium">Incomplete run: {fmt.n(run.step)} of {fmt.n(run.config.steps)} updates.</span>{" "}
                {run.state === "interrupted" ? "The Lab closed during training; this is its last saved step." : "You stopped this run."}{" "}
                {run.resumable
                  ? "Resuming continues exactly where it stopped."
                  : "It can't be resumed exactly, so train it again from the start."}
              </p>
              <div className="flex flex-wrap gap-2">
                {run.resumable && <Button variant="outline" className="bg-card" data-testid="mlp-resume" onClick={onResume} disabled={status?.training != null && status.training !== run.id}>Resume to {fmt.n(run.config.steps)} updates</Button>}
                <Button variant="ghost" data-testid="mlp-restart" onClick={onRestart}>Train again from the start</Button>
              </div>
            </div>
          )}
          {curve.length > 1 && (
            <div data-help-id="mlp.curve">
              <LineChart ariaLabel="Training and validation loss after each update" xLabel="updates" yLabel="loss (nats)" height={180} yMin={0}
                series={[{ name: "training loss", tone: "ink", points: curve.map((p) => ({ x: p.step, y: p.train })) },
                         { name: "validation loss", tone: "data", points: curve.filter((p) => p.val != null).map((p) => ({ x: p.step, y: p.val! })) }]} />
              <p className="mt-1 text-label text-muted-foreground">
                Measured every {fmt.n(Math.max(1, Math.floor(run.config.steps / 50)))} updates on {run.curveSample && (run.curveSample.train < run.examples.train - 1 || run.curveSample.val < run.examples.val)
                  ? `a fixed sample of ${fmt.n(run.curveSample.train)} training and ${fmt.n(run.curveSample.val)} validation examples (the same for every run on this text; the comparison below uses every example)`
                  : "every training and validation example"}. {run.vocabSize} characters, {fmt.n(run.params)} weights{run.trainSeconds != null ? `, trained in ${run.trainSeconds.toFixed(1)} s` : ""}.{run.best && run.state !== "training" ? ` Lowest validation loss ${run.best.val.toFixed(3)} at update ${fmt.n(run.best.step)}: the checkpoint the final test scores.` : ""}
              </p>
            </div>
          )}
          {(run.state === "done" || run.state === "stopped" || run.state === "interrupted") && (run.recorded?.length ?? 0) > 1 && <RecordedTraining key={run.fingerprints.trained} run={run} />}
        </div>
      )}
    </section>
  )
}

/** What the chosen dataset is: level, source, licence and its fixed parts. */
function DatasetNote({ corpus }: { corpus: Corpus }) {
  if (corpus.origin !== "dataset") return <p className="text-label text-muted-foreground">Split into 80% training, 10% validation and 10% test, in order, before any example is made.</p>
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-raised p-4 text-sm" data-testid="mlp-dataset">
      <p><span className="font-medium">{corpus.level === "tiny" ? "Tiny teaching text" : corpus.level === "medium" ? "Medium practice passage" : "Large corpus"}</span> · {fmt.n(corpus.chars)} characters, fixed parts: {fmt.n(corpus.parts?.train ?? 0)} training, {fmt.n(corpus.parts?.val ?? 0)} validation, {fmt.n(corpus.parts?.test ?? 0)} test.</p>
      {corpus.about && <p className="text-muted-foreground">{corpus.about}</p>}
      {corpus.sources?.map((s) => <p key={s.url} className="text-muted-foreground">Source: {s.title}, {s.author} (<a className="underline underline-offset-2" href={s.url}>Project Gutenberg</a>); {Object.entries(s.split).map(([k, v]) => `${k === "val" ? "validation" : k} ${v}`).join(", ")}.</p>)}
      <p className="text-muted-foreground">Licence: {corpus.license}</p>
      <p className="font-medium">This text trains only this small MLP. It does not train, change or fine-tune Qwen, the AI that explains.</p>
    </div>
  )
}

/** The run's saved moments and saved updates, replayed. */
function RecordedTraining({ run }: { run: MlpRun }) {
  const [history, setHistory] = useState<RecordedHistory | null>(null)
  const [update, setUpdate] = useState<RecordedUpdate | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [open, setOpen] = useState(false)
  const replayable = (history?.steps ?? []).filter((s) => s.replayable).map((s) => s.step)
  const show = () => {
    setOpen(!open)
    if (!history) mlpApi.history({ run: run.id, split: "val", index: 0 }).then(setHistory, setError)
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Recorded training" data-testid="mlp-recorded">
      <Button variant="outline" className="w-fit bg-card" aria-expanded={open} onClick={show}>{open ? "Hide the recorded training" : "Replay the recorded training"}</Button>
      {open && error != null && <ErrorNote error={error} />}
      {open && history && (
        <>
          <TrainingReplay history={history} dataset={run.corpus.name} trainSeconds={run.trainSeconds} />
          {replayable.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Replay one saved update</span>
              <div className="flex flex-wrap gap-1.5">{replayable.map((st) => (
                <Button key={st} size="sm" variant={update?.step === st ? "default" : "outline"} className={update?.step === st ? "" : "bg-card"} onClick={() => mlpApi.replay(run.id, st).then(setUpdate, setError)}>Update {fmt.n(st)}</Button>
              ))}</div>
              {update && <UpdateReplay key={update.step} rep={update} />}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function stateLabel(run: MlpRun) {
  return { new: "Starting", training: "Training", done: "Finished", stopped: "Stopped early (incomplete)", interrupted: "Interrupted (incomplete)", error: "Failed" }[run.state]
}

// ----------------------------------------------------------------------------- the lesson

function Lesson({ run, cp, setCheckpoint, split, setSplit, index, setIndex, total, ins, stage, setStage, finished, setFinished }: {
  run: MlpRun; cp: Checkpoint; setCheckpoint: (c: Checkpoint) => void; split: Split; setSplit: (s: Split) => void
  index: number; setIndex: (i: number) => void; total: number; ins: Inspection | null
  stage: number; setStage: (i: number) => void; finished: boolean; setFinished: (b: boolean) => void
}) {
  const st = MLP_STAGES[stage]
  const checkpoints = useCheckpoints()
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => { if (moved.current) heading.current?.focus(); moved.current = true }, [stage])
  const go = (i: number) => setStage(Math.max(0, Math.min(MLP_STAGES.length - 1, i)))
  const quiz = MLP_CHECKPOINTS[stage]
  const ctx = useMemo<Context>(() => (ins ? { mlp: { run: run.id, fingerprint: ins.fingerprint, context: run.config.context, inspection: ins } } : ({} as Record<string, never>)), [ins, run.id, run.config.context])
  const revisit = () => go(stage)
  useEffect(() => { if (quiz) checkpoints?.visit(quiz) }, [quiz, checkpoints])
  const advance = (to: number, after?: () => void) => {
    const next = () => { go(to); after?.() }
    if (quiz && checkpoints && ins) checkpoints.beforeNext(quiz, ctx, { onContinue: next, nextLabel: MLP_STAGES[to]?.label ?? "the start", revisit })
    else next()
  }
  const next = MLP_STAGES[stage + 1]
  const target: AssistTarget | null = ins && run.fingerprints[cp] ? {
    request: { mlp: { run: run.id, checkpoint: cp, fingerprint: ins.fingerprint }, focus: { stage: st.id, split, index, ...(st.id === "generation" ? { seed: 1 } : {}) } },
    key: mlpKey({ run: run.id, checkpoint: cp, fingerprint: ins.fingerprint }, { stage: st.id, split, index, ...(st.id === "generation" ? { seed: 1 } : {}) }),
    stage: st.id, stageLabel: st.label,
    describe: `run ${run.id}, ${cp} weights ${ins.fingerprint}, ${split === "train" ? "training" : "validation"} example ${index + 1}, stage “${st.label}”`,
  } : null

  return (
    <div className="flex flex-col gap-6" data-testid="mlp-lesson">
      <StageNav stage={stage} onSelect={go} />
      <StageOverview stage={stage} onSelect={go} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3" data-testid="mlp-pickers">
        <Segmented label="Which weights" helpId="mlp.checkpoint" value={cp} onChange={setCheckpoint}
          options={[{ value: "initial", label: "Initial (random)" }, ...(run.fingerprints.trained ? [{ value: "trained" as const, label: `Trained (${fmt.n(run.step)} updates)` }] : [])]} />
        <Segmented label="Which part" helpId="mlp.split" value={split} onChange={setSplit} options={[{ value: "train", label: "Training example" }, { value: "val", label: "Validation example" }]} />
        <span className="flex items-end gap-2" data-help-id="mlp.example">
          <Button variant="outline" size="icon" aria-label="Previous example" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}><NavArrowLeftIcon className="size-4" /></Button>
          <NumberField id="mlp-index" label={`Example (of ${fmt.n(total)})`} value={index + 1} min={1} max={Math.max(1, total)} onChange={(v) => setIndex(v - 1)} width="w-24" />
          <Button variant="outline" size="icon" aria-label="Next example" onClick={() => setIndex(Math.min(total - 1, index + 1))} disabled={index >= total - 1}><NavArrowRightIcon className="size-4" /></Button>
          <InfoTip id="mlp.example" />
        </span>
      </div>
      {run.state === "training" && <Note>Training is running. The lesson shows the initial weights until training finishes or you stop it.</Note>}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="mlp-stage-h" className="flex min-w-0 flex-col gap-5">
          <div className="min-w-0 rounded-2xl border border-canvas-edge bg-canvas p-5 sm:p-7" data-testid="mlp-stage-canvas" data-stage={st.id}>
            <p className="text-label text-muted-foreground">Step {stage + 1} of {MLP_STAGES.length} · {cp === "initial" ? "initial, random weights" : "trained weights"}</p>
            <h2 id="mlp-stage-h" ref={heading} tabIndex={-1} className="mb-5 mt-1 text-lesson font-semibold outline-none focus-visible:outline-2 focus-visible:outline-ring">{st.label}</h2>
            {ins ? <StageCanvas id={st.id} run={run} ins={ins} cp={cp} split={split} setIndex={setIndex} /> : <LoadingRows rows={5} label="Asking your MLP" />}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lesson controls">
            <Button variant="outline" onClick={() => go(stage - 1)} disabled={stage === 0}><NavArrowLeftIcon className="size-4" /> Back</Button>
            {next ? (
              <Button className="bg-action text-action-ink hover:bg-action/90" data-help-id="mlp.next" onClick={() => advance(stage + 1)}>Next: {next.label} <NavArrowRightIcon className="size-4" /></Button>
            ) : (
              <Button className="bg-action text-action-ink hover:bg-action/90" onClick={() => advance(0, () => setFinished(true))}>Finish the lesson</Button>
            )}
          </div>
          {quiz && ins && <CheckpointStatus id={quiz} ctx={ctx} revisit={revisit} />}
          {finished && stage === 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-src-model p-4 text-src-model-ink" role="status" data-testid="mlp-complete">
              <CheckIcon className="mt-0.5 size-5 flex-none" />
              <p><span className="font-medium">Lesson complete.</span> You followed one example from text to numbers, a prediction, its loss, the update that lowers it, and generated text. Try a validation example next, or train with a different window.</p>
            </div>
          )}
        </section>
        <Explanation id={st.id} label={st.label} run={run} ins={ins} cp={cp} target={target} />
      </div>
    </div>
  )
}

function StageNav({ stage, onSelect }: { stage: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Lesson stages" data-help-id="mlp.stages">
      <ol className="hidden grid-cols-8 gap-1.5 xl:grid">
        {MLP_STAGES.map((st, i) => (
          <li key={st.id} className="min-w-0">
            <button type="button" onClick={() => onSelect(i)} aria-current={i === stage ? "step" : undefined}
              className={cn("flex h-full w-full min-w-0 items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors", i === stage ? "bg-canvas outline-2 -outline-offset-2 outline-action" : "text-muted-foreground hover:bg-raised hover:text-foreground")}>
              <span className={cn("num flex size-6 flex-none items-center justify-center rounded-full text-label font-medium", i === stage ? "bg-action text-action-ink" : "bg-raised")}>{i + 1}</span>
              <span className="min-w-0 text-sm font-medium leading-snug">{st.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3 xl:hidden">
        <label htmlFor="mlp-stage-pick" className="text-label text-muted-foreground">Step {stage + 1} of {MLP_STAGES.length}</label>
        <select id="mlp-stage-pick" value={stage} onChange={(e) => onSelect(Number(e.target.value))} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-prose font-medium">
          {MLP_STAGES.map((st, i) => <option key={st.id} value={i}>{i + 1}. {st.label}</option>)}
        </select>
      </div>
    </nav>
  )
}

function StageOverview({ stage, onSelect }: { stage: number; onSelect: (i: number) => void }) {
  return (
    <details className="text-sm" data-testid="mlp-overview">
      <summary className="w-fit cursor-pointer py-1 font-medium text-muted-foreground hover:text-foreground">What the eight steps cover</summary>
      <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        {MLP_STAGES.map((st, i) => (
          <li key={st.id}>
            <button type="button" onClick={() => onSelect(i)} aria-current={i === stage ? "step" : undefined}
              className={cn("flex min-h-10 w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-raised", i === stage && "bg-raised")}>
              <span className="num w-4 flex-none text-muted-foreground">{i + 1}</span>
              <span><span className="font-medium">{st.label}.</span> <span className="text-muted-foreground">{st.purpose}</span></span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

// ----------------------------------------------------------------------------- the stage canvases

function Window({ ins }: { ins: Inspection }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" aria-label={`window ${ins.window.join(" ")}, next ${ins.target}`}>
      {ins.window.map((c, i) => <Tok key={i} tone="context">{c}</Tok>)}
      <span aria-hidden="true" className="text-muted-foreground">→</span>
      <Tok tone="chosen">{ins.target}</Tok>
    </span>
  )
}

function StageCanvas({ id, run, ins, cp, split, setIndex }: { id: StageId; run: MlpRun; ins: Inspection; cp: Checkpoint; split: Split; setIndex: (i: number) => void }) {
  switch (id) {
    case "text": return <TextCanvas run={run} />
    case "examples": return <ExamplesCanvas run={run} ins={ins} split={split} setIndex={setIndex} />
    case "embeddings": return <EmbeddingCanvas ins={ins} />
    case "hidden": return <HiddenCanvas ins={ins} />
    case "predictions": return <PredictionCanvas ins={ins} />
    case "loss": return <LossCanvas run={run} ins={ins} cp={cp} />
    case "update": return <UpdateCanvas ins={ins} />
    case "generation": return <GenerationCanvas run={run} cp={cp} />
  }
}

function TextCanvas({ run }: { run: MlpRun }) {
  const s = run.split
  const all = s.train + s.val + s.test
  const parts = [{ k: "Training", n: s.train, cls: "bg-data" }, { k: "Validation", n: s.val, cls: "bg-src-sim-ink/70" }, { k: "Test", n: s.test, cls: "bg-muted-foreground/50" }]
  return (
    <div className="flex flex-col gap-5">
      <p className="text-prose">{run.corpus.name}: {fmt.n(all)} characters, split <span className="font-medium">before</span> any example is made.</p>
      <div className="flex h-8 overflow-hidden rounded-lg" role="img" aria-label={`Training ${s.train}, validation ${s.val}, test ${s.test} characters`}>
        {parts.map((p) => <div key={p.k} className={p.cls} style={{ width: `${(100 * p.n) / all}%` }} />)}
      </div>
      <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <li><span className="font-medium">Training</span>: {fmt.n(s.train)} characters, {fmt.n(run.examples.train)} examples. The MLP learns only from these.</li>
        <li><span className="font-medium">Validation</span>: {fmt.n(s.val)} characters, {fmt.n(run.examples.val)} examples. Checked during training, never learned from.</li>
        <li><span className="font-medium">Test</span>: {fmt.n(s.test)} characters, {fmt.n(run.examples.test)} examples. Used once, in the final comparison.</li>
      </ul>
      <div className="flex flex-col gap-2">
        <p className="text-label text-muted-foreground"><Term id="vocabulary">Vocabulary</Term>: the {run.vocabSize} tokens of the training part, including ⟨start⟩ (before the text begins) and ⟨?⟩ (a character never seen in training).</p>
        <div className="flex flex-wrap gap-1.5">{run.vocab.map((c, i) => <Tok key={i}>{c}</Tok>)}</div>
      </div>
    </div>
  )
}

function ExamplesCanvas({ run, ins, split, setIndex }: { run: MlpRun; ins: Inspection; split: Split; setIndex: (i: number) => void }) {
  const [rows, setRows] = useState<{ index: number; window: string[]; target: string }[] | null>(null)
  const startAt = Math.max(0, ins.index - 3)
  useEffect(() => {
    let alive = true
    mlpApi.examples({ run: run.id, split, start: startAt, count: 8 }).then((r) => alive && setRows(r.rows), () => alive && setRows([]))
    return () => { alive = false }
  }, [run.id, split, startAt])
  return (
    <div className="flex flex-col gap-4">
      <p className="text-prose">Each example is a window of the previous {run.config.context} {run.config.context === 1 ? "character" : "characters"} and the character that came next. Sliding the window one place gives the next example.</p>
      <ol className="flex flex-col gap-1.5" data-testid="mlp-examples">
        {(rows ?? []).map((r) => (
          <li key={r.index}>
            <button type="button" onClick={() => setIndex(r.index)} aria-current={r.index === ins.index ? "true" : undefined}
              className={cn("flex w-full flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", r.index === ins.index ? "bg-context/40 outline-2 outline-action" : "hover:bg-raised")}>
              <span className="num w-10 text-muted-foreground">{r.index + 1}</span>
              <span className="inline-flex gap-1">{r.window.map((c, i) => <Tok key={i} tone="context">{c}</Tok>)}</span>
              <span aria-hidden="true" className="text-muted-foreground">→</span>
              <Tok tone="chosen">{r.target}</Tok>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-label text-muted-foreground">Selected: example {ins.index + 1} of {fmt.n(ins.examples)}. ⟨start⟩ fills the window before the first character of a part, so no window reaches into another part.</p>
    </div>
  )
}

function EmbeddingCanvas({ ins }: { ins: Inspection }) {
  const m = ins.model
  return (
    <div className="flex flex-col gap-5">
      <Window ins={ins} />
      <MatrixView name="embeddings of the window" m={ins.embeddings} rowLabels={ins.window.map((c, i) => <Tok key={i} tone="context">{c}</Tok>)} colLabels={ins.embeddings[0]?.map((_, i) => `d${i + 1}`)} digits={3}
        caption={`${m.context} characters × ${m.embed} numbers each, looked up from a learned table with one row per vocabulary token.`} />
      <VectorView name={`joined: ${ins.joined.size} numbers${ins.joined.shown < ins.joined.size ? ` (first ${ins.joined.shown} shown)` : ""}`} v={ins.joined.values} digits={3} />
      <p className="text-label text-muted-foreground">The rows are joined end to end into one list of {m.context} × {m.embed} = {m.context * m.embed} numbers: that list is the input to the hidden layer.</p>
    </div>
  )
}

function TanhCurve({ before, after }: { before: number[]; after: number[] }) {
  const W = 260, H = 140, X = (z: number) => ((Math.max(-3, Math.min(3, z)) + 3) / 6) * W, Y = (y: number) => H / 2 - (y * H) / 2.3
  const path = Array.from({ length: 61 }, (_, i) => { const z = -3 + i / 10; return `${i ? "L" : "M"}${X(z).toFixed(1)} ${Y(Math.tanh(z)).toFixed(1)}` }).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-xs" role="img" aria-label="The tanh curve with this example's hidden values marked">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--border)" />
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="var(--border)" />
      <path d={path} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} />
      {before.map((z, i) => <circle key={i} cx={X(z)} cy={Y(after[i])} r={3.5} fill="var(--data)" />)}
      <text x={4} y={12} fontSize="10" fill="var(--muted-foreground)">1</text>
      <text x={4} y={H - 4} fontSize="10" fill="var(--muted-foreground)">−1</text>
    </svg>
  )
}

function HiddenCanvas({ ins }: { ins: Inspection }) {
  return (
    <div className="flex flex-col gap-5">
      <Window ins={ins} />
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-4">
          <VectorView name={`before tanh (first ${ins.hiddenBefore.shown} of ${ins.hiddenBefore.size})`} v={ins.hiddenBefore.values} digits={2} />
          <VectorView name="after tanh" v={ins.hidden.values} digits={2} before={ins.hiddenBefore.values} />
        </div>
        <TanhCurve before={ins.hiddenBefore.values} after={ins.hidden.values} />
      </div>
      <p className="text-label text-muted-foreground">Each hidden value is a weighted sum of all {ins.joined.size} input numbers plus a bias, squeezed by <Term id="activation">tanh</Term> into −1 to 1. {ins.hiddenStats.saturated} of {ins.hiddenStats.size} are beyond ±0.97, where tanh is nearly flat.</p>
    </div>
  )
}

function PredictionCanvas({ ins }: { ins: Inspection }) {
  return (
    <div className="flex flex-col gap-5">
      <Window ins={ins} />
      <ProbBars ariaLabel="The MLP's top next-character probabilities" valueFormat={(v) => v.toFixed(4)}
        items={ins.probs.top.map((t) => ({ key: t.token, label: <Tok tone={t.token === ins.target ? "chosen" : "plain"}>{t.token}</Tok>, value: t.p, highlight: t.token === ins.target }))} />
      <p className="text-prose">The correct character {q(ins.target)} gets <span className="num font-semibold">{ins.probs.target.toFixed(4)}</span>. Guessing every one of the {ins.model.vocab} tokens equally would give each {ins.probs.uniform.toFixed(4)}.</p>
      <p className="text-label text-muted-foreground">The output layer gives one score (<Term id="logits">logit</Term>) per token; <Term id="softmax">softmax</Term> turns them into probabilities that add up to {ins.probs.sum.toFixed(4)}. Top 10 shown.</p>
    </div>
  )
}

function LossCurve({ p, uniform }: { p: number; uniform: number }) {
  const W = 280, H = 150, maxL = Math.max(5, uniform + 0.5)
  const X = (x: number) => x * W, Y = (l: number) => H - (Math.min(l, maxL) / maxL) * (H - 10)
  const path = Array.from({ length: 100 }, (_, i) => { const x = (i + 1) / 100; return `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(-Math.log(x)).toFixed(1)}` }).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-auto w-full max-w-sm" role="img" aria-label={`Loss −ln p as p goes from 0 to 1; this example at p = ${p.toFixed(4)}`}>
      <path d={path} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} />
      <line x1={0} x2={W} y1={Y(uniform)} y2={Y(uniform)} stroke="var(--border)" strokeDasharray="4 3" />
      <text x={W - 4} y={Y(uniform) - 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">equal guessing</text>
      <circle cx={X(p)} cy={Y(-Math.log(p))} r={5} fill="var(--data)" />
      <text x={0} y={H + 14} fontSize="10" fill="var(--muted-foreground)">p = 0</text>
      <text x={W} y={H + 14} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">p = 1</text>
    </svg>
  )
}

function LossCanvas({ run, ins, cp }: { run: MlpRun; ins: Inspection; cp: Checkpoint }) {
  const point = cp === "initial" ? run.curve[0] : run.curve.at(-1)
  return (
    <div className="flex flex-col gap-5">
      <Window ins={ins} />
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
        <LossCurve p={ins.probs.target} uniform={ins.uniformLoss} />
        <div className="flex flex-col gap-2 text-prose">
          <p>loss = −ln(<span className="num">{ins.probs.target.toFixed(4)}</span>) = <span className="num text-section font-semibold">{ins.loss.toFixed(4)}</span></p>
          <p className="text-sm text-muted-foreground">Equal guessing would give −ln(1/{ins.model.vocab}) = {ins.uniformLoss.toFixed(4)}.</p>
          {point && <p className="text-sm">Averaged over all examples at this checkpoint: training {point.train.toFixed(4)}, validation {point.val?.toFixed(4) ?? "–"}.</p>}
        </div>
      </div>
      <p className="text-label text-muted-foreground">One example's <Term id="cross-entropy">cross-entropy</Term> loss. Training lowers the average loss over the training examples; the validation average tells whether that carries over to text the MLP never learned from.</p>
    </div>
  )
}

function UpdateCanvas({ ins }: { ins: Inspection }) {
  const u = ins.update
  const rows = (label: string, part: { before: number[]; grad: number[]; after: number[] }) => (
    <table className="w-full max-w-xl text-sm">
      <caption className="mb-2 text-left text-label text-muted-foreground">{label}</caption>
      <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="pb-1 font-normal">Number</th><th scope="col" className="pb-1 text-right font-normal">Before</th><th scope="col" className="pb-1 text-right font-normal"><Term id="gradient">Gradient</Term></th><th scope="col" className="pb-1 text-right font-normal">After</th></tr></thead>
      <tbody>{part.before.map((b, i) => (
        <tr key={i} className="border-t border-rule"><th scope="row" className="py-1 text-left font-normal">{i + 1}</th><td className="num py-1 text-right">{n4(b)}</td><td className="num py-1 text-right text-muted-foreground">{part.grad[i].toFixed(5)}</td><td className="num py-1 text-right font-medium">{n4(part.after[i])}</td></tr>
      ))}</tbody>
    </table>
  )
  return (
    <div className="flex flex-col gap-5">
      <Window ins={ins} />
      <p className="text-prose">One update on this example alone: every weight becomes <span className="tok">weight − {u.lr} × gradient</span>.</p>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {rows(`Embedding of ${q(u.embedding.token)} (all ${u.embedding.before.length} numbers)`, u.embedding)}
        {rows(`Output weights for ${q(u.outputRow.token)} (first ${u.outputRow.before.length} of ${u.outputRow.size})`, u.outputRow)}
      </div>
      <p className="text-prose" data-testid="mlp-update-effect">After this one update, p({ins.target}) goes from <span className="num">{ins.probs.target.toFixed(4)}</span> to <span className="num font-semibold">{u.pTargetAfter.toFixed(4)}</span>, and the loss from {ins.loss.toFixed(4)} to <span className="font-semibold">{u.lossAfter.toFixed(4)}</span>.</p>
      <p className="text-label text-muted-foreground">Computed on a copy of the weights, so the run itself is unchanged. Gradient sizes: {Object.entries(u.gradNorms).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(" · ")}.</p>
    </div>
  )
}

function GenerationCanvas({ run, cp }: { run: MlpRun; cp: Checkpoint }) {
  const [prompt, setPrompt] = useState("")
  const [seed, setSeed] = useState(1)
  const [gen, setGen] = useState<Generated | null>(null)
  const [cmp, setCmp] = useState<Comparison | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const generate = () => mlpApi.generate({ run: run.id, checkpoint: cp, prompt: prompt || undefined, length: 60, seed }).then(setGen, setErr)
  const compare = () => mlpApi.compare(run.id).then(setCmp, setErr)
  const shown = gen && gen.run === run.id && gen.checkpoint === cp ? gen : null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="mlp-prompt" className="text-sm font-medium">Start from</label>
          <input id="mlp-prompt" value={prompt} placeholder="the start of the training text" onChange={(e) => setPrompt(e.target.value)} className="tok h-9 w-56 rounded-md border border-input bg-card px-3 text-sm" />
        </div>
        <NumberField id="mlp-gen-seed" label={<Term id="seed">Seed</Term>} value={seed} min={0} max={2147483647} onChange={setSeed} />
        <Button className="bg-action text-action-ink hover:bg-action/90" data-help-id="mlp.generate" onClick={generate}>Generate 60 characters</Button>
      </div>
      {err != null && <ErrorNote error={err} />}
      {shown && (
        <div className="flex flex-col gap-3" data-testid="mlp-generated">
          <p className="tok whitespace-pre-wrap break-words rounded-xl bg-raised p-4 text-prose"><span className="text-muted-foreground">{shown.prompt}</span>{shown.text}</p>
          <table className="w-full max-w-2xl text-sm">
            <caption className="mb-2 text-left text-label text-muted-foreground">The first steps: each window, the most likely characters, the random draw and the choice</caption>
            <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Window</th><th scope="col" className="font-normal">Most likely</th><th scope="col" className="text-right font-normal">Draw</th><th scope="col" className="font-normal">Chosen</th></tr></thead>
            <tbody>{shown.steps.slice(0, 6).map((s, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-1.5"><span className="inline-flex gap-1">{s.window.map((c, j) => <Tok key={j} tone="context">{c}</Tok>)}</span></td>
                <td className="py-1.5 text-muted-foreground">{s.top.slice(0, 3).map((t) => `${t.token} ${t.p.toFixed(2)}`).join(", ")}</td>
                <td className="num py-1.5 text-right">{s.draw.toFixed(3)}</td>
                <td className="py-1.5"><Tok tone="chosen">{s.tokenLabel}</Tok> <span className="num text-label text-muted-foreground">p {s.p.toFixed(3)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {run.samples.initial && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="mlp-samples">
          <div><p className="mb-1 text-label text-muted-foreground">Initial (random) weights, seed {run.config.seed}</p><p className="tok whitespace-pre-wrap break-words rounded-xl bg-raised p-3 text-sm">{run.samples.initial}</p></div>
          <div><p className="mb-1 text-label text-muted-foreground">Trained weights, same seed</p><p className="tok whitespace-pre-wrap break-words rounded-xl bg-raised p-3 text-sm">{run.samples.trained}</p></div>
        </div>
      )}
      {run.predictions.length > 0 && (
        <table className="w-full max-w-2xl text-sm" data-testid="mlp-before-after">
          <caption className="mb-2 text-left text-label text-muted-foreground">Before and after training: p(correct character) on the first validation examples</caption>
          <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Window → next</th><th scope="col" className="text-right font-normal">Initial</th><th scope="col" className="text-right font-normal">Trained</th></tr></thead>
          <tbody>{run.predictions.map((r, i) => (
            <tr key={i} className="border-t border-rule"><td className="py-1.5"><span className="inline-flex gap-1">{r.window.map((c, j) => <Tok key={j} tone="context">{c}</Tok>)} → <Tok tone="chosen">{r.target}</Tok></span></td><td className="num py-1.5 text-right">{r.initial.pTarget.toFixed(4)}</td><td className="num py-1.5 text-right font-medium">{r.trained.pTarget.toFixed(4)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <div className="flex flex-col gap-3">
        <Button variant="outline" className="w-fit" data-help-id="mlp.compare" onClick={compare} disabled={!run.fingerprints.trained}>Compare with the bigram</Button>
        {cmp && cmp.run === run.id && (
          <div className="flex flex-col gap-2" data-testid="mlp-compare">
            <table className="w-full max-w-2xl text-sm">
              <caption className="mb-2 text-left text-label text-muted-foreground">Mean loss in nats (lower is better), {cmp.rule}</caption>
              <thead><tr className="text-left text-label text-muted-foreground"><th scope="col" className="font-normal">Part</th><th scope="col" className="text-right font-normal">MLP, initial</th><th scope="col" className="text-right font-normal">MLP, last</th>{cmp.best && <th scope="col" className="text-right font-normal">MLP, selected<span className="block">(update {fmt.n(cmp.best.step)})</span></th>}<th scope="col" className="text-right font-normal">Bigram</th><th scope="col" className="text-right font-normal">Bigram, add-1</th></tr></thead>
              <tbody>{cmp.rows.map((r) => (
                <tr key={r.part} className="border-t border-rule"><th scope="row" className="py-1.5 text-left font-normal">{r.part === "val" ? "Validation" : "Test"} <span className="num text-muted-foreground">({fmt.n(r.targets)}{r.unknownTargets ? `, ${fmt.n(r.unknownTargets)} unseen` : ""})</span></th>
                  <td className="num py-1.5 text-right">{r.mlp_initial?.toFixed(3) ?? "–"}</td><td className="num py-1.5 text-right">{r.mlp_trained?.toFixed(3) ?? "–"}</td>{cmp.best && <td className="num py-1.5 text-right font-medium">{r.mlp_best?.toFixed(3) ?? "–"}</td>}
                  <td className="num py-1.5 text-right">{r.bigram == null ? "∞" : r.bigram.toFixed(3)}</td><td className="num py-1.5 text-right">{r.bigram_add1?.toFixed(3) ?? "–"}</td></tr>
              ))}</tbody>
            </table>
            <p className="text-label text-muted-foreground">Equal guessing: {cmp.uniform.toFixed(3)}. {cmp.note}</p>
            {cmp.policy && (
              <details className="text-label text-muted-foreground" data-testid="mlp-compare-policy">
                <summary className="w-fit cursor-pointer py-1 font-medium hover:text-foreground">How the comparison is kept fair</summary>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                  <li>Vocabulary: {cmp.policy.vocabulary}.</li>
                  <li>Unseen characters: {cmp.policy.unknown}.</li>
                  <li>Smoothing: {cmp.policy.smoothing}.</li>
                  <li>Choosing the checkpoint: {cmp.policy.selection}.</li>
                  <li>Targets: {cmp.policy.targets}.</li>
                  <li>The MLP doesn’t have to win: on a small text the bigram can match or beat it.</li>
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- the explanation column

interface Copy { happening: ReactNode; why: ReactNode; tryIt: ReactNode; expect: ReactNode; terms: string[] }

function stageCopy(id: StageId, run: MlpRun, ins: Inspection | null, cp: Checkpoint): Copy {
  const c = run.config
  const p = ins?.probs.target
  switch (id) {
    case "text": return {
      happening: <p>The text is cut into three parts before anything else: {fmt.n(run.split.train)} characters to learn from, {fmt.n(run.split.val)} to check on while training, and {fmt.n(run.split.test)} kept for one final comparison.</p>,
      why: <p>A model can look good on text it memorised. Checking on text it never learned from is the only fair way to see whether it learned something general.</p>,
      tryIt: <p>Look at the vocabulary: these are the only characters the MLP can ever write.</p>,
      expect: <p>{run.vocabSize} tokens: {run.vocabSize - 2} characters from the training part plus ⟨start⟩ and ⟨?⟩. A character found only in validation or test text isn’t there.</p>,
      terms: ["split", "vocabulary"],
    }
    case "examples": return {
      happening: <p>A window of {c.context} previous {c.context === 1 ? "character" : "characters"} is the input; the character after it is the answer the MLP should learn to give. {ins && <>Here: {ins.window.map(q).join(" ")} → {q(ins.target)}.</>}</p>,
      why: <p>The bigram looked at one character; this MLP looks at {c.context}. It still has no idea of meaning: only these characters, as numbers.</p>,
      tryIt: <p>Select a neighbouring example and see the window slide by one character.</p>,
      expect: <p>The next example’s window drops its oldest character and gains this example’s answer{ins ? <> ({q(ins.target)})</> : null}.</p>,
      terms: ["training-pair", "context-window"],
    }
    case "embeddings": return {
      happening: <p>Each character in the window is replaced by its own list of {c.embed} numbers, its embedding. The lists are joined into one list of {c.context * c.embed} numbers.</p>,
      why: <p>A network can only do arithmetic. Embeddings start random{cp === "trained" ? " and have been adjusted by training" : ""}; characters that behave alike tend to end up with similar numbers.</p>,
      tryIt: <p>Switch between the initial and trained weights and compare the same character's numbers.</p>,
      expect: <p>The numbers differ: training changed this character’s embedding. The joined list always has {c.context * c.embed} numbers.</p>,
      terms: ["embedding", "token-id"],
    }
    case "hidden": return {
      happening: <p>The hidden layer mixes all {c.context * c.embed} input numbers into {c.hidden} new ones: each is a weighted sum plus a bias, then tanh squeezes it between −1 and 1.</p>,
      why: <p>tanh is the nonlinear step. Without it, the whole network would be one straight-line formula and could learn far less.</p>,
      tryIt: <p>Find a value beyond ±0.97 on the curve: there, changing the input barely changes the output.</p>,
      expect: <p>Every value after tanh is between −1 and 1. {ins ? <>For this example, {ins.hiddenStats.saturated} of {ins.hiddenStats.size} are beyond ±0.97.</> : null}</p>,
      terms: ["hidden-layer", "activation"],
    }
    case "predictions": return {
      happening: <p>The output layer gives one score per token; softmax turns the scores into probabilities. {p != null && <>The correct {q(ins!.target)} gets {p.toFixed(4)}.</>}</p>,
      why: <p>Unlike the bigram's counts, softmax never gives exactly 0, so the MLP always leaves a little probability for every character.</p>,
      tryIt: <p>Compare initial and trained weights: the initial ones spread probability almost evenly.</p>,
      expect: <p>With initial weights the bars are all close to {ins ? ins.probs.uniform.toFixed(4) : "1 ÷ vocabulary size"}; with trained weights a few characters take most of the probability.</p>,
      terms: ["logits", "softmax"],
    }
    case "loss": return {
      happening: <p>The loss is −ln of the probability given to the correct character{p != null ? <>: −ln({p.toFixed(4)}) = {ins!.loss.toFixed(4)}</> : null}. 0 would mean certainty about the right answer.</p>,
      why: <p>Training lowers the average loss on the training examples. If validation loss rises while training loss falls, the MLP is memorising instead of generalising.</p>,
      tryIt: <p>Pick a validation example and compare its loss with a training example's.</p>,
      expect: <p>With trained weights, validation examples usually have a higher loss than training examples: the curve above shows {run.curve.at(-1) ? <>training {run.curve.at(-1)!.train.toFixed(3)} and validation {run.curve.at(-1)!.val?.toFixed(3) ?? "–"}</> : "both averages"}. Single examples vary.</p>,
      terms: ["cross-entropy", "loss", "overfitting"],
    }
    case "update": return {
      happening: <p>Backpropagation computes how the loss would change if each weight changed slightly: its gradient. Every weight then moves by −{c.lr} × its gradient.</p>,
      why: <p>One update raises the correct character's probability a little on this example. Training repeats this {fmt.n(c.steps)} times, on batches of {c.batch} examples.</p>,
      tryIt: <p>Check one row: before − {c.lr} × gradient should equal after.</p>,
      expect: <p>The loss for this example goes down after the update{ins ? <> ({ins.loss.toFixed(4)} → {ins.update.lossAfter.toFixed(4)})</> : null}. A negative gradient makes a weight larger.</p>,
      terms: ["gradient", "backpropagation", "learning-rate"],
    }
    case "generation": return {
      happening: <p>To write, the MLP predicts a distribution, a seeded random draw picks a character, and the window slides to include it. Then it repeats.</p>,
      why: <p>The comparison scores the MLP and the bigram on the same validation and test targets, so their losses can be compared directly.</p>,
      tryIt: <p>Generate with the initial weights, then with the trained ones, using the same seed.</p>,
      expect: <p>Initial weights write random characters; trained weights write word-like pieces of the training text. The same seed and weights always give the same text.</p>,
      terms: ["autoregressive", "sampling", "baseline"],
    }
  }
}

function Explanation({ id, label, run, ins, cp, target }: { id: StageId; label: string; run: MlpRun; ins: Inspection | null; cp: Checkpoint; target: AssistTarget | null }) {
  const copy = stageCopy(id, run, ins, cp)
  return (
    <ExplanationPanel title={label} testid="mlp-explanation"
      tutor={{ target, off: "The tutor needs a trained run and an example on screen. Train a run, or wait for training to finish." }}>
      <div className="measure flex flex-col gap-4 text-prose" data-testid="mlp-explanation-body">
        <div className="flex flex-col gap-1.5"><h3 className="font-semibold">What is happening</h3>{copy.happening}</div>
        <div className="flex flex-col gap-1.5 border-t border-companion-edge pt-4"><h3 className="font-semibold">Why it matters</h3>{copy.why}</div>
        <TryThis>{copy.tryIt}</TryThis>
        <div className="flex flex-col gap-1.5" data-testid="mlp-expect"><h3 className="font-semibold">What you should see</h3>{copy.expect}</div>
      </div>
      <details className="border-t border-companion-edge pt-4 text-prose">
        <summary className="cursor-pointer py-1 text-label font-medium text-muted-foreground hover:text-foreground">Words used here ({copy.terms.length})</summary>
        <ul className="measure mt-2 flex flex-col gap-2">{copy.terms.map((t) => <li key={t}><Term id={t} className="font-medium">{findTerm(t)?.term}</Term>: {findTerm(t)?.plain}</li>)}</ul>
      </details>
    </ExplanationPanel>
  )
}
