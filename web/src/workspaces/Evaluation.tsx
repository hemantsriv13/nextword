import { useCallback, useMemo, useRef, useState } from "react"
import { DownloadIcon, PlayIcon, RefreshDoubleIcon, TrashIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { LineChart, Tok } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { api, type Evaluation as EvalResult } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { changedSettings, describeConfig, rerunVerdict, sameConfig, splitProblem, testShare, useSnapshotRun, type EvalConfig, type Snapshot } from "@/lib/evaluation"
import { fmt } from "@/lib/hooks"
import { actions, download, useLab, type SavedExperiment } from "@/lib/store"
import { cn } from "@/lib/utils"
import { InfoTip } from "@/components/lab/info-tip"
import { MathHelp, TermHelp } from "@/components/lab/term-help"

type Config = EvalConfig
type Measured = Snapshot<Config, EvalResult>

function summarise(r: EvalResult): SavedExperiment["result"] {
  return { targets: r.targets, meanNll: r.meanNll, meanNllCovered: r.meanNllCovered, perplexity: r.perplexity, unseenContext: r.unseenContext, unseenPair: r.unseenPair, covered: r.covered, modelVersion: r.modelVersion, corpusFingerprint: r.corpusFingerprint }
}

const MISSING = "This view appears after a measurement. Press Measure on validation in the settings panel (it only reads your engine's counts, nothing random), then press Next or Back to return here."

const GUIDE: Guide = {
  question: "How good is your engine at predicting text it has never counted, and when is one score really better than another?",
  scope: "Every number is from your Python engine. The training part is counted by the engine itself; the held-out part is scored with those counts. Smoothing with k above 0 is a Lab-side variant of the engine for scoring only; with k = 0 the scoring is exactly the engine as implemented.",
  sources: ["model"],
  nodes: [
    { id: "split", label: "Split the text", kind: "input", target: "config", carries: "three parts",
      goesIn: "A training text and the shares for training, validation and test.",
      happens: "The text is cut into three consecutive parts, in that order.",
      why: "A model must be scored on text it did not learn from, or the score only measures memory.",
      comesOut: "A training part, a validation part and a test part.",
      next: "Only the training part is counted." },
    { id: "count", label: "Count the training part", kind: "operation", target: "config", carries: "counts",
      goesIn: "The training part.",
      happens: "Your engine's count_bigrams, on that part only.",
      why: "The validation and test parts must stay unseen.",
      comesOut: "A count table that knows nothing about the held-out text.",
      next: "Each held-out pair is scored with it." },
    { id: "score", label: "Score each next character", kind: "operation", target: "examples", carries: "one probability each",
      goesIn: "Every neighbouring pair in the held-out part: the current character, and the character that really came next.",
      happens: "The probability the counts give to the character that really came next is looked up.",
      why: "The prediction being scored is “what comes next?”. The character that actually came next is the right answer, so its probability is the model's credit.",
      comesOut: "One probability per held-out pair.",
      next: "Each becomes a loss: −log p." },
    { id: "loss", label: "−log p, then the average", kind: "operation", target: "summary", carries: "one number",
      goesIn: "The probabilities.",
      happens: "Each is turned into −log p (0 when p = 1, large when p is small, infinite when p = 0) and the results are averaged.",
      why: "Logs turn the product of many probabilities into a sum, and the average makes texts of different lengths comparable.",
      comesOut: "Mean negative log-likelihood, in nats, and perplexity = e to that power.",
      next: "It is compared: with the uniform baseline, with other k, with a saved run." },
    { id: "compare", label: "Compare fairly", kind: "operation", target: "ablation", carries: "a choice of k",
      goesIn: "Several runs that differ in one setting.",
      happens: "The smoothing sweep changes only k and scores every run on validation.",
      why: "Changing one thing at a time is what makes a difference attributable to it.",
      comesOut: "The k with the lowest validation loss.",
      next: "One final check on the test part." },
    { id: "test", label: "Final test check", kind: "output", target: "config",
      goesIn: "The chosen settings.",
      happens: "The same scoring, once, on the test part.",
      why: "Validation was used to choose k, so its score is now slightly optimistic. The untouched test part gives an independent estimate.",
      comesOut: "The number you report.",
      next: "Nothing: tuning again after looking at it would use up its independence." },
  ],
  tour: [
    { target: "config", title: "Three parts of one text", plain: <><p>The text is cut into training, validation and test parts, in order. Your engine counts only the training part. The other two are text it has never seen.</p><p>Validation is for trying settings. Test is for one final check, after the settings are chosen.</p></>,
      terms: [{ id: "split", role: "training, validation and test parts." }] },
    { target: "examples", missing: MISSING, title: "Score the character that really came next", plain: <><p>For every pair in the held-out part, the engine is asked: after this character, how likely is the character that actually followed? That probability is the model's credit for this one prediction.</p><p>Its loss is −log p: 0 for a certain, correct prediction, larger the less probability it gave. A pair it never saw in training gets p = 0 and an infinite loss unless smoothing is on.</p></>,
      terms: [{ id: "loss", role: "−log p for one prediction." }, { id: "error-analysis", role: "reading the worst predictions." }] },
    { target: "summary", missing: MISSING, title: "From many losses to one number", plain: <><p>The losses of all held-out predictions are averaged. That mean is in nats. Perplexity is e raised to it: roughly, how many characters the model is as unsure as if it picked uniformly among that many.</p><p>Compare it with the uniform baseline, a model that knows nothing. Comparisons are only fair on the same text, the same split and the same tokenizer.</p></>,
      terms: [{ id: "cross-entropy", role: "the mean −log p." }, { id: "perplexity", role: "e to the mean loss." }, { id: "baseline", role: "the uniform guess to beat." }] },
    { checkpoint: "evaluation.validation", target: "ablation", title: "Change one thing: k", plain: <><p>The sweep changes only the smoothing strength k and scores each run on validation. The lowest validation loss suggests a k.</p><p>Choosing k by looking at validation makes that score a little optimistic, which is why the test part is kept for one final check.</p></>,
      terms: [{ id: "ablation", role: "only k varies." }, { id: "smoothing", role: "the setting being chosen." }] },
    { target: "saved", title: "Keep results with their settings", plain: <><p>Saved runs keep the exact settings and text fingerprint they were measured with. Rerun one to check it reproduces: the same text and settings must give the same number.</p></>,
      terms: [{ id: "reproducibility", role: "same inputs, same result." }] },
  ],
}

export default function Evaluation() {
  const [config, setConfig] = useState<Config>({ corpus: "sample", train: 0.8, val: 0.1, on: "val", k: 0 })
  const request = useCallback((c: Config) => api.evaluate({ corpus: c.corpus, train: c.train, val: c.val, on: c.on, k: c.k }), [])
  const bench = useSnapshotRun(request)
  const { corpora } = useCorpora()
  const nameOf = (id: string) => corpora?.find((c) => c.id === id)?.name
  const measured = bench.run
  const stale = !!measured && !sameConfig(measured.config, config)
  const set = <K extends keyof Config>(key: K, v: Config[K]) => setConfig((c) => ({ ...c, [key]: v }))
  const problem = splitProblem(config)

  async function run(c: Config = config) {
    const done = await bench.start(c)
    if (done) actions.logRun({ route: "evaluation", title: `Held-out loss on ${done.config.on}`, summary: `k ${done.config.k}: ${done.result.meanNll === null ? "infinite" : done.result.meanNll.toFixed(3)} nats`, source: "model" }, ["loss", "split", ...(done.config.k > 0 ? ["smoothing"] : [])])
    return done?.result
  }

  const r = measured?.result
  const runK = measured?.config.k

  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Evaluation bench"
      subtitle="Measure your engine on text it never counted. Every number comes from your Python engine."
      explain={<EvalExplain />}
    >
      <WorkspaceGuide />
      <Panel id="config" title="Experiment settings" source={<Source kind="model" detail="nextword/lab/service.py evaluate()" />}
        aside={<Button data-help-id="evaluation.measure" onClick={() => run()} disabled={!!problem || !!bench.pending}><PlayIcon className="size-4" /> {bench.pending ? "Measuring…" : config.on === "test" ? "Run the final test check" : "Measure on validation"}</Button>}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-0.5"><span id="ev-corpus" className="text-sm font-medium">Training text</span><InfoTip id="evaluation.corpus" /></span>
            <Select value={config.corpus} onValueChange={(v) => set("corpus", String(v))} items={(corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}>
              <SelectTrigger aria-labelledby="ev-corpus" data-help-id="evaluation.corpus"><SelectValue /></SelectTrigger>
              <SelectContent>{(corpora ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <SliderField id="ev-train" helpId="evaluation.split" label="Training share" value={config.train} min={0.5} max={0.9} step={0.05} onChange={(v) => set("train", v)} format={(v) => fmt.pct(v, 0)} />
          <SliderField id="ev-val" helpId="evaluation.split" label="Validation share" value={config.val} min={0.05} max={0.3} step={0.05} onChange={(v) => set("val", v)} format={(v) => fmt.pct(v, 0)} hint={problem ?? `Test gets the remaining ${fmt.pct(testShare(config), 0)}.`} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Measure on</span>
            <Segmented label="Measure on" helpId="evaluation.on" value={config.on} onChange={(v) => set("on", v)} options={[{ value: "val", label: "Validation" }, { value: "test", label: "Test (final check)" }]} />
            {config.on === "test" && <p className="text-label text-warning">Test is for one final check, after you&apos;ve chosen settings on validation. Changing settings because of a test score makes the test part of tuning.</p>}
          </div>
          <SliderField id="ev-k" helpId="evaluation.k" label={<><Term id="smoothing">Smoothing</Term> k</>} value={config.k} min={0} max={3} step={0.05} onChange={(v) => set("k", v)} format={(v) => (v === 0 ? "0 (engine as built)" : v.toFixed(2))} hint="k = 0 is your engine exactly. k > 0 is a Lab-side add-k variant used only for evaluation." />
        </div>
        <p className="mt-4 text-label text-muted-foreground">The text is cut into three contiguous parts before any pairs are made, so no pair crosses a split. Only the training part is counted.</p>
        {bench.pending && <p role="status" className="mt-2 text-sm">Measuring {describeConfig(bench.pending, nameOf(bench.pending.corpus))}. Changing the controls now won&apos;t relabel this result.</p>}
      </Panel>

      {bench.error ? <ErrorNote error={bench.error} onRetry={() => run()} /> : bench.pending && !measured ? <LoadingRows rows={5} /> : measured ? <Results run={measured} stale={stale} changed={stale ? changedSettings(measured.config, config) : []} corpusName={nameOf(measured.config.corpus)} /> : (
        <EmptyNote>Press Measure. The bench reports how surprised your engine is by each character of held-out text.</EmptyNote>
      )}

      <Ablation config={config} corpusName={nameOf} />
      <SavedRuns onRerun={async (c) => { setConfig(c); return run(c) }} />

      <GuidedCycle
        id="eval"
        conceptId="loss"
        route="evaluation"
        question="With k = 0 (your engine as built), will the validation loss be a finite number?"
        choices={[{ id: "finite", label: "Yes, a finite number" }, { id: "infinite", label: "No, it will be infinite" }]}
        correct={r && runK === 0 && measured?.config.on === "val" ? (r.meanNll === null ? "infinite" : "finite") : undefined}
        observation={r && runK === 0 && measured?.config.on === "val" ? <>For the run with {describeConfig(measured.config, nameOf(measured.config.corpus))}: {r.unseenContext + r.unseenPair} of {r.targets} validation targets got probability 0 ({r.unseenContext} unseen contexts, {r.unseenPair} unseen pairs). One zero makes −log p infinite, so the mean is {r.meanNll === null ? "infinite" : r.meanNll.toFixed(3)}.</> : undefined}
        explainPrompt="Why does a single unseen pair make the whole average infinite? What does smoothing trade away to fix it?"
        change="Set k to 1 and measure again. Then run the k sweep below and find the k with the lowest validation loss."
        hints={["−log(0) is infinite.", "An average that includes an infinite term is infinite."]}
      />
    </Workspace>
    </Teach>
  )
}

/** The scoring formula for one example, with the formula this run actually used. */
function ExampleCalc({ run }: { run: Measured }) {
  const r = run.result
  const e = r.examples.find((x) => x.nll !== null) ?? r.examples[0]
  const k = run.config.k
  if (!e) return <p>No examples were scored.</p>
  return (
    <>
      <Symbols rows={[
        ["context", "the current character in the held-out text", e.context],
        ["target", "the character that really came next: the right answer", e.target],
        ["p", k === 0 ? "count(context → target) ÷ total(context), from the training part only" : `(count + ${k}) ÷ (total + ${k} × ${r.vocabularyWithUnknown}), add-k smoothing`, e.p.toFixed(4)],
        ["loss", `−log(${e.p.toFixed(4)})`, e.nll === null ? "∞" : e.nll.toFixed(4)],
      ]} />
      <p>This is the first scored pair of the run ({describeConfig(run.config)}). {k === 0 ? "With k = 0 the engine's own division is used, so an unseen pair has p = 0." : `With k = ${k} every pair gets at least ${k} ÷ (total + ${k} × ${r.vocabularyWithUnknown}), so no loss is infinite.`}</p>
    </>
  )
}

function SummaryCalc({ run, label }: { run: Measured; label: string }) {
  const r = run.result
  return (
    <>
      <Symbols rows={[
        ["N", "held-out predictions scored", fmt.n(r.targets)],
        ["mean loss", "(1 ÷ N) × the sum of −log p over all of them", r.meanNll === null ? `∞ (${r.targets - r.covered} had p = 0)` : `${r.meanNll.toFixed(4)} nats`],
        ["perplexity", "exp(mean loss): e to the mean loss", r.perplexity === null ? "∞ (the mean loss is infinite)" : r.perplexity.toFixed(3)],
        ["baseline", `−log(1 ÷ ${r.vocabularyWithUnknown}): a uniform guess over ${r.vocabularyWithUnknown} characters`, `${r.uniformBaselineNll.toFixed(4)} nats`],
      ]} />
      <p>For {label}. A lower loss is better, but only against runs on the same text, the same split and the same character tokens; a different tokenizer changes N and the meaning of one prediction.</p>
    </>
  )
}

function Results({ run, stale, changed, corpusName }: { run: Measured; stale: boolean; changed: string[]; corpusName?: string }) {
  const r = run.result
  const config = run.config // the settings that produced r, never the live controls
  const label = describeConfig(config, corpusName)
  const [sort, setSort] = useState<"worst" | "order">("worst")
  const [notes, setNotes] = useState("")
  const [name, setName] = useState("")
  const rows = useMemo(() => {
    const ex = r.examples.map((e, i) => ({ ...e, i }))
    if (sort === "worst") ex.sort((a, b) => (b.nll ?? Infinity) - (a.nll ?? Infinity) || a.i - b.i)
    return ex.slice(0, 60)
  }, [r, sort])
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Panel id="summary" variant="canvas" title={`Held-out loss on ${config.on === "val" ? "validation" : "test"}`} source={<Source kind="model" detail={r.modelVersion} />}
        teach={{
          calc: <SummaryCalc run={run} label={label} />,
          code: <EngineCode path="nextword/lab/service.py" symbol="evaluate" />,
        }}>
        <p className="mb-4 text-sm" data-testid="result-settings">For: {label}</p>
        {stale && (
          <div className="mb-4"><Note tone="warning">Settings changed since this run ({changed.join(", ")}). These numbers still belong to the settings above. Measure again to see the new ones.</Note></div>
        )}
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Mean <TermHelp id="nll" here={<>Each of the {fmt.n(r.targets)} held-out characters is scored by −ln of the probability your engine gave it. The big number is their average.</>} example={<NllExample r={r} />}>negative log-likelihood (NLL)</TermHelp> per character</dt>
            <dd className="num text-[28px] leading-tight">{r.meanNll === null ? "∞" : r.meanNll.toFixed(3)} <TermHelp id="nats" className="text-base text-muted-foreground" here="Each score is −ln p, computed with Python's math.log, which uses base e. So the loss is in nats." example={<>A uniform guess over the {r.vocabularyWithUnknown} possible characters gives every one p = 1/{r.vocabularyWithUnknown}, which costs ln {r.vocabularyWithUnknown} = <span className="num">{r.uniformBaselineNll.toFixed(3)}</span> nats per character. {r.meanNll === null ? "This run's mean is infinite, so it cannot be compared with that yet." : <>This run averages <span className="num">{r.meanNll.toFixed(3)}</span> nats.</>}</>}>nats</TermHelp></dd>
            {r.meanNll === null && r.meanNllCovered !== null && <dd className="text-sm">Infinite because {r.targets - r.covered} targets had probability 0. On the {r.covered} that didn&apos;t: <span className="num">{r.meanNllCovered.toFixed(3)}</span> nats, which is not a fair score on its own (it ignores the failures).</dd>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-label text-muted-foreground"><TermHelp id="perplexity" here="The same measurement as the mean NLL above, put on a scale of choices. It compares fairly only with runs on the same text, split and character tokens." example={<PerplexityExample r={r} />}>Perplexity</TermHelp></dt>
              <dd className="num text-xl">{r.perplexity === null ? "∞" : r.perplexity.toFixed(2)}</dd>
              <dd className="text-label text-muted-foreground">= <MathHelp id="exp" here="It undoes the ln inside each NLL score, turning the average loss back into a number of effective choices.">exp</MathHelp>(mean <MathHelp id="nll" here="The mean negative log-likelihood above, in nats." example={<NllExample r={r} />}>NLL</MathHelp>)</dd>
            </div>
            <div><dt className="text-label text-muted-foreground">Uniform guess (<Term id="baseline">baseline</Term>)</dt><dd className="num text-xl">{r.uniformBaselineNll.toFixed(3)} <span className="text-sm text-muted-foreground">nats</span></dd></div>
            <div><dt className="text-label text-muted-foreground">Targets scored</dt><dd className="num text-xl">{fmt.n(r.targets)}</dd></div>
            <div><dt className="text-label text-muted-foreground">Unseen context / pair</dt><dd className="num text-xl">{r.unseenContext} / {r.unseenPair}</dd></div>
          </div>
          <div className="text-label text-muted-foreground">
            Split: {fmt.n(r.split.train)} training, {fmt.n(r.split.val)} validation, {fmt.n(r.split.test)} test characters. k = {r.k}. Corpus fingerprint <span className="tok">{r.corpusFingerprint}</span>.
          </div>
          {r.meanNll !== null && <p className="text-sm">{r.meanNll < r.uniformBaselineNll ? `Better than guessing uniformly among ${r.vocabularyWithUnknown} characters by ${(r.uniformBaselineNll - r.meanNll).toFixed(3)} nats.` : "Not better than a uniform guess: the counts don't transfer to this text."}</p>}
        </dl>
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <label htmlFor="ev-name" className="text-sm font-medium">Save this run <span className="font-normal text-muted-foreground">({label})</span></label>
          <input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`k ${config.k}, ${config.on}`} className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
          <label htmlFor="ev-notes" className="text-sm font-medium">Error-analysis notes</label>
          <Textarea id="ev-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do the worst examples have in common?" />
          <Button data-help-id="evaluation.save" className="self-start" variant="outline" onClick={() => { actions.saveExperiment({ name: name || `k ${config.k}, ${config.on}`, config, result: summarise(r), notes }); setName(""); setNotes("") }}>Save run</Button>
        </div>
      </Panel>
      <Panel id="examples" title="Per-example loss" source={<Source kind="model" />}
        teach={{ calc: <ExampleCalc run={run} />, code: <EngineCode path="nextword/lab/service.py" symbol="evaluate" /> }} aside={<Segmented label="Order" helpId="evaluation.sort" value={sort} onChange={setSort} options={[{ value: "worst", label: "Worst first" }, { value: "order", label: "Text order" }]} />}>
        <p className="mb-3 text-sm text-muted-foreground"><Term id="error-analysis">Error analysis</Term> starts here: which characters surprised the engine most, and why.</p>
        <div className="max-h-[480px] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Loss for each held-out pair</caption>
            <thead className="sticky top-0 bg-card"><tr className="text-label text-muted-foreground"><th className="px-3 py-2 text-right font-normal">#</th><th className="px-3 py-2 text-left font-normal">Context → target</th><th className="px-3 py-2 text-right font-normal">p(target)</th><th className="px-3 py-2 text-right font-normal">−<MathHelp id="ln" here="Here log is the natural log, ln: your engine uses Python's math.log, base e. So −log p is the target's NLL, in nats." example={<NllExample r={r} />}>log</MathHelp> p</th><th className="px-3 py-2 text-left font-normal">Why</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.i} className="border-t border-rule">
                  <td className="num px-3 py-1 text-right text-muted-foreground">{e.i + 1}</td>
                  <td className="px-3 py-1"><Tok tone="context">{e.context}</Tok> → <Tok>{e.target}</Tok></td>
                  <td className="num px-3 py-1 text-right">{e.p.toFixed(4)}</td>
                  <td className={cn("num px-3 py-1 text-right", e.nll === null && "text-negative")}>{fmt.nll(e.nll)}</td>
                  <td className="px-3 py-1 text-label text-muted-foreground">{e.reason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-label text-muted-foreground">Showing {rows.length} of {fmt.n(r.targets)}.</p>
      </Panel>
    </div>
  )
}

/** One held-out target from the displayed run, worked through, then the mean. */
function NllExample({ r }: { r: EvalResult }) {
  const e = r.examples.find((x) => x.nll !== null)
  const zeros = r.targets - r.covered
  return (
    <>
      {e && <p>After <Tok tone="context">{e.context}</Tok>, the actual next character <Tok>{e.target}</Tok> got p = <span className="num">{e.p.toFixed(4)}</span>, so its NLL is −ln({e.p.toFixed(4)}) = <span className="num">{e.nll!.toFixed(3)}</span> nats.</p>}
      {r.meanNll !== null
        ? <p className="mt-1">Averaging all {fmt.n(r.targets)} targets gives <span className="num">{r.meanNll.toFixed(3)}</span> nats.</p>
        : <p className="mt-1">{zeros} {zeros === 1 ? "target" : "targets"} got p = 0, and −ln(0) is infinite, so the mean is ∞ too. The engine reports it as null, which here means infinite, not missing.</p>}
    </>
  )
}

function PerplexityExample({ r }: { r: EvalResult }) {
  const v = r.vocabularyWithUnknown
  if (r.meanNll === null || r.perplexity === null) {
    return <p>Mean NLL is infinite in this run, so perplexity is too: exp(∞) = ∞. Raise smoothing k above 0 to give unseen pairs some probability, and both become finite.</p>
  }
  return <p>exp(<span className="num">{r.meanNll.toFixed(3)}</span>) = <span className="num">{r.perplexity.toFixed(2)}</span>. A uniform guess over {v} characters would score exactly {v}. That does not mean {r.perplexity.toFixed(1)} candidates at every step, or any accuracy figure.</p>
}

const SWEEP = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]

interface Sweep {
  config: Omit<Config, "k" | "on"> & { on: "val" } // the settings the sweep actually used
  points: { k: number; nll: number | null }[]
  done: boolean
  error?: Error
}

function Ablation({ config, corpusName }: { config: Config; corpusName: (id: string) => string | undefined }) {
  const [sweep, setSweep] = useState<Sweep | null>(null)
  const latest = useRef(0)
  const problem = splitProblem(config)
  async function start() {
    if (problem) return
    // Parameter sweeps always select on validation; the test split stays untouched for a final check.
    const frozen = Object.freeze({ corpus: config.corpus, train: config.train, val: config.val, on: "val" as const })
    const id = ++latest.current
    const out: Sweep["points"] = []
    setSweep({ config: frozen, points: [], done: false })
    try {
      for (const k of SWEEP) {
        const r = await api.evaluate({ ...frozen, k })
        if (id !== latest.current) return
        out.push({ k, nll: r.meanNll })
        setSweep({ config: frozen, points: [...out], done: false })
      }
      setSweep({ config: frozen, points: out, done: true })
      actions.logRun({ route: "evaluation", title: "Smoothing ablation on validation", summary: fixed(frozen), source: "model" }, ["ablation", "smoothing"])
    } catch (e) {
      if (id === latest.current) setSweep({ config: frozen, points: out, done: false, error: e as Error })
    }
  }
  const running = !!sweep && !sweep.done && !sweep.error
  const finite = sweep?.points.filter((p) => p.nll !== null) ?? []
  const best = finite.length ? finite.reduce((m, p) => (p.nll! < m.nll! ? p : m)) : null
  function fixed(c: Sweep["config"]) {
    return `${corpusName(c.corpus) ?? c.corpus}, ${fmt.pct(c.train, 0)} / ${fmt.pct(c.val, 0)} / ${fmt.pct(testShare(c), 0)} split, scored on validation`
  }
  const moved = !!sweep && (sweep.config.corpus !== config.corpus || sweep.config.train !== config.train || sweep.config.val !== config.val)
  return (
    <Panel id="ablation" title="Controlled ablation: only k changes"
      teach={{
        calc: sweep && best && sweep.done ? <Symbols rows={[
          ["held fixed", "everything except k", fixed(sweep.config)],
          ...sweep.points.map((pt) => [`k = ${pt.k}`, "mean validation loss", pt.nll === null ? "∞" : pt.nll.toFixed(4)] as [string, string, string]),
          ["lowest", "the k this sweep suggests", `k = ${best.k}`],
        ]} /> : <p>Run the sweep; its numbers and the settings it held fixed appear here.</p>,
      }} source={<Source kind="model" detail={`${SWEEP.length} runs of your engine, on validation`} />}
      aside={<Button variant="outline" data-help-id="evaluation.sweep" onClick={start} disabled={running || !!problem}><RefreshDoubleIcon className="size-4" /> {running ? `Running ${sweep!.points.length} of ${SWEEP.length}…` : "Run the k sweep on validation"}</Button>}>
      <p className="text-sm">Varies smoothing k over {SWEEP.join(", ")} and keeps everything else fixed. It always scores on the validation part, whatever “Measure on” is set to, because choosing k with test results would make the test part of tuning.</p>
      {problem && <p role="alert" className="mt-2 text-sm text-negative">{problem}</p>}
      {config.on === "test" && !problem && <p className="mt-2 text-sm text-warning">“Measure on” is set to Test. The sweep still uses validation; run the test check above once, after choosing k.</p>}
      {sweep?.error && <div className="mt-3"><ErrorNote error={sweep.error} onRetry={start} /></div>}
      {sweep && sweep.points.length > 0 && (
        <>
          <p className="mt-4 text-sm" data-testid="sweep-settings">Held fixed in this sweep: {fixed(sweep.config)}, same engine version.</p>
          {moved && <div className="mt-2"><Note tone="warning">The controls have changed since this sweep. Its numbers still belong to the settings above.</Note></div>}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <LineChart ariaLabel="Validation loss for each smoothing strength" series={[{ name: "validation loss", tone: "data", points: finite.map((p) => ({ x: p.k, y: p.nll! })) }]} xLabel="smoothing k" yLabel="nats" height={200} xFormat={(x) => String(+x.toFixed(2))} />
            <table className="text-sm">
              <thead><tr className="text-label text-muted-foreground"><th className="text-right font-normal">k</th><th className="text-right font-normal">validation loss (nats)</th></tr></thead>
              <tbody>{sweep.points.map((p) => <tr key={p.k} className={cn("border-t border-rule", best?.k === p.k && "font-semibold")}><td className="num py-0.5 text-right">{p.k}</td><td className="num text-right">{fmt.nll(p.nll)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {best && sweep?.done && <p className="mt-3 text-sm" data-testid="sweep-conclusion">Lowest validation loss at k = {best.k} ({best.nll!.toFixed(3)} nats). Choosing k this way uses the validation text, so that score is optimistic; measure the chosen k once on the test split for an independent check. Tuning again after looking at the test score would use up that independence.</p>}
    </Panel>
  )
}

function SavedRuns({ onRerun }: { onRerun: (c: Config) => Promise<EvalResult | undefined> }) {
  const experiments = useLab((s) => s.experiments)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [repro, setRepro] = useState<Record<string, { kind: string; message: string }>>({})
  const a = experiments.find((e) => e.id === baseline)
  const b = experiments.find((e) => e.id === candidate)

  function exportJson() {
    download("nextword-experiments.json", JSON.stringify(experiments, null, 2))
  }
  function exportCsv() {
    const head = ["name", "created", "corpus", "train", "val", "on", "k", "targets", "mean_nll", "perplexity", "unseen_context", "unseen_pair", "model_version", "corpus_fingerprint", "notes"]
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = experiments.map((e) => [e.name, e.createdAt, e.config.corpus, e.config.train, e.config.val, e.config.on, e.config.k, e.result.targets, e.result.meanNll ?? "inf", e.result.perplexity ?? "", e.result.unseenContext, e.result.unseenPair, e.result.modelVersion, e.result.corpusFingerprint, e.notes].map(esc).join(","))
    download("nextword-experiments.csv", [head.join(","), ...lines].join("\n"), "text/csv")
  }

  const changes = a && b ? (Object.keys(a.config) as (keyof Config)[]).filter((k) => a.config[k] !== b.config[k]) : []

  return (
    <Panel id="saved" title="Saved runs" source={experiments.length ? <Source kind="model" detail="results stored in this browser" /> : undefined}
      aside={experiments.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-help-info="off" data-help-id="evaluation.export" onClick={exportJson}><DownloadIcon className="size-4" /> Export runs (JSON file)</Button>
          <Button variant="outline" size="sm" data-help-id="evaluation.export" onClick={exportCsv}><DownloadIcon className="size-4" /> Export for a spreadsheet (CSV)</Button>
        </div>
      )}>
      {experiments.length === 0 ? <EmptyNote>No saved runs yet. Measure, then Save run. Save two runs that differ in one setting to compare them.</EmptyNote> : (
        <div className="flex flex-col gap-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Saved evaluation runs</caption>
              <thead><tr className="text-label text-muted-foreground">
                <th className="py-2 text-left font-normal">Name</th><th className="py-2 text-left font-normal">Settings</th><th className="py-2 text-right font-normal">Loss</th><th className="py-2 text-right font-normal">PPL</th>
                <th className="py-2 text-center font-normal">Baseline <InfoTip id="evaluation.compare" /></th><th className="py-2 text-center font-normal">Candidate</th><th className="py-2 text-right font-normal"><InfoTip id="evaluation.rerun" /></th>
              </tr></thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.id} className="border-t border-rule">
                    <td className="py-2 pr-2"><span className="font-medium">{e.name}</span>{e.notes && <span className="block max-w-xs truncate text-label text-muted-foreground">{e.notes}</span>}</td>
                    <td className="py-2 pr-2 text-label text-muted-foreground">{describeConfig(e.config)}<span className="tok block">text {e.result.corpusFingerprint}</span></td>
                    <td className="num py-2 text-right">{fmt.nll(e.result.meanNll)}</td>
                    <td className="num py-2 text-right">{e.result.perplexity === null ? "–" : e.result.perplexity.toFixed(2)}</td>
                    <td className="py-2 text-center"><input type="radio" name="baseline" data-help-id="evaluation.compare" aria-label={`Use ${e.name} as baseline`} checked={baseline === e.id} onChange={() => setBaseline(e.id)} className="accent-[var(--foreground)]" /></td>
                    <td className="py-2 text-center"><input type="radio" name="candidate" data-help-id="evaluation.compare" aria-label={`Use ${e.name} as candidate`} checked={candidate === e.id} onChange={() => setCandidate(e.id)} className="accent-[var(--foreground)]" /></td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button data-help-info="off" data-help-id="evaluation.rerun" variant="ghost" size="sm" onClick={async () => {
                        const res = await onRerun(e.config)
                        setRepro((prev) => ({ ...prev, [e.id]: res ? rerunVerdict(e.result, res) : { kind: "error", message: "Couldn't rerun; see the error above. The training text may have been deleted." } }))
                      }}>Rerun</Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${e.name}`} onClick={() => actions.deleteExperiment(e.id)}><TrashIcon className="size-4" /></Button>
                      {repro[e.id] && <span role="status" className={cn("block max-w-[16rem] whitespace-normal text-left text-label", repro[e.id].kind === "reproduced" ? "text-positive" : "text-warning")}>{repro[e.id].message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {a && b && a.id !== b.id && (
            <div className="rounded-md bg-raised p-4 text-sm">
              <h3 className="mb-2 font-medium">Baseline “{a.name}” vs candidate “{b.name}”</h3>
              <p>What changed: {changes.length === 0 ? "no settings" : changes.map((k) => `${k} ${a.config[k]} → ${b.config[k]}`).join("; ")}.{changes.length > 1 && <strong> More than one setting changed, so the difference can&apos;t be pinned on either.</strong>}</p>
              <p className="mt-1">Loss: {fmt.nll(a.result.meanNll)} → {fmt.nll(b.result.meanNll)}{a.result.meanNll !== null && b.result.meanNll !== null && ` (${b.result.meanNll - a.result.meanNll >= 0 ? "+" : "−"}${Math.abs(b.result.meanNll - a.result.meanNll).toFixed(3)} nats; lower is better)`}.</p>
              {(a.result.corpusFingerprint !== b.result.corpusFingerprint || a.config.on !== b.config.on || a.config.train !== b.config.train || a.config.val !== b.config.val) && <p className="mt-1 text-warning">These runs were scored on different held-out text, so their losses are not directly comparable.</p>}
              {a.result.modelVersion !== b.result.modelVersion && <p className="mt-1 text-warning">Different engine versions: {a.result.modelVersion} and {b.result.modelVersion}.</p>}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

function EvalExplain() {
  return (
    <Explain
      plain={
        <>
          <p>To judge a model fairly, test it on text it never learned from. For each held-out character, ask: what probability did the engine give the character that actually came next? Low probability means high <Term id="loss">loss</Term>.</p>
          <p>Averaging −log p over all characters gives one number to compare runs, as long as they are scored the same way on the same text.</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen>
        <div className="flex flex-col gap-2">
          <p>loss = (1/N) Σ −log p(targetᵢ | contextᵢ), in nats (natural log). Perplexity = e^loss.</p>
          <p>A uniform guess over V characters gives p = 1/V for everything, so loss = log V. Any useful model must beat that.</p>
          <p>With k-smoothing: p = (count + k) ÷ (row total + k·V), never zero, so the loss stays finite.</p>
        </div>
      </ExplainSection>
      <ExplainSection title="When perplexity comparisons are valid">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Same held-out text, same split. A different split or corpus fingerprint means a different exam.</li>
          <li>Same tokenization. Perplexity is per token: per character here, per word piece for most large models. Comparing those numbers directly is comparing different units.</li>
          <li>Same handling of unknowns. The Lab adds one shared slot for unseen characters; a different rule changes the score.</li>
          <li>Tiny texts give noisy numbers. A difference of a few hundredths may not survive another split.</li>
        </ul>
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <EngineCode path="nextword/lab/service.py" symbol="evaluate" />
          <EngineCode path="nextword/lab/service.py" symbol="split_text" />
        </div>
      </ExplainSection>
      <Note>Roadmap increment 1.4 teaches this split and held-out loss step by step. This bench already runs it so the Lab can show real numbers.</Note>
      <EvidenceRecorder conceptId="perplexity" compact />
    </Explain>
  )
}
