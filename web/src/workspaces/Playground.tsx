import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, DiceThreeIcon, PauseIcon, PlayIcon, RefreshDoubleIcon, SkipNextIcon, UndoIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { IntervalStrip, ProbBars, Tok } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { EvidenceRecorder } from "@/components/lab/evidence"
import { Term } from "@/components/lab/glossary"
import { GuidedCycle } from "@/components/lab/guide"
import { EmptyNote, ErrorNote, Explain, ExplainSection, LoadingRows, Note, NumberField, Panel, Segmented, SliderField, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { api, type Generation } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync, usePrefersReducedMotion } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { cn } from "@/lib/utils"
import { visible } from "@/sim/tokenize"

const ENGINES = [
  { id: "char-bigram", label: "Character bigram", note: "Your model", available: true },
  { id: "mlp", label: "Neural MLP", note: "Stage 2, not built yet", available: false },
  { id: "transformer", label: "Tiny transformer", note: "Stage 3, not built yet", available: false },
]

const newSeed = () => Math.floor(Math.random() * 10000)

export default function Playground() {
  const [prompt, setPrompt] = useState("The rain")
  const [corpus, setCorpus] = useState("sample")
  const [length, setLength] = useState(40)
  const [seed, setSeed] = useState(1)
  const [revealed, setRevealed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const reduced = usePrefersReducedMotion()
  const gen = useAsync(api.generate)
  const { corpora } = useCorpora()
  const editor = useRef<HTMLTextAreaElement>(null)

  const result = gen.data
  const steps = result?.steps ?? []
  const shown = result ? result.suggestion.slice(0, revealed) : ""
  const stale = !!result && (result.prompt !== prompt || result.seed !== seed || result.length !== length || result.corpus.id !== corpus)

  async function run(stepMode: boolean, seedOverride?: number) {
    setPlaying(false)
    const s = seedOverride ?? seed
    const r = await gen.run({ corpus, prompt, length, seed: s })
    if (r) {
      setRevealed(stepMode ? 1 : r.steps.length)
      setSelectedStep(stepMode ? 0 : null)
      actions.logRun({ route: "playground", title: `Generated from “${prompt.slice(-20)}”`, summary: `${r.suggestion.length} chars, seed ${r.seed}, ${r.modelVersion}`, source: "model" }, ["bigram", "sampling", "autoregressive"])
    }
  }

  function step() {
    if (!result || stale) return void run(true)
    if (revealed < steps.length) {
      setRevealed(revealed + 1)
      setSelectedStep(revealed)
    }
  }

  // Playing stops by itself at the last step; no state change is needed for that.
  const isPlaying = playing && !!result && revealed < steps.length
  useEffect(() => {
    if (!isPlaying) return
    const t = setTimeout(() => { setRevealed((r) => r + 1); setSelectedStep(revealed) }, reduced ? 0 : 220)
    return () => clearTimeout(t)
  }, [isPlaying, revealed, reduced])

  function accept() {
    if (!shown) return
    setPrompt(prompt + shown)
    gen.reset()
    setRevealed(0)
    setSelectedStep(null)
    editor.current?.focus()
  }

  function regenerate() {
    const s = newSeed()
    setSeed(s)
    void run(false, s)
  }

  function resetAll() {
    setPlaying(false)
    gen.reset()
    setRevealed(0)
    setSelectedStep(null)
  }

  const current = selectedStep !== null ? steps[selectedStep] : steps[Math.max(0, revealed - 1)]
  const lastChar = prompt.slice(-1)

  return (
    <Workspace
      title="Writing playground"
      subtitle="Your bigram engine suggests what comes next. Every number here comes from your Python engine."
      explain={<PlaygroundExplain current={current} result={result} />}
    >
      <Panel
        id="write"
        title="Your text"
        source={<Source kind="model" detail={result ? result.modelVersion : "char-bigram"} />}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run(false)} disabled={!prompt || gen.loading}>
              {gen.loading ? "Generating…" : "Suggest"}
            </Button>
            <Button variant="outline" onClick={accept} disabled={!shown || stale} title="Tab in the editor also accepts">
              <CheckIcon className="size-4" /> Accept
            </Button>
            <Button variant="outline" onClick={regenerate} disabled={!prompt || gen.loading}>
              <RefreshDoubleIcon className="size-4" /> Another suggestion
            </Button>
          </div>
        }
      >
        <label htmlFor="prompt" className="sr-only">Your text</label>
        <Textarea
          id="prompt"
          ref={editor}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && shown && !stale && !e.shiftKey) { e.preventDefault(); accept() }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(false) }
          }}
          rows={4}
          className="text-[16px] leading-relaxed"
          aria-describedby="prompt-help"
        />
        <p id="prompt-help" className="mt-2 text-[13px] text-muted-foreground">
          Ctrl+Enter suggests. Tab accepts the suggestion shown below.
        </p>

        <div className="mt-4 rounded-md bg-raised p-4" aria-live="polite">
          <p className="mb-2 text-sm text-muted-foreground">Prompt and suggestion</p>
          {gen.error ? (
            <ErrorNote error={gen.error} onRetry={() => run(false)} />
          ) : gen.loading && !result ? (
            <LoadingRows rows={2} label="Generating" />
          ) : (
            <p className="tok whitespace-pre-wrap break-words text-[15px] leading-7">
              <span>{prompt.slice(0, -1)}</span>
              {lastChar && <mark className="rounded-sm bg-context px-0.5 text-context-ink" title="The only character the engine reads">{lastChar === " " ? "␣" : lastChar === "\n" ? "↵\n" : lastChar}</mark>}
              {result && !stale && <span className="rounded-sm bg-data-soft">{shown}</span>}
              {result && !stale && revealed < steps.length && <span className="text-muted-foreground">▏</span>}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-context" /> context the engine reads (one character)</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-data-soft" /> generated</span>
          </div>
          {stale && <p className="mt-2 text-sm">The settings changed since this suggestion. Suggest again to update it.</p>}
          {result?.stopped && !stale && <Note tone="warning">{result.stopped}.</Note>}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-2">
            <span id="engine-label" className="text-sm font-medium">Engine</span>
            <Select value="char-bigram" onValueChange={() => {}} items={ENGINES.map((e) => ({ value: e.id, label: e.label }))}>
              <SelectTrigger aria-labelledby="engine-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENGINES.map((e) => (
                  <SelectItem key={e.id} value={e.id} disabled={!e.available}>
                    {e.label} <span className="text-muted-foreground">({e.note})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span id="corpus-label" className="text-sm font-medium">Training text</span>
            <Select value={corpus} onValueChange={(v) => setCorpus(String(v))} items={(corpora ?? []).map((c) => ({ value: c.id, label: c.name }))}>
              <SelectTrigger aria-labelledby="corpus-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(corpora ?? [{ id: "sample", name: "Sample passage", chars: 1167 }]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} <span className="num text-muted-foreground">({fmt.n(c.chars)} chars)</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SliderField id="length" label="Length" value={length} min={1} max={200} step={1} onChange={setLength} format={(v) => `${v} chars`} />
          <div className="flex items-start gap-2">
            <NumberField id="seed" label={<Term id="seed">Seed</Term>} value={seed} min={0} max={4294967295} onChange={setSeed} width="w-28" />
            <Button variant="outline" size="icon" aria-label="Random seed" title="Random seed" onClick={() => setSeed(newSeed())} className="mt-7">
              <DiceThreeIcon className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Decoding: <Term id="sampling">sampling</Term> only. Greedy, temperature, top-k and top-p are in the Decoding sandbox.
        </p>
      </Panel>

      <Panel
        id="trace"
        title="Generation trace"
        source={result && <Source kind="model" detail={`seed ${result.seed}`} />}
        aside={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={step} disabled={!prompt || gen.loading || (!!result && !stale && revealed >= steps.length)}>
              <SkipNextIcon className="size-4" /> Step
            </Button>
            <Button variant="outline" size="sm" onClick={() => (result && !stale ? setPlaying(!isPlaying) : run(true).then(() => setPlaying(true)))} disabled={!prompt || gen.loading}>
              {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />} {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetAll} disabled={!result}>
              <UndoIcon className="size-4" /> Reset
            </Button>
          </div>
        }
      >
        {!result ? (
          <EmptyNote>Step generates one character at a time, showing its distribution and random draw.</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="max-h-[420px] overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">One row per generated character</caption>
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-right font-normal">Step</th>
                    <th scope="col" className="px-3 py-2 font-normal">Context</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">Draw u</th>
                    <th scope="col" className="px-3 py-2 font-normal">Chosen</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">p(chosen)</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.slice(0, revealed).map((s, i) => {
                    const p = s.candidates.find((c) => c.token === s.token)?.p ?? 0
                    const sel = (selectedStep ?? revealed - 1) === i
                    return (
                      <tr key={i} className={cn("border-t border-rule", sel && "bg-active")}>
                        <td className="num px-3 py-1.5 text-right">
                          <button type="button" className="w-full text-right underline-offset-2 hover:underline" onClick={() => setSelectedStep(i)} aria-pressed={sel} aria-label={`Show step ${i + 1}`}>{i + 1}</button>
                        </td>
                        <td className="px-3 py-1.5"><Tok tone="context">{s.contextLabel}</Tok></td>
                        <td className="num px-3 py-1.5 text-right">{s.draw.toFixed(4)}</td>
                        <td className="px-3 py-1.5"><Tok tone="generated">{s.tokenLabel}</Tok></td>
                        <td className="num px-3 py-1.5 text-right">{p.toFixed(3)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {current && <StepDetail step={current} index={(selectedStep ?? revealed - 1) + 1} />}
          </div>
        )}
        {result && !stale && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Showing {revealed} of {steps.length} steps from one request. Stepping replays that request&apos;s trace; it draws no new random numbers, so it always matches the full suggestion.
          </p>
        )}
      </Panel>

      <ComparePanel corpus={corpus} length={length} seed={seed} />
    </Workspace>
  )
}

function StepDetail({ step, index }: { step: Generation["steps"][number]; index: number }) {
  const order = step.intervalOrder.map((t) => ({ key: t, label: visible(t), p: step.candidates.find((c) => c.token === t)!.p }))
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-sm font-medium">Step {index}: after <Tok tone="context">{step.contextLabel}</Tok></h3>
      <ProbBars
        ariaLabel={`Next-character probabilities after ${step.contextLabel}`}
        limit={8}
        items={step.candidates.map((c) => ({ key: c.token, label: <Tok tone={c.token === step.token ? "chosen" : "plain"}>{c.label}</Tok>, value: c.p, highlight: c.token === step.token }))}
        remainderLabel="characters"
      />
      <IntervalStrip ariaLabel="Probability intervals in the engine's order, with the random draw" segments={order} draw={step.draw} chosen={step.token} />
    </div>
  )
}

