import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, PlusIcon, TrashIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tok } from "@/components/lab/charts"
import { EngineCode, SimCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, Panel, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { api, type Adaptation } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { assemblePrompt, bm25, chunkDoc, terms, type Doc } from "@/sim/rag"
import ragSource from "@/sim/rag.ts?raw"
import { visible } from "@/sim/tokenize"

type Tab = "stages" | "continued" | "retrieval"

export default function Adapt() {
  const [tab, setTab] = useState<Tab>("stages")
  return (
    <Workspace
      title="Adaptation and retrieval"
      subtitle="Two ways new information reaches a model: training changes its weights, retrieval puts text in its prompt."
      explain={<AdaptExplain tab={tab} />}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="stages">Training stages</TabsTrigger>
          <TabsTrigger value="continued">Continued training</TabsTrigger>
          <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
        </TabsList>
        <TabsContent value="stages" className="mt-6 flex flex-col gap-6"><StagesTab /></TabsContent>
        <TabsContent value="continued" className="mt-6 flex flex-col gap-6"><ContinuedTab /></TabsContent>
        <TabsContent value="retrieval" className="mt-6 flex flex-col gap-6"><RetrievalTab /></TabsContent>
      </Tabs>
    </Workspace>
  )
}

// ----------------------------------------------------------------------------- stages

const STAGES = [
  { name: "Pretraining", term: "pretraining", changes: "Weights", data: "Huge, broad text (billions of tokens or more)", here: "Counting the sample is a toy analogue", kind: "discussed" },
  { name: "Continued training", term: "continued-training", changes: "Weights", data: "A smaller collection from one domain", here: "Real, on your engine: next tab", kind: "model" },
  { name: "Instruction fine-tuning", term: "instruction-tuning", changes: "Weights", data: "Instruction and response pairs", here: "Not built; the toy engines can't follow instructions", kind: "discussed" },
  { name: "Retrieval-augmented generation", term: "rag", changes: "Prompt only", data: "Your documents, searched at request time", here: "Retrieval and prompt assembly: third tab", kind: "simulation" },
  { name: "Prompt context", term: "prompt-vs-weights", changes: "Prompt only", data: "Whatever is typed or pasted into the request", here: "Your engine reads one character of it", kind: "model" },
] as const

const SCENARIOS = [
  { id: "s1", text: "Your bigram engine thinks ␣ is the most likely character after 'e'.", answer: "weights", why: "That comes from counts learned from the training text." },
  { id: "s2", text: "An assistant quotes a passage you pasted into this conversation.", answer: "prompt", why: "The passage is in the request; nothing was trained." },
  { id: "s3", text: "A model answers from a document a search step retrieved a moment ago.", answer: "prompt", why: "RAG inserts retrieved text into the prompt." },
  { id: "s4", text: "After adding your journal's counts, your engine favours your spelling habits.", answer: "weights", why: "Continued training changed the counts themselves." },
]

function StagesTab() {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const checked = Object.keys(answers).length
  const right = SCENARIOS.filter((s) => answers[s.id] === s.answer).length
  return (
    <>
      <Panel id="stages" title="How models are adapted" source={<Source kind="example" detail="a comparison, not a measurement" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Comparison of adaptation methods</caption>
            <thead><tr className="text-[12px] text-muted-foreground"><th className="py-2 text-left font-normal">Method</th><th className="py-2 text-left font-normal">What changes</th><th className="py-2 text-left font-normal">Data it needs</th><th className="py-2 text-left font-normal">In this project</th></tr></thead>
            <tbody>
              {STAGES.map((s) => (
                <tr key={s.name} className="border-t border-rule align-top">
                  <td className="py-2 pr-4 font-medium"><Term id={s.term}>{s.name}</Term></td>
                  <td className="py-2 pr-4">{s.changes}</td>
                  <td className="py-2 pr-4">{s.data}</td>
                  <td className="py-2">{s.here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">The tiny experiments here show the mechanics. They are many orders of magnitude smaller than real pretraining or fine-tuning, and they say nothing about how large models behave.</p>
      </Panel>
      <Panel id="where" title="Where does the information live?" source={<Source kind="example" />}>
        <ol className="flex flex-col gap-4">
          {SCENARIOS.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2">
              <p className="text-sm"><span className="num mr-1 text-muted-foreground">{i + 1}.</span> {s.text}</p>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={`Scenario ${i + 1}`}>
                {(["weights", "prompt"] as const).map((opt) => (
                  <button key={opt} type="button" role="radio" aria-checked={answers[s.id] === opt} onClick={() => setAnswers({ ...answers, [s.id]: opt })}
                    className={cn("h-8 rounded-md border px-3 text-sm", answers[s.id] === opt ? "border-foreground bg-raised font-medium" : "border-border hover:bg-raised")}>
                    {opt === "weights" ? "In the weights" : "In the prompt"}
                  </button>
                ))}
                {answers[s.id] && (
                  <span className={cn("inline-flex items-center gap-1 text-sm", answers[s.id] === s.answer ? "text-positive" : "text-foreground")}>
                    {answers[s.id] === s.answer && <CheckIcon className="size-4" />}
                    {answers[s.id] === s.answer ? "Right." : `It's in the ${s.answer}.`} <span className="text-muted-foreground">{s.why}</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
        {checked === SCENARIOS.length && <p className="mt-4 text-sm font-medium">{right} of {SCENARIOS.length} right.</p>}
      </Panel>
    </>
  )
}

// ----------------------------------------------------------------------------- continued training

const EXTRA_DEFAULT = "Sea and sand and salt. The sea breeze sweeps the beach; seagulls scream and the tide sees everything. We seek seashells, see the sea, and sleep. "

function DistRow({ d, other, label }: { d: Adaptation["before"]; other: Adaptation["after"]; label: string }) {
  if (!d) return <p className="text-sm text-muted-foreground">{label}: no counts for this character.</p>
  const otherMap = new Map(other?.candidates.map((c) => [c.token, c.p]) ?? [])
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{label} <span className="num font-normal text-muted-foreground">({fmt.n(d.total)} pairs)</span></h4>
      <ul className="flex flex-col gap-1">
        {d.candidates.slice(0, 6).map((c) => (
          <li key={c.token} className="flex items-center gap-2 text-sm">
            <Tok>{c.label}</Tok>
            <div className="h-3 flex-1 rounded-[3px] bg-secondary"><div className="h-full rounded-[3px] bg-data" style={{ width: `${c.p * 100}%` }} /></div>
            <span className="num w-12 text-right">{c.p.toFixed(3)}</span>
            {other && <span className="num w-14 text-right text-[12px] text-muted-foreground">{otherMap.has(c.token) ? "" : "new"}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContinuedTab() {
  const { corpora } = useCorpora()
  const [base, setBase] = useState("sample")
  const [extra, setExtra] = useState(EXTRA_DEFAULT)
  const [context, setContext] = useState("e")
  const res = useAsync(api.adapt)
  const r = res.data
  const valid = extra.length >= 10 && Array.from(context).length === 1
  const change = (x?: { before: number | null; after: number | null }) => x && x.before !== null && x.after !== null ? x.after - x.before : null
  const baseChange = change(r?.baseHeldOutNll)
  const extraChange = change(r?.extraHeldOutNll)

  return (
    <>
      <Panel id="ct" title="Add a second text to your engine's counts" source={<Source kind="model" detail="nextword/lab/service.py adapt()" />}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span id="ct-base" className="text-sm font-medium">Base training text</span>
              <Select value={base} onValueChange={(v) => setBase(String(v))} items={(corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}>
                <SelectTrigger aria-labelledby="ct-base"><SelectValue /></SelectTrigger>
                <SelectContent>{(corpora ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="ct-ctx" className="text-sm font-medium">Context character to watch</label>
              <input id="ct-ctx" value={context} maxLength={2} onChange={(e) => setContext(Array.from(e.target.value).slice(-1).join(""))} className="tok h-9 w-20 rounded-md border border-input bg-card px-3 text-center text-sm" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ct-extra" className="text-sm font-medium">New text to continue training on</label>
            <Textarea id="ct-extra" rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} className="text-[14px]" />
            <p className="text-[13px] text-muted-foreground">The first 80% of each text is counted; the last 20% of each is held out to measure the effect.</p>
          </div>
        </div>
        <Button className="mt-4" disabled={!valid || res.loading} onClick={async () => { const out = await res.run({ base, extraText: extra, context }); if (out) actions.logRun({ route: "adapt", title: "Continued training", summary: `watched “${visible(context)}”`, source: "model" }, ["continued-training", "forgetting"]) }}>
          {res.loading ? "Counting…" : "Continue training"}
        </Button>
      </Panel>
      {res.error && <ErrorNote error={res.error} />}
      {res.loading && !r && <LoadingRows rows={4} />}
      {r && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel id="ct-dist" title={`Row for “${r.context}”, before and after`} source={<Source kind="model" />}>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DistRow d={r.before} other={null} label="Base only" />
              <DistRow d={r.after} other={r.before} label="Base + new text" />
            </div>
          </Panel>
          <Panel id="ct-loss" title="Held-out loss, before and after" source={<Source kind="model" detail="add-1 smoothed so it stays finite" />}>
            <table className="w-full text-sm">
              <thead><tr className="text-[12px] text-muted-foreground"><th className="text-left font-normal">Held-out text</th><th className="text-right font-normal">Before</th><th className="text-right font-normal">After</th><th className="text-right font-normal">Change</th></tr></thead>
              <tbody>
                {[["Base text (old material)", r.baseHeldOutNll, baseChange], ["New text", r.extraHeldOutNll, extraChange]].map(([label, x, c]) => {
                  const v = x as Adaptation["baseHeldOutNll"]
                  const d = c as number | null
                  return (
                    <tr key={label as string} className="border-t border-rule">
                      <td className="py-1.5">{label as string}</td>
                      <td className="num text-right">{fmt.nll(v.before)}</td>
                      <td className="num text-right">{fmt.nll(v.after)}</td>
                      <td className="num text-right">{d === null ? "–" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-sm">
              {extraChange !== null && extraChange < 0 ? "Loss on the new text went down: the engine adapted to it. " : ""}
              {baseChange !== null && baseChange > 0 ? <>Loss on the base text went up: some <Term id="forgetting">forgetting</Term>. </> : baseChange !== null ? "Loss on the base text did not rise. " : ""}
              Pairs counted: {fmt.n(r.basePairs)} base, {fmt.n(r.extraPairs)} new.
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">{r.note}</p>
          </Panel>
        </div>
      )}
      <GuidedCycle
        id="adapt"
        conceptId="continued-training"
        route="adapt"
        question="After adding the seaside text, will loss on the base text's held-out part go up or down?"
        choices={[{ id: "up", label: "Up (the engine gets worse on old material)" }, { id: "down", label: "Down" }]}
        correct={baseChange === null ? undefined : baseChange > 0 ? "up" : "down"}
        observation={r && baseChange !== null ? <>Base held-out loss changed by {baseChange >= 0 ? "+" : "−"}{Math.abs(baseChange).toFixed(3)} nats; new-text loss by {extraChange! >= 0 ? "+" : "−"}{Math.abs(extraChange!).toFixed(3)}.</> : undefined}
        explainPrompt="Why does adding counts from one text change predictions for another?"
        change="Replace the new text with a copy of the base text's style (or the base text itself) and run again."
        hints={["Each row's probabilities are shares of one total. Adding counts changes the shares.", "The seaside text has an unusual mix of letters after 'e'."]}
      />
    </>
  )
}

// ----------------------------------------------------------------------------- retrieval

const DOCS_DEFAULT: Doc[] = [
  { id: "engine", title: "Engine notes", text: "The bigram engine reads only the last character of the prompt. It counts how often each character follows another in the training text, divides by the row total, and samples the next character. A character that never appeared in training cannot be continued; the engine reports an unseen context instead of guessing." },
  { id: "eval", title: "Evaluation notes", text: "Held-out loss is measured on text the engine never counted. The text is split into training, validation and test parts before any pairs are made. With no smoothing, a single unseen pair makes the loss infinite. Add-k smoothing reserves a little probability for unseen pairs, which keeps the loss finite." },
  { id: "kitchen", title: "Kitchen notes", text: "To make green tea, heat water to about 80 degrees and steep the leaves for two to three minutes. Boiling water makes green tea bitter. Black tea tolerates boiling water and a longer steep of four to five minutes." },
]

function RetrievalTab() {
  const [docs, setDocs] = useState<Doc[]>(DOCS_DEFAULT)
  const [size, setSize] = useState(24)
  const [overlap, setOverlap] = useState(6)
  const [query, setQuery] = useState("Why is the loss infinite without smoothing?")
  const [topK, setTopK] = useState(2)
  const [copied, setCopied] = useState(false)
  const ov = Math.min(overlap, size - 1)
  const chunks = useMemo(() => docs.flatMap((d) => chunkDoc(d, size, ov)), [docs, size, ov])
  const ranked = useMemo(() => bm25(chunks, query), [chunks, query])
  const hits = ranked.filter((r) => r.score > 0).slice(0, topK)
  const prompt = assemblePrompt(query, hits)
  const qTerms = terms(query)

  return (
    <>
      <Note>No generation model is configured, so the Lab shows the retrieved evidence and the assembled prompt. It never writes an answer for you to mistake for a model&apos;s.</Note>
      <Panel id="docs" title="Documents" source={<Source kind="simulation" detail="kept in this page only" />}
        aside={<Button variant="outline" size="sm" disabled={docs.length >= 8} onClick={() => setDocs([...docs, { id: `doc${docs.length + 1}`, title: `Document ${docs.length + 1}`, text: "" }])}><PlusIcon className="size-4" /> Add a document</Button>}>
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {docs.map((d, i) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-md bg-raised p-3">
              <div className="flex items-center gap-2">
                <label htmlFor={`dt-${d.id}`} className="sr-only">Title</label>
                <input id={`dt-${d.id}`} value={d.title} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm font-medium" />
                <Button variant="ghost" size="icon" aria-label={`Remove ${d.title}`} disabled={docs.length <= 1} onClick={() => setDocs(docs.filter((_, j) => j !== i))}><TrashIcon className="size-4" /></Button>
              </div>
              <label htmlFor={`dx-${d.id}`} className="sr-only">Text of {d.title}</label>
              <Textarea id={`dx-${d.id}`} rows={5} value={d.text} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="text-[13px]" placeholder="Paste a few paragraphs." />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="chunks" title="Chunks" source={<Source kind="simulation" detail={`${chunks.length} chunks`} />}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SliderField id="csize" label="Chunk size" value={size} min={6} max={80} step={1} onChange={setSize} format={(v) => `${v} words`} />
          <SliderField id="cover" label="Overlap" value={ov} min={0} max={Math.max(0, size - 1)} step={1} onChange={setOverlap} format={(v) => `${v} words`} hint="Words repeated at the start of the next chunk, so a fact on a boundary survives." />
        </div>
        <div className="mt-4 flex max-h-80 flex-col gap-2 overflow-auto">
          {chunks.length === 0 ? <EmptyNote>The documents are empty.</EmptyNote> : chunks.map((c) => (
            <p key={c.id} className="rounded-md border border-border p-2 text-[13px] leading-relaxed">
              <span className="tok mr-2 text-[12px] text-muted-foreground">[{c.id}] words {c.startWord + 1}–{c.endWord}</span>
              {c.index > 1 && ov > 0 ? <><mark className="bg-context text-context-ink">{c.text.split(" ").slice(0, ov).join(" ")}</mark> {c.text.split(" ").slice(ov).join(" ")}</> : c.text}
            </p>
          ))}
        </div>
        {ov > 0 && <p className="mt-2 text-[13px] text-muted-foreground">Highlighted words repeat the end of the previous chunk.</p>}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel id="search" title="Search" source={<Source kind="simulation" detail="lexical search (BM25), not embeddings" />}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="q" className="text-sm font-medium">Question</label>
              <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
              <p className="text-[13px] text-muted-foreground">Search words after dropping common ones: {qTerms.length ? qTerms.map((t) => <Tok key={t} className="mr-1">{t}</Tok>) : "none"}</p>
            </div>
            <SliderField id="topk-r" label="Passages to include" value={topK} min={1} max={5} step={1} onChange={setTopK} />
            <table className="w-full text-sm">
              <caption className="sr-only">Chunks ranked by BM25 score</caption>
              <thead><tr className="text-[12px] text-muted-foreground"><th className="text-left font-normal">Chunk</th><th className="text-left font-normal">Matched words</th><th className="text-right font-normal">Score</th></tr></thead>
              <tbody>
                {ranked.slice(0, 6).map((r, i) => (
                  <tr key={r.chunk.id} className={cn("border-t border-rule", r.score > 0 && i < topK && "font-medium")}>
                    <td className="tok py-1 text-[13px]">{r.chunk.id}</td>
                    <td className="py-1 text-[13px]">{r.matched.join(", ") || <span className="text-muted-foreground">none</span>}</td>
                    <td className="num py-1 text-right">{r.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hits.length === 0 && <Note tone="warning">No chunk shares a word with the question. Lexical search cannot match synonyms (“brew” won&apos;t find “steep”); a real embedding model might.</Note>}
          </div>
        </Panel>
        <Panel id="prompt" title="Assembled prompt" source={<Source kind="simulation" />}
          aside={<Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); actions.logRun({ route: "adapt", title: "Assembled a RAG prompt", summary: `${hits.length} passages`, source: "simulation" }, ["rag", "lexical-search", "grounding"]) }}>{copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Copied" : "Copy"}</Button>}>
          <pre className="tok max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-raised p-3 text-[12.5px] leading-relaxed">{prompt}</pre>
          <p className="mt-3 text-[13px] text-muted-foreground">Each passage carries its source id, so an answer can cite it and a reader can check it. A citation still has to be checked: the model may cite a passage that doesn&apos;t support the claim.</p>
        </Panel>
      </div>

      <Panel id="failures" title="How retrieval goes wrong">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li><span className="font-medium">Missed passage:</span> the answer is there but uses other words. Try “How long should I brew green tea?” and see what scores.</li>
          <li><span className="font-medium">Irrelevant chunk:</span> a passage shares a common word but not the meaning. Lower the passage count or raise chunk quality.</li>
          <li><span className="font-medium">Split fact:</span> with small chunks and no overlap, a sentence can be cut in half. Set overlap to 0 and size to 8 to see it.</li>
          <li><span className="font-medium">Unsupported answer:</span> a model can ignore the sources or add facts. Grounding instructions help; checking is still needed.</li>
        </ul>
        <p className="mt-3 text-[13px] text-muted-foreground"><Term id="semantic-search">Semantic search</Term> with a trained embedding model and <Term id="reranking">reranking</Term> address some of these. They are not built here; toy vectors would only pretend.</p>
      </Panel>
    </>
  )
}

function AdaptExplain({ tab }: { tab: Tab }) {
  return (
    <Explain
      plain={
        tab === "retrieval" ? (
          <p><Term id="rag">Retrieval-augmented generation</Term> searches your documents for passages related to a question and puts them, with their sources, into the prompt. The model&apos;s weights stay exactly as they were.</p>
        ) : tab === "continued" ? (
          <p><Term id="continued-training">Continued training</Term> starts from what a model already learned and learns more from a new text. For your engine that means adding the new text&apos;s counts. It shifts predictions toward the new text, sometimes at the cost of the old.</p>
        ) : (
          <p>Information reaches an answer either through the <Term id="prompt-vs-weights">weights</Term> (learned in training) or through the prompt (supplied at request time). Every method on this page is one or the other.</p>
        )
      }
    >
      <ExplainSection title="Show the relevant code">
        {tab === "continued" ? <EngineCode path="nextword/lab/service.py" symbol="adapt" /> : (
          <div className="flex flex-col gap-4">
            <SimCode path="web/src/sim/rag.ts" symbol="chunkDoc" text={ragSource} />
            <SimCode path="web/src/sim/rag.ts" symbol="bm25" text={ragSource} />
          </div>
        )}
      </ExplainSection>
      <ExplainSection title="How this differs from large-scale training">
        <p>Real continued training updates billions of weights with gradient descent on millions of documents; instruction tuning trains on curated instruction-response pairs. Your engine adds counts from a few hundred characters. The mechanics rhyme (new data shifts the model, old skills can fade) but the scale and the methods are very different.</p>
      </ExplainSection>
      <EvidenceRecorder conceptId={tab === "retrieval" ? "rag" : tab === "continued" ? "continued-training" : "prompt-vs-weights"} compact />
    </Explain>
  )
}
