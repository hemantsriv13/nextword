import { useMemo, useRef, useState } from "react"
import { TrashIcon, UploadIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ProbBars, Tok } from "@/components/lab/charts"
import { EngineCode, SimCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { api } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync, useLoad } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { charTokens, encodeBpe, idTable, learnBpe, visible, wordTokens } from "@/sim/tokenize"
import tokenizeSource from "@/sim/tokenize.ts?raw"
import windowsSource from "@/sim/windows.ts?raw"
import { makeWindows, splitWindows } from "@/sim/windows"

type Tab = "corpus" | "tokens" | "windows" | "splits"

export default function DataStudio() {
  const [tab, setTab] = useState<Tab>("corpus")
  return (
    <Workspace
      title="Data and tokens"
      subtitle="What your engine learns from, how text becomes tokens, and how training pairs and splits are made."
      explain={<DataExplain tab={tab} />}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="corpus">Corpus</TabsTrigger>
          <TabsTrigger value="tokens">Tokenizers</TabsTrigger>
          <TabsTrigger value="windows">Windows and pairs</TabsTrigger>
          <TabsTrigger value="splits">Splits and leakage</TabsTrigger>
        </TabsList>
        <TabsContent value="corpus" className="mt-6 flex flex-col gap-6"><CorpusTab /></TabsContent>
        <TabsContent value="tokens" className="mt-6 flex flex-col gap-6"><TokensTab /></TabsContent>
        <TabsContent value="windows" className="mt-6 flex flex-col gap-6"><WindowsTab /></TabsContent>
        <TabsContent value="splits" className="mt-6 flex flex-col gap-6"><SplitsTab /></TabsContent>
      </Tabs>
    </Workspace>
  )
}

// ----------------------------------------------------------------------------- corpus

const MAX_UPLOAD = 2_000_000