function ComparePanel({ corpus, length, seed }: { corpus: string; length: number; seed: number }) {
  const [vary, setVary] = useState<"prompt" | "seed">("prompt")
  const [promptA, setPromptA] = useState("The rain")
  const [promptB, setPromptB] = useState("Spain")
  const [seedB, setSeedB] = useState(seed + 1)
  const a = useAsync(api.generate)
  const b = useAsync(api.generate)

  async function compare() {
    const [ra, rb] = await Promise.all([
      a.run({ corpus, prompt: promptA, length, seed }),
      b.run({ corpus, prompt: vary === "prompt" ? promptB : promptA, length, seed: vary === "seed" ? seedB : seed }),
    ])
    if (ra && rb) actions.logRun({ route: "playground", title: `Compared ${vary === "prompt" ? "two prompts" : "two seeds"}`, summary: ra.suggestion === rb.suggestion ? "identical suggestions" : "different suggestions", source: "model" }, ["bigram", "seed"])
  }

  const same = a.data && b.data ? a.data.suggestion === b.data.suggestion : undefined
  const observation = a.data && b.data ? (
    vary === "prompt" ? (
      <>
        A ends in <Tok tone="context">{a.data.contextUsedLabel}</Tok>, B ends in <Tok tone="context">{b.data.contextUsedLabel}</Tok>, same seed {a.data.seed}.
        The suggestions are <strong>{same ? "identical" : "different"}</strong>.
        {a.data.contextUsed === b.data.contextUsed ? " The engine read the same single character, so it used the same row of counts and the same random draws." : " The engine read different characters, so it started from different rows of counts."}
      </>
    ) : (
      <>Same prompt, seeds {a.data.seed} and {b.data.seed}: the suggestions are <strong>{same ? "identical" : "different"}</strong>. {same ? "Different seeds can still give the same output by chance." : "A different seed gives different random draws."}</>
    )
  ) : undefined

  return (
    <>
      <Panel
        id="compare"
        title="Compare side by side"
        source={a.data && <Source kind="model" detail={a.data.modelVersion} />}
        aside={<Segmented label="What differs" value={vary} onChange={setVary} options={[{ value: "prompt", label: "Prompt differs" }, { value: "seed", label: "Seed differs" }]} />}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["A", "B"] as const).map((side) => {
            const r = side === "A" ? a : b
            return (
              <div key={side} className="flex min-w-0 flex-col gap-2 rounded-md bg-raised p-4">
                <div className="flex items-end gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <label htmlFor={`cmp-${side}`} className="text-sm font-medium">Prompt {side}</label>
                    <input
                      id={`cmp-${side}`}
                      value={side === "A" || vary === "prompt" ? (side === "A" ? promptA : promptB) : promptA}
                      disabled={side === "B" && vary === "seed"}
                      onChange={(e) => (side === "A" ? setPromptA(e.target.value) : setPromptB(e.target.value))}
                      className="tok h-9 w-full rounded-md border border-input bg-card px-3 text-sm disabled:text-muted-foreground"
                    />
                  </div>
                  {side === "B" && vary === "seed" ? (
                    <NumberField id="seed-b" label="Seed B" value={seedB} min={0} max={4294967295} onChange={setSeedB} />
                  ) : (
                    <p className="num pb-2 text-sm text-muted-foreground">seed {seed}</p>
                  )}
                </div>
                {r.error ? <ErrorNote error={r.error} onRetry={compare} /> : r.loading ? <LoadingRows rows={1} /> : r.data ? (
                  <p className="tok whitespace-pre-wrap break-words text-[14px] leading-6">
                    <span className="text-muted-foreground">{r.data.prompt.slice(0, -1)}</span>
                    <mark className="rounded-sm bg-context px-0.5 text-context-ink">{r.data.contextUsedLabel}</mark>
                    <span className="rounded-sm bg-data-soft">{r.data.suggestion}</span>
                  </p>
                ) : <p className="text-sm text-muted-foreground">Not run yet.</p>}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={compare} disabled={a.loading || b.loading}>Run both</Button>
          <p className="text-[13px] text-muted-foreground">Uses the training text and length set above; the seed is the one above unless seed B differs.</p>
        </div>
      </Panel>
      <GuidedCycle
        id="pg"
        conceptId="bigram"
        route="playground"
        question={vary === "prompt" ? `With the same seed, will “${promptA}” and “${promptB}” get the same suggestion?` : "With the same prompt, will seed A and seed B give the same suggestion?"}
        choices={[{ id: "same", label: "Identical suggestions" }, { id: "different", label: "Different suggestions" }]}
        correct={same === undefined ? undefined : same ? "same" : "different"}
        observation={observation}
        explainPrompt="Why did that happen? Use what the engine actually reads."
        change={<>Change only prompt B so it ends in a different character, then run both again. Or switch to <em>Seed differs</em>.</>}
        hints={[
          "Look at the highlighted character in each prompt.",
          "The engine's whole input is that one character plus the random draws from the seed.",
        ]}
      />
    </>
  )
}

function PlaygroundExplain({ current, result }: { current?: Generation["steps"][number]; result?: Generation }) {
  const top = current?.candidates[0]
  const chosen = current ? current.candidates.find((c) => c.token === current.token) : undefined
  const calc = useMemo(() => current && chosen ? { label: current.contextLabel, p: chosen.p, token: current.tokenLabel } : null, [current, chosen])
  return (
    <Explain
      plain={
        <>
          <p>Your engine looks only at the <Term id="context-window">last character</Term> of your text. It looks up which characters followed that one in its training text, turns those counts into a <Term id="distribution">probability distribution</Term>, and <Term id="sampling">samples</Term> one.</p>
          <p>Then it repeats from the character it just chose. That is <Term id="autoregressive">autoregressive generation</Term>, one character at a time.</p>
        </>
      }
    >
      <ExplainSection title="Show the calculation" defaultOpen={!!calc}>
        {calc && current ? (
          <div className="flex flex-col gap-2">
            <p>At this step the context is <Tok tone="context">{calc.label}</Tok>. The engine's row for it gives {current.candidates.length} possible next characters.</p>
            <p>The draw u = <span className="num">{current.draw.toFixed(4)}</span>. Laying the probabilities end to end in the engine&apos;s order, u falls inside the interval of <Tok tone="chosen">{calc.token}</Tok>, which has p = <span className="num">{calc.p.toFixed(3)}</span>.</p>
            {top && top.token !== current.token && <p>The most likely character was <Tok>{top.label}</Tok> (p = {top.p.toFixed(3)}). Sampling doesn&apos;t always pick it; greedy decoding would.</p>}
          </div>
        ) : <p className="text-muted-foreground">Generate, then select a step to see its arithmetic.</p>}
      </ExplainSection>
      <ExplainSection title="Show the relevant code">
        <div className="flex flex-col gap-4">
          <EngineCode path="nextword/bigram.py" symbol="sample_next" />
          <EngineCode path="nextword/bigram.py" symbol="generate_steps" />
        </div>
      </ExplainSection>
      <ExplainSection title="Timing of the last request">
        {result ? (
          <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>Validate input</dt><dd className="text-right">{fmt.ms(result.timingsMs.validate)}</dd>
            <dt>Count table {result.timingsMs.countCacheHit ? "(cached)" : "(counted)"}</dt><dd className="text-right">{fmt.ms(result.timingsMs.count)}</dd>
            <dt>Generate {result.steps.length} steps</dt><dd className="text-right">{fmt.ms(result.timingsMs.generate)}</dd>
            <dt>Format the trace</dt><dd className="text-right">{fmt.ms(result.timingsMs.format)}</dd>
            <dt className="font-medium">Total inside the backend</dt><dd className="text-right font-medium">{fmt.ms(result.timingsMs.total)}</dd>
          </dl>
        ) : <p className="text-muted-foreground">Measured on your machine after the first request.</p>}
      </ExplainSection>
      <EvidenceRecorder conceptId="bigram" compact />
    </Explain>
  )
}
