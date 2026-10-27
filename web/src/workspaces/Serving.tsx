import { useEffect, useRef, useState } from "react"
import { NavArrowRightIcon, PlayIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, NumberField, Panel, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { api, type Benchmark, type Generation } from "@/lib/api"
import { fmt, useAsync, usePrefersReducedMotion } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"

export default function Serving() {
  return (
    <Workspace
      title="Serving and performance"
      subtitle="What happens between pressing Suggest and seeing text, measured on your own machine where the Lab can measure it."
      explain={<ServingExplain />}
    >
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
    { name: "Browser input", detail: `“${last.gen.prompt}”, 40 chars, seed 1`, ms: null as number | null },
    { name: "Request validation", detail: "prompt, length and seed checked", ms: t.validate },
    { name: "Tokenization and counting", detail: t.countCacheHit ? "count table reused from cache" : "text tokenized and counted", ms: t.count },
    { name: "Inference and decoding", detail: `${last.gen.steps.length} lookups and draws, measured together`, ms: t.generate },
    { name: "Response", detail: "trace formatted as JSON", ms: t.format },
    { name: "Network and browser", detail: "round trip minus time inside the backend", ms: Math.max(0, last.roundTrip - t.total) },
  ] : []

  return (
    <Panel id="life" title="One request, step by step" source={<Source kind="model" detail="measured with perf_counter and performance.now" />}
      aside={<Button onClick={send} disabled={busy || !prompt}><PlayIcon className="size-4" /> {busy ? "Sending…" : "Send a request"}</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <label htmlFor="life-prompt" className="text-sm font-medium">Prompt</label>
          <input id="life-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
        </div>
        {error && <ErrorNote error={error} onRetry={send} />}
        {!last ? <EmptyNote>Send a request. The first one counts the training text; later ones reuse the counts.</EmptyNote> : (
          <>
            <ol className="flex flex-col gap-1.5 lg:flex-row lg:items-stretch lg:gap-0" aria-label="Request lifecycle">
              {stages.map((s, i) => (
                <li key={s.name} className="flex items-center lg:flex-1">
                  <div className="flex-1 rounded-md bg-raised p-3">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-[13px] text-muted-foreground">{s.detail}</p>
                    <p className="num mt-1 text-sm">{s.ms === null ? "–" : fmt.ms(s.ms)}</p>
                  </div>
                  {i < stages.length - 1 && <NavArrowRightIcon className="mx-0.5 hidden size-4 flex-none text-muted-foreground lg:block" />}
                </li>
              ))}
            </ol>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><dt className="text-[13px] text-muted-foreground">Round trip (browser)</dt><dd className="num text-[28px] leading-tight">{fmt.ms(last.roundTrip)}</dd></div>
              <div><dt className="text-[13px] text-muted-foreground">Inside the backend</dt><dd className="num text-xl">{fmt.ms(t!.total)}</dd></div>
              <div><dt className="text-[13px] text-muted-foreground"><Term id="caching">Count cache</Term></dt><dd className="text-xl">{t!.countCacheHit ? "hit" : "miss"}</dd></div>
              <div><dt className="text-[13px] text-muted-foreground"><Term id="model-version">Model version</Term></dt><dd className="tok text-sm">{last.gen.modelVersion}</dd></div>
            </dl>
            {history.length > 1 && (
              <table className="text-sm">
                <caption className="mb-1 text-left text-[13px] text-muted-foreground">Recent requests, newest first</caption>
                <thead><tr className="text-[12px] text-muted-foreground"><th className="text-right font-normal">Round trip</th><th className="text-right font-normal">Backend</th><th className="text-right font-normal">Counting</th><th className="pl-4 text-left font-normal">Cache</th></tr></thead>
                <tbody>{history.map((h, i) => <tr key={i} className="border-t border-rule"><td className="num text-right">{fmt.ms(h.roundTrip)}</td><td className="num text-right">{fmt.ms(h.gen.timingsMs.total)}</td><td className="num text-right">{fmt.ms(h.gen.timingsMs.count)}</td><td className="pl-4">{h.gen.timingsMs.countCacheHit ? "hit" : "miss"}</td></tr>)}</tbody>
              </table>
            )}
            <p className="text-[13px] text-muted-foreground">Times this small vary from run to run; Python, the browser and the operating system all add noise. Use the benchmark for a spread.</p>
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
      aside={<Button variant="outline" onClick={async () => { const r = await bench.run({ corpus: "sample", prompt: "The rain", length, runs }); if (r) actions.logRun({ route: "serving", title: `Benchmark, ${runs} runs`, summary: `p50 ${r.latencyMs.p50.toFixed(2)} ms`, source: "model" }, ["latency", "throughput"]) }} disabled={bench.loading}>{bench.loading ? "Running…" : "Run benchmark"}</Button>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <NumberField id="b-runs" label="Requests (one after another)" value={runs} min={1} max={500} onChange={setRuns} />
          <SliderField id="b-len" label="Characters per request" value={length} min={1} max={200} step={1} onChange={setLength} />
          <p className="text-[13px] text-muted-foreground">Each request uses a different seed. The count table is warmed first, so this measures generation, not counting.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {bench.error ? <ErrorNote error={bench.error} /> : bench.loading && !b ? <LoadingRows rows={4} /> : !b ? <EmptyNote>Run the benchmark to measure your engine on this machine.</EmptyNote> : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><dt className="text-[13px] text-muted-foreground">p50 <Term id="latency">latency</Term></dt><dd className="num text-[28px] leading-tight">{fmt.ms(b.latencyMs.p50)}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">p95 latency</dt><dd className="num text-xl">{fmt.ms(b.latencyMs.p95)}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground"><Term id="throughput">Throughput</Term></dt><dd className="num text-xl">{b.requestsPerSecond ? fmt.n(Math.round(b.requestsPerSecond)) : "–"} <span className="text-sm text-muted-foreground">req/s</span></dd></div>
                <div><dt className="text-[13px] text-muted-foreground">Characters</dt><dd className="num text-xl">{b.charsPerSecond ? fmt.n(Math.round(b.charsPerSecond)) : "–"} <span className="text-sm text-muted-foreground">/s</span></dd></div>
              </dl>
              <LineChart ariaLabel="Latency of each request" series={[{ name: "latency", tone: "data", points: b.samples.map((y, i) => ({ x: i + 1, y })) }]} xLabel="request" yLabel="ms" height={160} yMin={0} />
              <p className="text-[13px] text-muted-foreground">p50: half the requests were faster than this. p95: 95% were. {b.runs} requests, {b.length} characters each, {b.wallSeconds.toFixed(2)} s in total, {b.modelVersion}. Measured inside the backend only; the browser&apos;s round trip adds more.</p>
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
      <div className="mt-4"><SliderField id="bs" label="Batch size" value={batch} min={1} max={64} step={1} onChange={setBatch} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div><dt className="text-[13px] text-muted-foreground">Latency per request</dt><dd className="num text-xl">{perBatch} ms</dd></div>
        <div><dt className="text-[13px] text-muted-foreground">Throughput</dt><dd className="num text-xl">{throughput.toFixed(0)} req/s</dd></div>
      </dl>
      <p className="mt-3 text-[13px] text-muted-foreground">Bigger batches share the fixed cost, so throughput rises, but every request waits for the whole batch, so latency rises too.</p>
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
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => run("stream")}>Stream it</Button>
        <Button variant="outline" size="sm" onClick={() => run("whole")}>Send it whole</Button>
      </div>
      <p className="tok mt-3 min-h-12 whitespace-pre-wrap rounded-md bg-raised p-3 text-[14px]" aria-live="polite">{mode === "idle" ? <span className="text-muted-foreground">Nothing yet.</span> : <>{text.slice(0, shown).join("")}{shown < text.length && <span className="text-muted-foreground">▏</span>}</>}</p>
      {gen.error && <ErrorNote error={gen.error} />}
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div><dt className="text-[13px] text-muted-foreground">Time to first character</dt><dd className="num text-xl">{firstAt === null ? "–" : `${firstAt} ms`}</dd></div>
        <div><dt className="text-[13px] text-muted-foreground">Time to last character</dt><dd className="num text-xl">{doneAt === null ? "–" : `${doneAt} ms`}</dd></div>
      </dl>
      <p className="mt-3 text-[13px] text-muted-foreground">Total time is the same either way; streaming only makes the first words arrive sooner. The Lab&apos;s real API returns whole responses.</p>
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
      <div className="mt-4"><SliderField id="kvn" label="Tokens generated" value={n} min={1} max={64} step={1} onChange={setN} /></div>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-[12px] text-muted-foreground"><th className="text-left font-normal">Work over {n} steps</th><th className="text-right font-normal">No cache</th><th className="text-right font-normal">KV cache</th></tr></thead>
        <tbody>
          <tr className="border-t border-rule"><td className="py-1">Key and value computations</td><td className="num text-right">1 + 2 + … + {n} = {fmt.n(without)}</td><td className="num text-right">{n}</td></tr>
          <tr className="border-t border-rule"><td className="py-1">Query·key dot products</td><td className="num text-right">{fmt.n(dots)}</td><td className="num text-right">{fmt.n(dots)}</td></tr>
          <tr className="border-t border-rule"><td className="py-1">Stored between steps</td><td className="num text-right">nothing</td><td className="num text-right">{n} keys + {n} values</td></tr>
        </tbody>
      </table>
      <p className="mt-3 text-[13px] text-muted-foreground">It caches attention keys and values for the current sequence only. It is not a cache of complete answers, and it trades memory for compute. Your bigram engine has no attention, so it has nothing to cache this way.</p>
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
      <div className="mt-4"><SliderField id="qb" label="Bits per weight" value={bits} min={2} max={8} step={1} onChange={setBits} format={(v) => `${v} bits`} /></div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[12px] text-muted-foreground"><th className="text-right font-normal">Weight</th><th className="text-right font-normal">÷ scale, rounded</th><th className="text-right font-normal">Read back</th><th className="text-right font-normal">Error</th></tr></thead>
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

