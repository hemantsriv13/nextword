import { useMemo, useState } from "react"
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
import { api, type Evaluation as EvalResult } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync } from "@/lib/hooks"
import { actions, download, useLab, type SavedExperiment } from "@/lib/store"
import { cn } from "@/lib/utils"

type Config = SavedExperiment["config"]

function summarise(r: EvalResult): SavedExperiment["result"] {
  return { targets: r.targets, meanNll: r.meanNll, meanNllCovered: r.meanNllCovered, perplexity: r.perplexity, unseenContext: r.unseenContext, unseenPair: r.unseenPair, covered: r.covered, modelVersion: r.modelVersion, corpusFingerprint: r.corpusFingerprint }
}

export default function Evaluation() {
  const [config, setConfig] = useState<Config>({ corpus: "sample", train: 0.8, val: 0.1, on: "val", k: 0 })
  const evalRun = useAsync(api.evaluate)
  const { corpora } = useCorpora()
  const r = evalRun.data
  const set = <K extends keyof Config>(key: K, v: Config[K]) => setConfig((c) => ({ ...c, [key]: v }))
  const test = Math.max(0, 1 - config.train - config.val)
  const validSplit = config.train + config.val < 0.999 && test >= 0.01

  async function run(c = config) {
    const res = await evalRun.run({ corpus: c.corpus, train: c.train, val: c.val, on: c.on, k: c.k })
    if (res) actions.logRun({ route: "evaluation", title: `Held-out loss on ${c.on}`, summary: `k ${c.k}: ${res.meanNll === null ? "infinite" : res.meanNll.toFixed(3)} nats`, source: "model" }, ["loss", "split", ...(c.k > 0 ? ["smoothing"] : [])])
    return res
  }

  return (
    <Workspace
      title="Evaluation bench"
      subtitle="Measure your engine on text it never counted. Every number comes from your Python engine."
      explain={<EvalExplain />}
    >
      <Panel id="config" title="Experiment settings" source={<Source kind="model" detail="nextword/lab/service.py evaluate()" />}
        aside={<Button onClick={() => run()} disabled={!validSplit || evalRun.loading}><PlayIcon className="size-4" /> {evalRun.loading ? "Measuring…" : "Measure"}</Button>}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span id="ev-corpus" className="text-sm font-medium">Training text</span>
            <Select value={config.corpus} onValueChange={(v) => set("corpus", String(v))} items={(corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}>
              <SelectTrigger aria-labelledby="ev-corpus"><SelectValue /></SelectTrigger>
              <SelectContent>{(corpora ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <SliderField id="ev-train" label="Training share" value={config.train} min={0.5} max={0.9} step={0.05} onChange={(v) => set("train", v)} format={(v) => fmt.pct(v, 0)} />
          <SliderField id="ev-val" label="Validation share" value={config.val} min={0.05} max={0.3} step={0.05} onChange={(v) => set("val", v)} format={(v) => fmt.pct(v, 0)} hint={validSplit ? `Test gets the remaining ${fmt.pct(test, 0)}.` : "Leave some text for the test split."} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Measure on</span>
            <Segmented label="Measure on" value={config.on} onChange={(v) => set("on", v)} options={[{ value: "val", label: "Validation" }, { value: "test", label: "Test" }]} />
            {config.on === "test" && <p className="text-[13px] text-warning">Use the test split once, after you&apos;ve chosen settings on validation.</p>}
          </div>
          <SliderField id="ev-k" label={<><Term id="smoothing">Smoothing</Term> k</>} value={config.k} min={0} max={3} step={0.05} onChange={(v) => set("k", v)} format={(v) => (v === 0 ? "0 (engine as built)" : v.toFixed(2))} hint="k = 0 is your engine exactly. k > 0 is a Lab-side add-k variant used only for evaluation." />
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">The text is cut into three contiguous parts before any pairs are made, so no pair crosses a split. Only the training part is counted.</p>
      </Panel>

      {evalRun.error ? <ErrorNote error={evalRun.error} onRetry={() => run()} /> : evalRun.loading && !r ? <LoadingRows rows={5} /> : r ? <Results r={r} config={config} /> : (
        <EmptyNote>Press Measure. The bench reports how surprised your engine is by each character of held-out text.</EmptyNote>
      )}

      <Ablation config={config} />
      <SavedRuns onRerun={async (c) => { setConfig(c); return run(c) }} />

      <GuidedCycle
        id="eval"
        conceptId="loss"
        route="evaluation"
        question="With k = 0 (your engine as built), will the validation loss be a finite number?"
        choices={[{ id: "finite", label: "Yes, a finite number" }, { id: "infinite", label: "No, it will be infinite" }]}
        correct={r && r.k === 0 ? (r.meanNll === null ? "infinite" : "finite") : undefined}
        observation={r && r.k === 0 ? <>{r.unseenContext + r.unseenPair} of {r.targets} validation targets got probability 0 ({r.unseenContext} unseen contexts, {r.unseenPair} unseen pairs). One zero makes −log p infinite, so the mean is {r.meanNll === null ? "infinite" : r.meanNll.toFixed(3)}.</> : undefined}
        explainPrompt="Why does a single unseen pair make the whole average infinite? What does smoothing trade away to fix it?"
        change="Set k to 1 and measure again. Then run the k sweep below and find the k with the lowest validation loss."
        hints={["−log(0) is infinite.", "An average that includes an infinite term is infinite."]}
      />
    </Workspace>
  )
}

function Results({ r, config }: { r: EvalResult; config: Config }) {
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
      <Panel id="summary" title={`Held-out loss on ${r.on === "val" ? "validation" : "test"}`} source={<Source kind="model" detail={r.modelVersion} />}>
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Mean <Term id="cross-entropy">negative log-likelihood</Term> per character</dt>
            <dd className="num text-[28px] leading-tight">{r.meanNll === null ? "∞" : r.meanNll.toFixed(3)} <span className="text-base text-muted-foreground">nats</span></dd>
            {r.meanNll === null && r.meanNllCovered !== null && <dd className="text-sm">Infinite because {r.targets - r.covered} targets had probability 0. On the {r.covered} that didn&apos;t: <span className="num">{r.meanNllCovered.toFixed(3)}</span> nats, which is not a fair score on its own (it ignores the failures).</dd>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><dt className="text-[13px] text-muted-foreground"><Term id="perplexity">Perplexity</Term></dt><dd className="num text-xl">{r.perplexity === null ? "undefined" : r.perplexity.toFixed(2)}</dd></div>
            <div><dt className="text-[13px] text-muted-foreground">Uniform guess (<Term id="baseline">baseline</Term>)</dt><dd className="num text-xl">{r.uniformBaselineNll.toFixed(3)} <span className="text-sm text-muted-foreground">nats</span></dd></div>
            <div><dt className="text-[13px] text-muted-foreground">Targets scored</dt><dd className="num text-xl">{fmt.n(r.targets)}</dd></div>
            <div><dt className="text-[13px] text-muted-foreground">Unseen context / pair</dt><dd className="num text-xl">{r.unseenContext} / {r.unseenPair}</dd></div>
          </div>
          <div className="text-[13px] text-muted-foreground">
            Split: {fmt.n(r.split.train)} training, {fmt.n(r.split.val)} validation, {fmt.n(r.split.test)} test characters. k = {r.k}. Corpus fingerprint <span className="tok">{r.corpusFingerprint}</span>.
          </div>
          {r.meanNll !== null && <p className="text-sm">{r.meanNll < r.uniformBaselineNll ? `Better than guessing uniformly among ${r.vocabularyWithUnknown} characters by ${(r.uniformBaselineNll - r.meanNll).toFixed(3)} nats.` : "Not better than a uniform guess: the counts don't transfer to this text."}</p>}
        </dl>
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <label htmlFor="ev-name" className="text-sm font-medium">Save this run</label>
          <input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`k ${config.k}, ${config.on}`} className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
          <label htmlFor="ev-notes" className="text-sm font-medium">Error-analysis notes</label>
          <Textarea id="ev-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do the worst examples have in common?" />
          <Button className="self-start" variant="outline" onClick={() => { actions.saveExperiment({ name: name || `k ${config.k}, ${config.on}`, config, result: summarise(r), notes }); setName(""); setNotes("") }}>Save run</Button>
        </div>
      </Panel>
      <Panel id="examples" title="Per-example loss" source={<Source kind="model" />} aside={<Segmented label="Order" value={sort} onChange={setSort} options={[{ value: "worst", label: "Worst first" }, { value: "order", label: "Text order" }]} />}>
        <p className="mb-3 text-sm text-muted-foreground"><Term id="error-analysis">Error analysis</Term> starts here: which characters surprised the engine most, and why.</p>
        <div className="max-h-[480px] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Loss for each held-out pair</caption>
            <thead className="sticky top-0 bg-card"><tr className="text-[12px] text-muted-foreground"><th className="px-3 py-2 text-right font-normal">#</th><th className="px-3 py-2 text-left font-normal">Context → target</th><th className="px-3 py-2 text-right font-normal">p(target)</th><th className="px-3 py-2 text-right font-normal">−log p</th><th className="px-3 py-2 text-left font-normal">Why</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.i} className="border-t border-rule">
                  <td className="num px-3 py-1 text-right text-muted-foreground">{e.i + 1}</td>
                  <td className="px-3 py-1"><Tok tone="context">{e.context}</Tok> → <Tok>{e.target}</Tok></td>
                  <td className="num px-3 py-1 text-right">{e.p.toFixed(4)}</td>
                  <td className={cn("num px-3 py-1 text-right", e.nll === null && "text-negative")}>{fmt.nll(e.nll)}</td>
                  <td className="px-3 py-1 text-[13px] text-muted-foreground">{e.reason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Showing {rows.length} of {fmt.n(r.targets)}.</p>
      </Panel>
    </div>
  )
}

const SWEEP = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]

function Ablation({ config }: { config: Config }) {
  const [points, setPoints] = useState<{ k: number; nll: number | null }[] | null>(null)
  const [state, setState] = useState<{ loading: boolean; error?: Error }>({ loading: false })
  const fixed = `${config.corpus}, ${fmt.pct(config.train, 0)}/${fmt.pct(config.val, 0)} split, ${config.on}`
  async function sweep() {
    setState({ loading: true })
    try {
      const out = []
      for (const k of SWEEP) {
        const r = await api.evaluate({ corpus: config.corpus, train: config.train, val: config.val, on: config.on, k })
        out.push({ k, nll: r.meanNll })
        setPoints([...out])
      }
      setState({ loading: false })
      actions.logRun({ route: "evaluation", title: "Smoothing ablation", summary: fixed, source: "model" }, ["ablation", "smoothing"])
    } catch (e) {
      setState({ loading: false, error: e as Error })
    }
  }
  const finite = points?.filter((p) => p.nll !== null) ?? []
  const best = finite.length ? finite.reduce((m, p) => (p.nll! < m.nll! ? p : m)) : null
  return (
    <Panel id="ablation" title="Controlled ablation: only k changes" source={<Source kind="model" detail={`${SWEEP.length} runs of your engine`} />}
      aside={<Button variant="outline" onClick={sweep} disabled={state.loading}><RefreshDoubleIcon className="size-4" /> {state.loading ? `Running ${points?.length ?? 0} of ${SWEEP.length}…` : "Run the k sweep"}</Button>}>
      <p className="text-sm">Held fixed: {fixed}, same engine version. Varied: smoothing k over {SWEEP.join(", ")}.</p>
      {state.error && <div className="mt-3"><ErrorNote error={state.error} onRetry={sweep} /></div>}
      {points && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <LineChart ariaLabel="Held-out loss for each smoothing strength" series={[{ name: "held-out loss", tone: "data", points: finite.map((p) => ({ x: p.k, y: p.nll! })) }]} xLabel="smoothing k" yLabel="nats" height={200} xFormat={(x) => String(+x.toFixed(2))} />
          <table className="text-sm">
            <thead><tr className="text-[12px] text-muted-foreground"><th className="text-right font-normal">k</th><th className="text-right font-normal">loss (nats)</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.k} className={cn("border-t border-rule", best?.k === p.k && "font-semibold")}><td className="num py-0.5 text-right">{p.k}</td><td className="num text-right">{fmt.nll(p.nll)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {best && !state.loading && <p className="mt-3 text-sm">Lowest at k = {best.k} ({best.nll!.toFixed(3)} nats). Choosing k this way uses the validation text, which is why a final check belongs on the test split.</p>}
    </Panel>
  )
}

function SavedRuns({ onRerun }: { onRerun: (c: Config) => Promise<EvalResult | undefined> }) {
  const experiments = useLab((s) => s.experiments)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [repro, setRepro] = useState<Record<string, string>>({})
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}><DownloadIcon className="size-4" /> Export runs (JSON file)</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><DownloadIcon className="size-4" /> Export for a spreadsheet (CSV)</Button>
        </div>
      )}>
      {experiments.length === 0 ? <EmptyNote>No saved runs yet. Measure, then Save run. Save two runs that differ in one setting to compare them.</EmptyNote> : (
        <div className="flex flex-col gap-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Saved evaluation runs</caption>
              <thead><tr className="text-[12px] text-muted-foreground">
                <th className="py-2 text-left font-normal">Name</th><th className="py-2 text-left font-normal">Settings</th><th className="py-2 text-right font-normal">Loss</th><th className="py-2 text-right font-normal">PPL</th>
                <th className="py-2 text-center font-normal">Baseline</th><th className="py-2 text-center font-normal">Candidate</th><th className="py-2" />
              </tr></thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.id} className="border-t border-rule">
                    <td className="py-2 pr-2"><span className="font-medium">{e.name}</span>{e.notes && <span className="block max-w-xs truncate text-[13px] text-muted-foreground">{e.notes}</span>}</td>
                    <td className="py-2 pr-2 text-[13px] text-muted-foreground">{e.config.corpus}, {fmt.pct(e.config.train, 0)}/{fmt.pct(e.config.val, 0)}, {e.config.on}, k {e.config.k}</td>
                    <td className="num py-2 text-right">{fmt.nll(e.result.meanNll)}</td>
                    <td className="num py-2 text-right">{e.result.perplexity === null ? "–" : e.result.perplexity.toFixed(2)}</td>
                    <td className="py-2 text-center"><input type="radio" name="baseline" aria-label={`Use ${e.name} as baseline`} checked={baseline === e.id} onChange={() => setBaseline(e.id)} className="accent-[var(--foreground)]" /></td>
                    <td className="py-2 text-center"><input type="radio" name="candidate" aria-label={`Use ${e.name} as candidate`} checked={candidate === e.id} onChange={() => setCandidate(e.id)} className="accent-[var(--foreground)]" /></td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={async () => {
                        const res = await onRerun(e.config)
                        if (res) setRepro({ ...repro, [e.id]: res.meanNll === e.result.meanNll && res.modelVersion === e.result.modelVersion ? "Same result" : res.modelVersion !== e.result.modelVersion ? "Engine code changed since" : "Different result" })
                      }}>Rerun</Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${e.name}`} onClick={() => actions.deleteExperiment(e.id)}><TrashIcon className="size-4" /></Button>
                      {repro[e.id] && <span className="block text-[12px] text-muted-foreground">{repro[e.id]}</span>}
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