function CorpusTab() {
  const { corpora, error, refresh } = useCorpora()
  const [selected, setSelected] = useState("sample")
  const detail = useLoad(() => api.corpus(selected), selected + (corpora?.length ?? 0))
  const [showWs, setShowWs] = useState(true)
  const [name, setName] = useState("")
  const [text, setText] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const add = useAsync(api.addCorpus)
  const del = useAsync(api.deleteCorpus)
  const [confirming, setConfirming] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const d = detail.data

  function readFile(file: File) {
    setFileError(null)
    if (!/\.(txt|md|text)$/i.test(file.name) && file.type && !file.type.startsWith("text/")) return setFileError(`${file.name} doesn't look like plain text. Use a .txt or .md file.`)
    if (file.size > MAX_UPLOAD * 4) return setFileError(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB; the limit is about 2 million characters.`)
    const reader = new FileReader()
    reader.onload = () => {
      const t = String(reader.result ?? "")
      if (t.includes("\u0000")) return setFileError(`${file.name} contains binary data, not plain text.`)
      setText(t)
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""))
    }
    reader.onerror = () => setFileError(`Couldn't read ${file.name}.`)
    reader.readAsText(file)
  }

  return (
    <>
      <Panel id="corpora" title="Training texts" source={<Source kind="model" detail="stored by the backend in data/" />}>
        {error ? <ErrorNote error={error} onRetry={refresh} /> : !corpora ? <LoadingRows rows={2} /> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Available training texts</caption>
            <thead>
              <tr className="text-[12px] text-muted-foreground">
                <th scope="col" className="py-2 text-left font-normal">Name</th>
                <th scope="col" className="py-2 text-left font-normal">File</th>
                <th scope="col" className="py-2 text-right font-normal">Characters</th>
                <th scope="col" className="py-2 text-right font-normal">Distinct</th>
                <th scope="col" className="w-24 py-2" />
              </tr>
            </thead>
            <tbody>
              {corpora.map((c) => (
                <tr key={c.id} className={cn("border-t border-rule", c.id === selected && "bg-active")}>
                  <td className="py-2 pl-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setSelected(c.id)} aria-pressed={c.id === selected}>{c.name}</button>
                  </td>
                  <td className="tok py-2 text-[13px] text-muted-foreground">{c.file}</td>
                  <td className="num py-2 text-right">{fmt.n(c.chars)}</td>
                  <td className="num py-2 text-right">{c.distinct}</td>
                  <td className="py-2 pr-2 text-right">
                    {c.origin === "upload" && (confirming === c.id ? (
                      <span className="inline-flex gap-1">
                        <Button variant="outline" size="sm" className="text-negative" disabled={del.loading} onClick={async () => { await del.run(c.id); setConfirming(null); await refresh(); setSelected("sample") }}>
                          Delete file
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={`Delete ${c.name}`} onClick={() => setConfirming(c.id)}>
                        <TrashIcon className="size-4" /> Delete
                      </Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Note>The bundled sample is about 1,200 characters, written for this project. It is a smoke test, far too small for good suggestions.</Note>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel id="preview" title={d ? `Preview: ${d.name}` : "Preview"} source={<Source kind="model" detail="counted by tokenize()" />}
          aside={<label className="flex items-center gap-2 text-sm"><Switch checked={showWs} onCheckedChange={setShowWs} aria-label="Show spaces and newlines" /> Show spaces and newlines</label>}>
          {detail.error ? <ErrorNote error={detail.error} onRetry={detail.retry} /> : !d ? <LoadingRows rows={6} /> : (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[["Characters (tokens)", d.stats.chars], ["Distinct characters", d.stats.distinct], ["Words", d.stats.words], ["Lines", d.stats.lines]].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[13px] text-muted-foreground">{k}</dt>
                    <dd className="num text-2xl">{fmt.n(v as number)}</dd>
                  </div>
                ))}
              </dl>
              <pre className="tok max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-raised p-3 text-[13px] leading-6">
                {showWs ? visible(d.text.slice(0, 3000)).replace(/↵/g, "↵\n") : d.text.slice(0, 3000)}
                {d.text.length > 3000 && <span className="text-muted-foreground">{"\n"}… {fmt.n(d.text.length - 3000)} more characters</span>}
              </pre>
            </div>
          )}
        </Panel>
        <Panel id="freq" title="Character frequency" source={<Source kind="model" />}>
          {!d ? <LoadingRows rows={8} /> : (
            <ProbBars
              ariaLabel="How often each character appears"
              limit={16}
              items={d.stats.frequency.map((f) => ({ key: f.token, label: <Tok>{f.label}</Tok>, value: f.count, detail: fmt.pct(f.count / d.stats.chars) }))}
              valueFormat={(v) => fmt.n(v)}
              remainderLabel="characters"
            />
          )}
        </Panel>
      </div>

      <Panel id="add" title="Add your own text" source={<Source kind="model" detail="saved to data/lab/, never uploaded anywhere" />}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await add.run(name || "my text", text)
            if (r) { await refresh(); setSelected(r.id); setText(""); setName(""); actions.logRun({ route: "data", title: `Added “${r.name}”`, summary: `${fmt.n(r.chars)} chars`, source: "model" }, ["corpus"]) }
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-2">
              <label htmlFor="cname" className="text-sm font-medium">Name</label>
              <input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. my-journal" className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">From a file</span>
              <input ref={fileInput} type="file" accept=".txt,.md,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} aria-label="Choose a plain-text file" />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}><UploadIcon className="size-4" /> Choose a .txt file</Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ctext" className="text-sm font-medium">Text</label>
            <Textarea id="ctext" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text you wrote or have permission to use." className="text-[14px]" />
            <p className="num text-[13px] text-muted-foreground">{fmt.n(text.length)} characters{text.length > MAX_UPLOAD ? `; over the ${fmt.n(MAX_UPLOAD)} limit` : ""}. Use text you own or may use.</p>
          </div>
          {fileError && <p role="alert" className="text-sm text-negative">{fileError}</p>}
          {add.error && <ErrorNote error={add.error} />}
          <Button type="submit" className="self-start" disabled={!text.trim() || text.length > MAX_UPLOAD || add.loading}>{add.loading ? "Saving…" : "Save as a training text"}</Button>
        </form>
      </Panel>
    </>
  )
}

// ----------------------------------------------------------------------------- tokenizers

function TokenList({ tokens, ids, label }: { tokens: string[]; ids?: Map<string, number>; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1">
      {tokens.map((t, i) => (
        <li key={i} className="flex flex-col items-center">
          <Tok>{visible(t)}</Tok>
          {ids && <span className="num text-[11px] text-muted-foreground">{ids.get(t)}</span>}
        </li>
      ))}
    </ol>
  )
}

function TokensTab() {
  const [text, setText] = useState("The rain fell, and the rainbow followed.")
  const [merges, setMerges] = useState(12)
  const [idsText, setIdsText] = useState("0 1 2 3")
  const sample = useLoad(() => api.corpus("sample"), "sample")
  const chars = charTokens(text)
  const words = wordTokens(text)
  const { toId, toToken } = idTable(chars)
  const bpe = useMemo(() => (sample.data ? learnBpe(sample.data.text, merges) : null), [sample.data, merges])
  const bpeTokens = bpe ? encodeBpe(text, bpe.steps) : []
  const decoded = idsText.trim().split(/[\s,]+/).filter(Boolean).map((s) => {
    const n = Number(s)
    return Number.isInteger(n) && n >= 0 && n < toToken.length ? toToken[n] : null
  })

  return (
    <>
      <Panel id="tok-in" title="Your sentence">
        <label htmlFor="tok-text" className="sr-only">Sentence to tokenize</label>
        <Textarea id="tok-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} className="text-[15px]" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Token counts for each tokenizer</caption>
            <thead><tr className="text-[12px] text-muted-foreground"><th className="text-left font-normal">Tokenizer</th><th className="text-right font-normal">Tokens for this sentence</th><th className="text-right font-normal">Characters per token</th></tr></thead>
            <tbody>
              {[["Characters (your engine)", chars.length], ["Simple word splitter", words.length], [`BPE, ${bpe?.steps.length ?? 0} merges`, bpeTokens.length]].map(([n, c]) => (
                <tr key={n as string} className="border-t border-rule">
                  <td className="py-1.5">{n}</td>
                  <td className="num py-1.5 text-right">{c}</td>
                  <td className="num py-1.5 text-right">{(chars.length / Math.max(1, c as number)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">The same text becomes different numbers of tokens. That is why <Term id="perplexity">perplexity</Term> can't be compared across tokenizers without care.</p>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel id="tok-char" title="Character tokens and IDs" source={<Source kind="simulation" detail="same rule as tokenize()" />}>
          <TokenList tokens={chars} ids={toId} label="Character tokens with IDs" />
          <p className="mt-3 text-[13px] text-muted-foreground">IDs are numbered by first appearance in this sentence, a Lab convention for display. Your bigram engine works on the characters directly and has no ID table yet; neural models need one.</p>
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <label htmlFor="ids" className="text-sm font-medium">IDs back to tokens</label>
            <input id="ids" value={idsText} onChange={(e) => setIdsText(e.target.value)} className="num h-9 rounded-md border border-input bg-card px-3 text-sm" />
            <p className="text-sm">
              {decoded.length === 0 ? <span className="text-muted-foreground">Type IDs separated by spaces.</span> : decoded.map((t, i) => t === null ? <span key={i} className="mr-1 text-negative">[no ID {idsText.trim().split(/[\s,]+/)[i]}]</span> : <Tok key={i} className="mr-1">{visible(t)}</Tok>)}
            </p>
          </div>
        </Panel>
        <Panel id="tok-word" title="Word splitting" source={<Source kind="simulation" detail="simple regular expression" />}>
          <TokenList tokens={words} label="Word tokens" />
          <p className="mt-3 text-[13px] text-muted-foreground">Letters and digits stay together; each punctuation mark and run of spaces is its own token. Unseen words would be unknown to a word-level model.</p>
        </Panel>
      </div>

      <Panel id="tok-bpe" title="Byte-pair encoding, step by step" source={<Source kind="simulation" detail="teaching version, learned on the sample" />}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SliderField id="merges" label="Merges learned" value={merges} min={0} max={40} step={1} onChange={setMerges} hint="Each merge glues the most frequent neighbouring pair in the sample into one new token." />
            {!bpe ? <LoadingRows /> : bpe.steps.length === 0 ? <EmptyNote>No merges: every character is its own token.</EmptyNote> : (
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">BPE merge steps</caption>
                  <thead className="sticky top-0 bg-card"><tr className="text-[12px] text-muted-foreground"><th className="px-2 py-1 text-right font-normal">Merge</th><th className="px-2 py-1 text-left font-normal">Pair</th><th className="px-2 py-1 text-right font-normal">Seen</th><th className="px-2 py-1 text-right font-normal">Sample length</th></tr></thead>
                  <tbody>
                    {bpe.steps.map((s, i) => (
                      <tr key={i} className="border-t border-rule">
                        <td className="num px-2 py-1 text-right">{i + 1}</td>
                        <td className="px-2 py-1"><Tok>{visible(s.left)}</Tok> + <Tok>{visible(s.right)}</Tok> → <Tok tone="generated">{visible(s.merged)}</Tok></td>
                        <td className="num px-2 py-1 text-right">{s.count}</td>
                        <td className="num px-2 py-1 text-right">{fmt.n(s.tokenCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Your sentence with these merges</h3>
            <TokenList tokens={bpeTokens} label="BPE tokens" />
            <Note>This is not the tokenizer of any commercial model. Those are byte-level, learned on huge corpora, with tens of thousands of merges.</Note>
          </div>
        </div>
      </Panel>
    </>
  )
}

// ----------------------------------------------------------------------------- windows

function WindowsTab() {
  const [text, setText] = useState("the rain in spain")
  const [size, setSize] = useState(3)
  const [pos, setPos] = useState(0)
  const chars = charTokens(text)
  const windows = makeWindows(text, size)
  const at = Math.min(pos, Math.max(0, windows.length - 1))
  const w = windows[at]
  return (
    <>
      <Panel id="win" title="Sliding context window" source={<Source kind="simulation" />}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label htmlFor="win-text" className="text-sm font-medium">Text</label>
            <input id="win-text" value={text} onChange={(e) => { setText(e.target.value); setPos(0) }} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
          </div>
          <SliderField id="ctx" label={<Term id="context-window">Context size</Term>} value={size} min={1} max={8} step={1} onChange={(v) => { setSize(v); setPos(0) }} format={(v) => `${v} chars`} />
        </div>
        {windows.length === 0 ? <div className="mt-4"><EmptyNote>The text needs more than {size} characters to make one pair.</EmptyNote></div> : (
          <div className="mt-5 flex flex-col gap-4">
            <ol className="flex flex-wrap gap-1" aria-label="Characters, with the current window marked">
              {chars.map((c, i) => (
                <li key={i}><Tok tone={i >= w.start && i < w.start + size ? "context" : i === w.start + size ? "chosen" : "plain"}>{visible(c)}</Tok></li>
              ))}
            </ol>
            <SliderField id="pos" label="Window position" value={at} min={0} max={windows.length - 1} step={1} onChange={setPos} format={(v) => `${v + 1} of ${windows.length}`} />
            <p className="text-sm">Input <Tok tone="context">{visible(w.context)}</Tok> → target <Tok tone="chosen">{visible(w.target)}</Tok>. With {chars.length} characters and context {size}, there are {chars.length} − {size} = <span className="num font-medium">{windows.length}</span> <Term id="training-pair">training pairs</Term>.</p>
          </div>
        )}
      </Panel>
      <Panel id="pairs" title="Input and target pairs" source={<Source kind="simulation" />}>
        {windows.length === 0 ? <EmptyNote>No pairs yet.</EmptyNote> : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="text-[12px] text-muted-foreground"><th className="py-1 text-right font-normal">#</th><th className="px-3 py-1 text-left font-normal">Input ({size} tokens)</th><th className="py-1 text-left font-normal">Target</th></tr></thead>
              <tbody>
                {windows.slice(0, 60).map((p, i) => (
                  <tr key={i} className={cn("border-t border-rule", i === at && "bg-active")}>
                    <td className="num py-1 text-right">{i + 1}</td>
                    <td className="px-3 py-1"><Tok tone="context">{visible(p.context)}</Tok></td>
                    <td className="py-1"><Tok tone="chosen">{visible(p.target)}</Tok></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {windows.length > 60 && <p className="mt-2 text-[13px] text-muted-foreground">Showing 60 of {windows.length}.</p>}
          </div>
        )}
        <p className="mt-3 text-[13px] text-muted-foreground">Neighbouring pairs share {size - 1 > 0 ? `${size - 1} of their ${size}` : "none of their"} input characters. That overlap is why the next tab matters. A bigram is the case context = 1.</p>
      </Panel>
    </>
  )
}

// ----------------------------------------------------------------------------- splits

function SplitsTab() {
  const sample = useLoad(() => api.corpus("sample"), "sample")
  const [strategy, setStrategy] = useState<"split-first" | "windows-first">("windows-first")
  const [size, setSize] = useState(4)
  const [val, setVal] = useState(0.2)
  const [length, setLength] = useState(240)
  const [ran, setRan] = useState<{ strategy: string; leaked: number; total: number } | null>(null)
  const text = sample.data?.text.slice(0, length) ?? ""
  const result = useMemo(() => (text ? splitWindows(text, size, val, strategy, 7) : null), [text, size, val, strategy])
  const chars = charTokens(text)

  const outcome = ran ? (ran.leaked === 0 ? "none" : ran.leaked / ran.total < 0.5 ? "some" : "most") : undefined

  return (
    <>
      <Panel id="split" title="Make windows, then split?" source={<Source kind="simulation" detail="on the first characters of the sample" />}
        aside={<Segmented label="Strategy" value={strategy} onChange={setStrategy} options={[{ value: "windows-first", label: "Windows first, random split" }, { value: "split-first", label: "Split text first" }]} />}>
        {!result ? <LoadingRows /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <SliderField id="sp-size" label="Window size" value={size} min={2} max={10} step={1} onChange={setSize} format={(v) => `${v} chars`} />
              <SliderField id="sp-val" label="Validation share" value={val} min={0.1} max={0.5} step={0.05} onChange={setVal} format={(v) => fmt.pct(v, 0)} />
              <SliderField id="sp-len" label="Text length" value={length} min={80} max={600} step={20} onChange={setLength} format={(v) => `${v} chars`} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-chart-5" /> read only by training windows</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-data" /> read only by validation windows (rounded)</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-negative" /> read by both: leaked (bold, underlined)</span>
              </div>
              <div className="tok flex flex-wrap gap-px text-[12px]" aria-label="Each character, coloured by which split reads it">
                {chars.map((c, i) => {
                  const p = result.positions[i]
                  return (
                    <span key={i} className={cn("inline-flex h-5 min-w-[12px] items-center justify-center rounded-[2px] px-[1px]", p.train && p.val ? "bg-negative text-white underline decoration-2 underline-offset-2 font-semibold" : p.val ? "bg-data text-card rounded-full" : p.train ? "bg-chart-5/50" : "bg-secondary")} title={p.train && p.val ? "in both" : p.val ? "validation" : p.train ? "training" : "unused"}>
                      {visible(c)}
                    </span>
                  )
                })}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div><dt className="text-[13px] text-muted-foreground">Validation windows</dt><dd className="num text-2xl">{result.valCount}</dd></div>
              <div><dt className="text-[13px] text-muted-foreground">Share text with a training window</dt><dd className={cn("num text-2xl", result.leakedVal > 0 && "text-negative")}>{result.leakedVal}</dd></div>
              <div><dt className="text-[13px] text-muted-foreground">Exact input also in training</dt><dd className="num text-2xl">{result.duplicatedContexts}</dd></div>
            </dl>
            <Button variant="outline" className="self-start" onClick={() => { setRan({ strategy, leaked: result.leakedVal, total: result.valCount }); actions.logRun({ route: "data", title: `Split: ${strategy}`, summary: `${result.leakedVal} of ${result.valCount} validation windows leaked`, source: "simulation" }, ["split", "leakage"]) }}>
              Record this result
            </Button>
            <p className="text-sm">
              {strategy === "windows-first"
                ? "Random assignment puts overlapping windows on both sides. The model is then tested on text it has partly seen, so its score is too optimistic."
                : "Cutting the text once, before making windows, keeps the two sides apart. Windows at the cut are simply not made, so no text is shared."}
              {" "}The Evaluation bench splits your engine&apos;s data this way.
            </p>
          </div>
        )}
      </Panel>
      <GuidedCycle
        id="splits"
        conceptId="leakage"
        route="data"
        question="With windows made first and split at random, how many validation windows share characters with a training window?"
        choices={[{ id: "none", label: "None of them" }, { id: "some", label: "Some (under half)" }, { id: "most", label: "Most (half or more)" }]}
        correct={ran?.strategy === "windows-first" ? outcome : undefined}
        observation={ran ? <>With {ran.strategy === "windows-first" ? "windows first" : "split first"}: {ran.leaked} of {ran.total} validation windows share text with training ({fmt.pct(ran.total ? ran.leaked / ran.total : 0, 0)}).</> : undefined}
        explainPrompt="Why does splitting first prevent this? Why does a window size of 1 still leak a little with random splits?"
        change="Switch the strategy and record again. Then raise the window size and see how leakage changes."
        hints={["A window of size 4 covers 5 characters, counting its target.", "Two windows overlap if their starts are closer than the window length."]}
      />
    </>
  )
}

// ----------------------------------------------------------------------------- explanation

function DataExplain({ tab }: { tab: Tab }) {
  return (
    <Explain
      plain={
        tab === "corpus" ? (
          <p>The <Term id="corpus">corpus</Term> is everything your engine learns from. Your engine treats every character, including spaces and newlines, as one <Term id="token">token</Term>.</p>
        ) : tab === "tokens" ? (
          <p><Term id="tokenization">Tokenization</Term> cuts text into units. Characters need no learning; words make long sequences short but can&apos;t handle new words; <Term id="bpe">BPE</Term> learns pieces in between.</p>
        ) : tab === "windows" ? (
          <p>A model learns from <Term id="training-pair">pairs</Term>: some context, then the next token. Sliding a <Term id="context-window">window</Term> along the text makes one pair per position.</p>
        ) : (
          <p>To test fairly, some text must stay unseen. Because neighbouring windows overlap, the order matters: split the text first, then make windows. Otherwise you get <Term id="leakage">leakage</Term>.</p>
        )
      }
    >
      <ExplainSection title="Show the relevant code">
        {tab === "corpus" && <EngineCode path="nextword/bigram.py" symbol="tokenize" />}
        {tab === "tokens" && <SimCode path="web/src/sim/tokenize.ts" symbol="learnBpe" text={tokenizeSource} />}
        {tab === "windows" && <SimCode path="web/src/sim/windows.ts" symbol="makeWindows" text={windowsSource} />}
        {tab === "splits" && (
          <div className="flex flex-col gap-4">
            <SimCode path="web/src/sim/windows.ts" symbol="splitWindows" text={windowsSource} />
            <EngineCode path="nextword/lab/service.py" symbol="split_text" />
          </div>
        )}
      </ExplainSection>
      <ExplainSection title="Train, validation and test">
        <p><span className="font-medium">Training</span> text sets the counts or weights. <span className="font-medium">Validation</span> text guides choices while you develop (which smoothing, how many steps). <span className="font-medium">Test</span> text is kept for one final check; using it to choose settings quietly turns it into validation.</p>
      </ExplainSection>
      <EvidenceRecorder conceptId={tab === "corpus" ? "token" : tab === "tokens" ? "tokenization" : tab === "windows" ? "training-pair" : "leakage"} compact />
    </Explain>
  )
}

