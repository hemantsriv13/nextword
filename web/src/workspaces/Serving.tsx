import { useEffect, useRef, useState } from "react"
import { NavArrowRightIcon, PlayIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, NumberField, Panel, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { api, type Benchmark, type Generation } from "@/lib/api"
import { fmt, useAsync, usePrefersReducedMotion } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { InfoTip } from "@/components/lab/info-tip"
import { TermHelp } from "@/components/lab/term-help"

const GUIDE: Guide = {
  question: "What happens between pressing a button and seeing a suggestion, and where does the time go?",
  scope: "The request lifecycle and the benchmark are real requests to your Python engine, timed on your machine. Batching, streaming, the KV cache and quantization are separate demonstrations: batching uses stated, made-up costs, streaming replays a real trace, and the last two are worked examples.",
  sources: ["model", "simulation", "example"],
  nodes: [
    { id: "input", label: "Browser input", kind: "input", target: "life", carries: "JSON request",
      goesIn: "Your prompt, plus a fixed length (40) and seed (1).",
      happens: "The page sends them to the local backend as a JSON request, and starts a timer.",
      why: "The engine runs in Python; the page can only ask it over HTTP.",
      comesOut: "One HTTP request to /api/generate.",
      next: "The backend checks it." },
    { id: "validate", label: "Validation", kind: "operation", target: "life", carries: "checked settings",
      goesIn: "The parsed request.",
      happens: "The prompt, length and seed are checked; a bad value is refused with a message.",
      why: "A clear refusal is better than a crash or a silent wrong answer.",
      comesOut: "Settings the engine can use. Timed separately.",
      next: "The count table is fetched." },
    { id: "counts", label: "Count table", kind: "operation", target: "life", carries: "counts",
      goesIn: "The training text's id.",
      happens: "The first request counts the text; later ones reuse the table from a cache, checked by the text's fingerprint.",
      why: "Counting is the slowest part, and its result doesn't change unless the text does.",
      comesOut: "The count table. Timed separately.",
      next: "Generation uses it.",
      tryIt: "Send two requests: the second one's counting time drops to almost nothing." },
    { id: "generate", label: "Generation", kind: "operation", target: "life", carries: "a trace",
      goesIn: "The counts, the prompt's last character, the length and the seeded generator.",
      happens: "40 times: look up a row, divide, draw, append.",
      why: "This is the model itself running, called inference.",
      comesOut: "The suggestion and one step record per character. Lookups and draws are timed together, as one stage.",
      next: "The steps are formatted." },
    { id: "response", label: "Response", kind: "output", target: "life",
      goesIn: "The steps.",
      happens: "They are turned into the trace the page shows, then sent back as JSON.",
      why: "The page needs both the text and the explanation of it.",
      comesOut: "The response. Formatting is timed; JSON encoding, the network and the browser's decoding are not timed one by one, only as the remainder of the round trip.",
      next: "The page displays it and stops its timer." },
  ],
  tour: [
    { target: "life", title: "One real request, timed", plain: <><p>Press Send a request. Each box is one stage between your input and the response, with how long it took in milliseconds (ms): thousandths of a second.</p><p>Some stages are timed separately inside Python; generation's lookups and draws are timed as one; the last box is simply the round trip minus everything measured inside the backend.</p></>,
      terms: [{ id: "api", role: "the request the page sends." }, { id: "latency", role: "the time from request to response." }, { id: "caching", role: "reusing the count table." }] },
    { target: "bench", title: "Many requests: a spread, not one number", plain: <><p>The benchmark repeats the request many times inside the backend. The median (p50) is a typical time; p95 is the time 95% of requests stay under. One request alone can't tell you either.</p></>,
      terms: [{ id: "throughput", role: "requests per second." }] },
    { target: "batch", title: "Batching, as a simulation", plain: <><p>Grouping requests shares a fixed cost per batch but makes early requests wait. The costs here are stated, made-up numbers; your engine does not batch.</p></>,
      terms: [{ id: "serving-batch", role: "grouping requests to share cost." }] },
    { target: "stream", title: "Streaming: same total, earlier first character", plain: <><p>Streaming sends each character as soon as it is ready, so the first one appears much sooner, while the whole answer takes as long as before. This replays a real trace at a fixed, made-up speed.</p></>,
      terms: [{ id: "streaming", role: "sending output as it is produced." }] },
    { target: "kv", title: "KV cache: counting work saved", plain: <><p>A transformer would recompute keys and values for every earlier position at each step. Caching them turns that repeated work into one new computation per step. The counts here are a worked example; your engine has no attention.</p></>,
      terms: [{ id: "kv-cache", role: "keeping keys and values from earlier steps." }] },
    { target: "quant", title: "Quantization: fewer bits per weight", plain: <><p>Storing weights with fewer bits saves memory, at the cost of rounding each weight to a nearby value. The errors are shown on eight example weights.</p></>,
      terms: [{ id: "quantization", role: "rounding weights to fewer bits." }] },
  ],
}

export default function Serving() {
  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Serving and performance"
      subtitle="What happens between pressing Suggest and seeing text, measured on your own machine where the Lab can measure it."
      explain={<ServingExplain />}
    >
      <WorkspaceGuide />
      <Lifecycle />
      <BenchmarkPanel />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Batching />
        <Streaming />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <KvCache />
        <Quantization />
      </div>
    </Workspace>
    </Teach>
  )
}

// ----------------------------------------------------------------------------- one request

interface Measured { gen: Generation; roundTrip: number }

function Lifecycle() {
  const [prompt, setPrompt] = useState("The rain")
  const [history, setHistory] = useState<Measured[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const last = history[0]

  async function send() {
    setBusy(true)
    setError(null)
    const t0 = performance.now()
    try {
      const gen = await api.generate({ corpus: "sample", prompt, length: 40, seed: 1 })
      const roundTrip = performance.now() - t0
      setHistory([{ gen, roundTrip }, ...history].slice(0, 6))
      actions.logRun({ route: "serving", title: "Timed one request", summary: `${roundTrip.toFixed(1)} ms round trip`, source: "model" }, ["api", "latency", "model-version", "caching"])
    } catch (e) {
      setError(e as Error)
    }
    setBusy(false)
  }

  const t = last?.gen.timingsMs
  const stages = last && t ? [
    { name: "Browser input", detail: `“${last.gen.prompt}”, 40 chars, seed 1`, ms: null as number | null, how: "not timed: the timer starts as the request is sent" },
    { name: "Request validation", detail: "prompt, length and seed checked", ms: t.validate, how: "timed separately in Python" },
    { name: "Tokenization and counting", detail: t.countCacheHit ? "count table reused from cache" : "text tokenized and counted", ms: t.count, how: "timed separately in Python" },
    { name: "Inference and decoding", label: <><TermHelp id="training-vs-inference" here="Using your engine's fixed counts to predict: look up the row for the last character, then draw. Nothing is learned during the request." example={<>This request made {last.gen.steps.length} lookups and draws in {t.generate.toFixed(2)} ms.</>}>Inference</TermHelp> and decoding</>, detail: `${last.gen.steps.length} lookups and draws`, ms: t.generate, how: "lookups and draws timed together" },
    { name: "Response", detail: "trace built for the page", ms: t.format, how: "timed separately in Python" },
    { name: "Network and browser", detail: "HTTP, JSON encoding and decoding, the browser", ms: Math.max(0, last.roundTrip - t.total), how: "not timed directly: round trip minus the Python total" },
  ] : []

  return (
    <Panel id="life" variant="canvas" title="One request, step by step" source={<Source kind="model" detail="measured with perf_counter and performance.now" />}
      teach={{
        calc: last && t ? <><Symbols rows={[
          ["round trip", "browser clock, from sending to receiving", fmt.ms(last.roundTrip)],
          ["Python total", "from the start of generate() in the backend to its return", fmt.ms(t.total)],
          ["parts", `${fmt.ms(t.validate)} + ${fmt.ms(t.count)} + ${fmt.ms(t.generate)} + ${fmt.ms(t.format)}`, fmt.ms(t.validate + t.count + t.generate + t.format)],
          ["remainder", "round trip − Python total: network, HTTP parsing, JSON and the browser", fmt.ms(Math.max(0, last.roundTrip - t.total))],
        ]} /><p>1 ms is a thousandth of a second. The Python clock starts after the request has been read and parsed, so that work is part of the remainder, not of any Python stage.</p></> : <p>Send a request; its timings appear here.</p>,
        code: <EngineCode path="nextword/lab/service.py" symbol="generate" />,
      }}
      aside={<Button data-help-id="serving.send" onClick={send} disabled={busy || !prompt}><PlayIcon className="size-4" /> {busy ? "Sending…" : "Send a request"}</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <span className="flex items-center gap-0.5"><label htmlFor="life-prompt" className="text-sm font-medium">Prompt</label><InfoTip id="serving.prompt" /></span>
          <input id="life-prompt" data-help-id="serving.prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
        </div>
        {error && <ErrorNote error={error} onRetry={send} />}
        {!last ? <EmptyNote>Send a request. The first one counts the training text; later ones reuse the counts.</EmptyNote> : (
          <>
            <ol className="flex flex-col gap-1.5 lg:flex-row lg:items-stretch lg:gap-0" aria-label="Request lifecycle">
              {stages.map((s, i) => (
                <li key={s.name} className="flex items-center lg:flex-1">
                  <div className="flex-1 rounded-md bg-raised p-3">
                    <p className="text-sm font-medium">{"label" in s ? s.label : s.name}</p>
                    <p className="text-label text-muted-foreground">{s.detail}</p>
                    <p className="num mt-1 text-sm">{s.ms === null ? "–" : fmt.ms(s.ms)}</p>
                    <p className="mt-0.5 text-label text-muted-foreground">{s.how}</p>
                  </div>
                  {i < stages.length - 1 && <NavArrowRightIcon className="mx-0.5 hidden size-4 flex-none text-muted-foreground lg:block" />}
                </li>
              ))}
            </ol>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><dt className="text-label text-muted-foreground">Round trip (browser)</dt><dd className="num text-[28px] leading-tight">{fmt.ms(last.roundTrip)}</dd></div>
              <div><dt className="text-label text-muted-foreground">Inside the backend</dt><dd className="num text-xl">{fmt.ms(t!.total)}</dd></div>
              <div><dt className="text-label text-muted-foreground"><Term id="caching">Count cache</Term></dt><dd className="text-xl">{t!.countCacheHit ? "hit" : "miss"}</dd></div>
              <div><dt className="text-label text-muted-foreground"><Term id="model-version">Model version</Term></dt><dd className="tok text-sm">{last.gen.modelVersion}</dd></div>
            </dl>
            {history.length > 1 && (
              <table className="text-sm">
                <caption className="mb-1 text-left text-label text-muted-foreground">Recent requests, newest first</caption>
                <thead><tr className="text-label text-muted-foreground"><th className="text-right font-normal">Round trip</th><th className="text-right font-normal">Backend</th><th className="text-right font-normal">Counting</th><th className="pl-4 text-left font-normal">Cache</th></tr></thead>
                <tbody>{history.map((h, i) => <tr key={i} className="border-t border-rule"><td className="num text-right">{fmt.ms(h.roundTrip)}</td><td className="num text-right">{fmt.ms(h.gen.timingsMs.total)}</td><td className="num text-right">{fmt.ms(h.gen.timingsMs.count)}</td><td className="pl-4">{h.gen.timingsMs.countCacheHit ? "hit" : "miss"}</td></tr>)}</tbody>
              </table>
            )}
            <p className="text-label text-muted-foreground">Times this small vary from run to run; Python, the browser and the operating system all add noise. Use the benchmark for a spread.</p>
          </>
        )}
      </div>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- benchmark

function BenchmarkPanel() {
  const [runs, setRuns] = useState(50)
  const [length, setLength] = useState(40)
  const bench = useAsync(api.benchmark)
  const b: Benchmark | undefined = bench.data
  return (
    <Panel id="bench" title="Latency and throughput" source={<Source kind="model" detail="measured inside the backend" />}
      aside={<Button variant="outline" data-help-id="serving.benchmark" onClick={async () => { const r = await bench.run({ corpus: "sample", prompt: "The rain", length, runs }); if (r) actions.logRun({ route: "serving", title: `Benchmark, ${runs} runs`, summary: `p50 ${r.latencyMs.p50.toFixed(2)} ms`, source: "model" }, ["latency", "throughput"]) }} disabled={bench.loading}>{bench.loading ? "Running…" : "Run benchmark"}</Button>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <NumberField id="b-runs" helpId="serving.bench-settings" label="Requests (one after another)" value={runs} min={1} max={500} onChange={setRuns} />
          <SliderField id="b-len" helpId="serving.bench-settings" label="Characters per request" value={length} min={1} max={200} step={1} onChange={setLength} />
          <p className="text-label text-muted-foreground">Each request uses a different seed. The count table is warmed first, so this measures generation, not counting.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {bench.error ? <ErrorNote error={bench.error} /> : bench.loading && !b ? <LoadingRows rows={4} /> : !b ? <EmptyNote>Run the benchmark to measure your engine on this machine.</EmptyNote> : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><dt className="text-label text-muted-foreground">p50 <Term id="latency">latency</Term></dt><dd className="num text-[28px] leading-tight">{fmt.ms(b.latencyMs.p50)}</dd></div>
                <div><dt className="text-label text-muted-foreground">p95 latency</dt><dd className="num text-xl">{fmt.ms(b.latencyMs.p95)}</dd></div>
                <div><dt className="text-label text-muted-foreground"><Term id="throughput">Throughput</Term></dt><dd className="num text-xl">{b.requestsPerSecond ? fmt.n(Math.round(b.requestsPerSecond)) : "–"} <span className="text-sm text-muted-foreground">req/s</span></dd></div>
                <div><dt className="text-label text-muted-foreground">Characters</dt><dd className="num text-xl">{b.charsPerSecond ? fmt.n(Math.round(b.charsPerSecond)) : "–"} <span className="text-sm text-muted-foreground">/s</span></dd></div>
              </dl>
              <LineChart ariaLabel="Latency of each request" series={[{ name: "latency", tone: "data", points: b.samples.map((y, i) => ({ x: i + 1, y })) }]} xLabel="request" yLabel="ms" height={160} yMin={0} />
              <p className="text-label text-muted-foreground">p50: half the requests were faster than this. p95: 95% were. {b.runs} requests, {b.length} characters each, {b.wallSeconds.toFixed(2)} s in total, {b.modelVersion}. Measured inside the backend only; the browser&apos;s round trip adds more.</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- batching (simulation)

const OVERHEAD = 20 // ms per batch, a stated assumption
const PER_ITEM = 2 // ms per request in a batch, a stated assumption

function Batching() {
  const [batch, setBatch] = useState(1)
  const perBatch = OVERHEAD + PER_ITEM * batch
  const throughput = (batch / perBatch) * 1000
  return (
    <Panel id="batch" title="Batching" source={<Source kind="simulation" detail="made-up costs, not measured" />}>
      <p className="text-sm">Assume each pass over the model costs a fixed {OVERHEAD} ms plus {PER_ITEM} ms per request in the <Term id="serving-batch">batch</Term>. These numbers are invented for illustration; your engine doesn&apos;t batch.</p>
      <div className="mt-4"><SliderField id="bs" helpId="serving.batch" label="Batch size" value={batch} min={1} max={64} step={1} onChange={setBatch} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div><dt className="text-label text-muted-foreground">Latency per request</dt><dd className="num text-xl">{perBatch} ms</dd></div>
        <div><dt className="text-label text-muted-foreground">Throughput</dt><dd className="num text-xl">{throughput.toFixed(0)} req/s</dd></div>
      </dl>
      <p className="mt-3 text-label text-muted-foreground">Bigger batches share the fixed cost, so throughput rises, but every request waits for the whole batch, so latency rises too.</p>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- streaming (simulation)

function Streaming() {
  // One entry per engine character (from the trace), so an emoji streams as one piece.
  const [text, setText] = useState<string[]>([])
  const [shown, setShown] = useState(0)
  const [mode, setMode] = useState<"idle" | "stream" | "whole">("idle")
  const [firstAt, setFirstAt] = useState<number | null>(null)
  const [doneAt, setDoneAt] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const reduced = usePrefersReducedMotion()
  const gen = useAsync(api.generate)
  const delay = 40 // ms per character, a stated assumption
  useEffect(() => () => clearInterval(timer.current), [])

  async function run(m: "stream" | "whole") {
    clearInterval(timer.current)
    const r = gen.data ?? (await gen.run({ corpus: "sample", prompt: "The rain", length: 40, seed: 3 }))
    if (!r) return
    const chars = r.steps.map((s) => s.token)
    setText(chars)
    setMode(m)
    setFirstAt(null); setDoneAt(null); setShown(0)
    const total = chars.length * delay
    if (m === "whole") {
      timer.current = window.setTimeout(() => { setShown(chars.length); setFirstAt(total); setDoneAt(total) }, reduced ? 0 : total)
      return
    }
    let i = 0
    timer.current = window.setInterval(() => {
      i++
      setShown(i)
      if (i === 1) setFirstAt(delay)
      if (i >= chars.length) { clearInterval(timer.current); setDoneAt(total) }
    }, reduced ? 1 : delay)
  }

  return (
    <Panel id="stream" title="Streaming" source={<Source kind="simulation" detail={`replays a real trace at ${delay} ms per character`} />}>
      <p className="text-sm">Pretend each character takes {delay} ms to generate. <Term id="streaming">Streaming</Term> sends each one as it is ready; without it, you wait for the whole answer.</p>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="sm" data-help-info="off" data-help-id="serving.stream" onClick={() => run("stream")}>Stream it</Button>
        <Button variant="outline" size="sm" data-help-id="serving.stream" onClick={() => run("whole")}>Send it whole</Button>
      </div>
      <p className="tok mt-3 min-h-12 whitespace-pre-wrap rounded-md bg-raised p-3 text-sm" aria-live="polite">{mode === "idle" ? <span className="text-muted-foreground">Nothing yet.</span> : <>{text.slice(0, shown).join("")}{shown < text.length && <span className="text-muted-foreground">▏</span>}</>}</p>
      {gen.error && <ErrorNote error={gen.error} />}
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div><dt className="text-label text-muted-foreground">Time to first character</dt><dd className="num text-xl">{firstAt === null ? "–" : `${firstAt} ms`}</dd></div>
        <div><dt className="text-label text-muted-foreground">Time to last character</dt><dd className="num text-xl">{doneAt === null ? "–" : `${doneAt} ms`}</dd></div>
      </dl>
      <p className="mt-3 text-label text-muted-foreground">Total time is the same either way; streaming only makes the first words arrive sooner. The Lab&apos;s real API returns whole responses.</p>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- KV cache (worked example)

function KvCache() {
  const [n, setN] = useState(6)
  const without = (n * (n + 1)) / 2
  const dots = (n * (n + 1)) / 2
  return (
    <Panel id="kv" title="KV cache" source={<Source kind="example" detail="counting operations, one layer and head" />}>
      <p className="text-sm">A transformer generating token t needs keys and values for positions 1…t. Without a cache it recomputes all of them every step. A <Term id="kv-cache">KV cache</Term> keeps the ones already computed.</p>
      <div className="mt-4"><SliderField id="kvn" helpId="serving.kv" label="Tokens generated" value={n} min={1} max={64} step={1} onChange={setN} /></div>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-label text-muted-foreground"><th className="text-left font-normal">Work over {n} steps</th><th className="text-right font-normal">No cache</th><th className="text-right font-normal">KV cache</th></tr></thead>
        <tbody>
          <tr className="border-t border-rule"><td className="py-1">Key and value computations</td><td className="num text-right">1 + 2 + … + {n} = {fmt.n(without)}</td><td className="num text-right">{n}</td></tr>
          <tr className="border-t border-rule"><td className="py-1">Query·key dot products</td><td className="num text-right">{fmt.n(dots)}</td><td className="num text-right">{fmt.n(dots)}</td></tr>
          <tr className="border-t border-rule"><td className="py-1">Stored between steps</td><td className="num text-right">nothing</td><td className="num text-right">{n} keys + {n} values</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-label text-muted-foreground">It caches attention keys and values for the current sequence only. It is not a cache of complete answers, and it trades memory for compute. Your bigram engine has no attention, so it has nothing to cache this way.</p>
    </Panel>
  )
}

// ----------------------------------------------------------------------------- quantization (worked example)

const WEIGHTS = [0.4137, -1.2051, 0.0832, 0.9314, -0.3378, 1.7426, -0.0091, -0.6603]

function Quantization() {
  const [bits, setBits] = useState(8)
  const levels = 2 ** (bits - 1) - 1
  const scale = Math.max(...WEIGHTS.map(Math.abs)) / levels
  const q = WEIGHTS.map((w) => Math.round(w / scale))
  const back = q.map((v) => v * scale)
  const maxErr = Math.max(...WEIGHTS.map((w, i) => Math.abs(w - back[i])))
  return (
    <Panel id="quant" title="Quantization" source={<Source kind="example" detail="eight example weights" />}>
      <p className="text-sm"><Term id="quantization">Quantization</Term> stores each weight as a small integer times one shared scale. Symmetric: scale = max|w| ÷ {levels} = <span className="num">{scale.toFixed(5)}</span>.</p>
      <div className="mt-4"><SliderField id="qb" helpId="serving.quant" label="Bits per weight" value={bits} min={2} max={8} step={1} onChange={setBits} format={(v) => `${v} bits`} /></div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-label text-muted-foreground"><th className="text-right font-normal">Weight</th><th className="text-right font-normal">÷ scale, rounded</th><th className="text-right font-normal">Read back</th><th className="text-right font-normal">Error</th></tr></thead>
          <tbody>{WEIGHTS.map((w, i) => <tr key={i} className="border-t border-rule"><td className="num text-right">{w.toFixed(4)}</td><td className="num text-right">{q[i]}</td><td className="num text-right">{back[i].toFixed(4)}</td><td className={cn("num text-right", Math.abs(w - back[i]) > 0.05 && "text-negative")}>{(back[i] - w >= 0 ? "+" : "−") + Math.abs(back[i] - w).toFixed(4)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">Memory: {bits} bits instead of 32 per weight ({(32 / bits).toFixed(0)}× smaller). Largest error here: <span className="num">{maxErr.toFixed(4)}</span>. Whether that error matters for a model has to be measured; it isn&apos;t free.</p>
    </Panel>
  )
}

function ServingExplain() {
  return (
    <Explain
      plain={
        <>
          <p>The Lab&apos;s page talks to your engine through an <Term id="api">API</Term>: it sends a small JSON request to an endpoint on your own computer, and the engine sends back the suggestion with its trace and timings.</p>
          <p><Term id="latency">Latency</Term> is how long one request takes. <Term id="throughput">Throughput</Term> is how many get done per second. They are related but not the same.</p>
        </>
      }
    >
      <ExplainSection title="What each timing measures" defaultOpen>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li><span className="font-medium">Round trip:</span> from the browser sending the request to receiving the full response (performance.now).</li>
          <li><span className="font-medium">Inside the backend:</span> from the handler starting validation to the response being built (time.perf_counter).</li>
          <li><span className="font-medium">Inference and decoding:</span> probability lookups and random draws for every character, timed together because they alternate.</li>
          <li><span className="font-medium">Network and browser:</span> the difference: local HTTP, JSON parsing, and scheduling.</li>
        </ul>
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <EngineCode path="nextword/lab/service.py" symbol="generate" />
          <EngineCode path="nextword/lab/service.py" symbol="benchmark" />
        </div>
      </ExplainSection>
      <Note>Batching and streaming above are simulations with stated costs; the KV cache and quantization panels are worked examples. Only the request timings and the benchmark are measurements.</Note>
      <EvidenceRecorder conceptId="latency" compact />
    </Explain>
  )
}

