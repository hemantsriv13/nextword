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
import { Symbols, Teach, WorkspaceGuide, type Guide } from "@/components/lab/teach"
import { api, type Generation } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { fmt, useAsync, usePrefersReducedMotion } from "@/lib/hooks"
import { actions } from "@/lib/store"
import { useSnapshotRun } from "@/lib/evaluation"
import { lastChars, traceView, withoutLastChar, type Segment } from "@/lib/trace"
import { cn } from "@/lib/utils"
import { charTokens, visible } from "@/sim/tokenize"

const ENGINES = [
  { id: "char-bigram", label: "Character bigram", note: "Your model", available: true },
  { id: "mlp", label: "Neural MLP", note: "Stage 2, not built yet", available: false },
  { id: "transformer", label: "Tiny transformer", note: "Stage 3, not built yet", available: false },
]

const newSeed = () => Math.floor(Math.random() * 10000)

const GUIDE: Guide = {
  question: "What does your bigram engine suggest after your text, and why that suggestion?",
  scope: "Suggestions, the trace and the comparison all come from your Python engine through the local backend. The Bigram journey page walks through the same loop on a three-line example, if you want it slower.",
  sources: ["model"],
  nodes: [
    { id: "prompt", label: "Your text", kind: "input", target: "write", carries: "the last character",
      goesIn: "What you type in the editor, plus the training text, length and seed below it.",
      happens: "Nothing yet: the text waits for Suggest.",
      why: "The prompt supplies the starting context. For this model, that is only its final character.",
      comesOut: "The last character of your text, marked in the line under the editor.",
      next: "It selects one row of the engine's count table.",
      tryIt: "Change an early word: the marked character, and so the suggestion, stays the same." },
    { id: "row", label: "Look up the row", kind: "operation", target: "trace", carries: "probabilities",
      goesIn: "The context character.",
      happens: "The engine reads the counts of everything that followed it in the training text and divides each by their total.",
      why: "Those shares are the model's whole opinion about what comes next.",
      comesOut: "A probability for each possible next character (the bars in the trace).",
      next: "One random draw picks a character from them.",
      tryIt: "Select different steps in the trace and compare their bars." },
    { id: "draw", label: "Draw a character", kind: "operation", target: "trace", carries: "one character",
      goesIn: "The probabilities and one random number from the seeded generator.",
      happens: "The probabilities are laid end to end from 0 to 1; the random number lands in one character's stretch.",
      why: "Sampling makes likely characters common without making the output always the same.",
      comesOut: "The chosen character.",
      next: "It is appended and becomes the next context.",
      tryIt: "Press Another suggestion: same rows, new seed, different draws." },
    { id: "repeat", label: "Append and repeat", kind: "operation", target: "trace", carries: "the suggestion",
      goesIn: "The chosen character.",
      happens: "It joins the suggestion, and the loop looks up the row for this new character.",
      why: "One character at a time, each from the one before, is how a longer suggestion is written.",
      comesOut: "The suggestion, with one trace row per character.",
      next: "You decide: Accept appends it to your text.",
      tryIt: "Use Step to watch it grow one character at a time." },
    { id: "compare", label: "Compare two runs", kind: "output", target: "compare",
      goesIn: "Two prompts with one seed, or one prompt with two seeds.",
      happens: "Both runs go to the engine; the results are stored with the settings that produced them.",
      why: "Changing one thing at a time shows what the engine actually depends on.",
      comesOut: "Two suggestions and what they share.",
      next: "Your own explanation in the guided cycle, if you want one.",
      tryIt: "Make prompt B end in the same letter as prompt A, with the same seed." },
  ],
  tour: [
    { target: "write", title: "Your text and its last character", plain: <><p>Type anything. The line under the editor marks the one character the engine reads: the last one. Everything before it is ignored by this model.</p><p>Press Suggest to ask the engine for a continuation. It returns the suggestion and a trace of how every character was chosen.</p></>,
      terms: [{ id: "context-window", role: "here it is one character: the last one you typed." }] },
    { target: "trace", title: "The trace: one row per generated character", plain: <><p>Each row of the trace is one step. It shows the context the step read, the random number it drew, and the character it chose.</p><p>Select a row to see its probabilities and where the draw landed. The chosen character becomes the next row's context.</p></>,
      terms: [{ id: "sampling", role: "how each row's character is picked from its probabilities." }, { id: "autoregressive", role: "each chosen character is the next row's input." }] },
    { target: "compare", title: "Compare to see what matters", plain: <><p>Run two prompts with the same seed, or one prompt with two seeds. If two prompts end in the same character and share a seed, the engine has no way to tell them apart.</p><p>The results stay labelled with the settings that produced them, even if you switch the mode afterwards.</p></>,
      terms: [{ id: "seed", role: "fixes the random draws, so only the prompt differs." }] },
  ],
}

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
  const stale = !!result && (result.prompt !== prompt || result.seed !== seed || result.length !== length || result.corpus.id !== corpus)
  const view = traceView(prompt, result, revealed, selectedStep, stale)
  // Built from the trace tokens (one engine character each), never by slicing the suggestion string.
  const shown = view.revealedText

  async function run(stepMode: boolean, seedOverride?: number) {
    setPlaying(false)
    const s = seedOverride ?? seed
    const r = await gen.run({ corpus, prompt, length, seed: s })
    if (r) {
      setRevealed(stepMode ? 1 : r.steps.length)
      setSelectedStep(stepMode ? 0 : null)
      actions.logRun({ route: "playground", title: `Generated from “${lastChars(prompt, 20)}”`, summary: `${r.steps.length} chars, seed ${r.seed}, ${r.modelVersion}`, source: "model" }, ["bigram", "sampling", "autoregressive"])
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

  const current = view.selected !== null ? steps[view.selected] : undefined

  return (
    <Teach guide={GUIDE}>
    <Workspace
      title="Writing playground"
      subtitle="Your bigram engine suggests what comes next. Every number here comes from your Python engine."
      explain={<PlaygroundExplain current={current} index={view.selected} result={stale ? undefined : result} />}
    >
      <WorkspaceGuide />
      <Panel
        id="write"
        title="Your text"
        teach={{
          calc: <Symbols rows={[
            ["prompt", "your text", `${charTokens(prompt).length} characters`],
            ["context", "its last character, the only one the engine reads", view.nextContext ? visible(view.nextContext) : "none yet"],
            ...(result && !stale ? [["suggestion", `${result.steps.length} characters drawn with seed ${result.seed}`, `“${result.suggestion}”`] as [string, string, string]] : []),
          ]} />,
          code: <EngineCode path="nextword/lab/service.py" symbol="generate" />,
        }}
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
            <p className="tok whitespace-pre-wrap break-words text-[15px] leading-7" data-testid="prompt-and-suggestion">
              {view.segments.map((seg, i) => <TraceSegment key={i} seg={seg} step={view.selected} />)}
              {result && !stale && revealed < steps.length && <span className="text-muted-foreground">▏</span>}
            </p>
          )}
          <TraceLegend step={view.selected} generated={!!shown} />
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
        teach={{
          calc: current && view.selected !== null && !stale ? <>
            <Symbols rows={[
              ["step", "the selected row of the trace", String(view.selected + 1)],
              ["context", view.selected === 0 ? "the prompt's last character" : "the character chosen one step earlier", current.contextLabel],
              ...current.candidates.slice(0, 6).map((c) => [`P(${c.label})`, "its count ÷ the row total", c.p.toFixed(3)] as [string, string, string]),
              ["u", "the random number this step drew", current.draw.toFixed(4)],
              ["chosen", "the character whose stretch contains u", current.tokenLabel],
            ]} />
            <p>The stretches are laid out in the engine's order (the order on the strip below the bars), not sorted by size.</p></> : <p className="text-muted-foreground">Suggest first; then select a row of the trace to see its numbers.</p>,
          code: <><EngineCode path="nextword/bigram.py" symbol="sample_next" /><EngineCode path="nextword/bigram.py" symbol="generate_steps" /></>,
        }}
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
        ) : stale ? (
          <Note tone="warning">Trace hidden: it came from earlier settings (seed {result.seed}, length {result.length}). Press Step or Suggest to trace your current text.</Note>
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
                    const sel = view.selected === i
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
            {current && view.selected !== null && <StepDetail step={current} index={view.selected + 1} />}
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
    </Teach>
  )
}

const shownChar = (c: string) => (c === " " ? "␣" : c === "\n" ? "↵\n" : c === "\t" ? "⇥" : c)

/** One run of the prompt-and-suggestion line. Each role has its own shape, so color isn't the only cue. */
function TraceSegment({ seg, step }: { seg: Segment; step: number | null }) {
  const marked = seg.stepContext || seg.stepChoice || seg.nextContext
  if (!marked) return <span className={cn(seg.generated && "rounded-sm bg-data-soft")}>{seg.text}</span>
  // With no step shown, the next prediction's context is the only context, so it takes the fill.
  const fill = seg.stepContext || (step === null && seg.nextContext)
  const roles = [
    seg.stepContext && `context step ${step! + 1} read`,
    seg.stepChoice && `chosen at step ${step! + 1}`,
    seg.nextContext && "context the next prediction reads",
  ].filter(Boolean).join("; ")
  return (
    <mark
      data-role={[seg.stepContext && "step-context", seg.stepChoice && "step-choice", seg.nextContext && "next-context"].filter(Boolean).join(" ")}
      title={roles}
      className={cn(
        "rounded-sm px-0.5 text-foreground",
        seg.generated ? "bg-data-soft" : "bg-transparent",
        fill && "bg-context text-context-ink",
        seg.stepChoice && "outline-2 -outline-offset-1 outline-primary",
        seg.nextContext && step !== null && "underline decoration-foreground decoration-dashed decoration-2 underline-offset-[5px]",
      )}
    >
      {shownChar(seg.text)}<span className="sr-only"> ({roles})</span>
    </mark>
  )
}

function TraceLegend({ step, generated }: { step: number | null; generated: boolean }) {
  const item = "inline-flex items-center gap-1.5"
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground" aria-hidden="true">
      {step === null ? (
        <span className={item}><span className="inline-block size-3 rounded-sm bg-context" /> context the next prediction reads (one character)</span>
      ) : (
        <>
          <span className={item}><span className="inline-block size-3 rounded-sm bg-context" /> context step {step + 1} read</span>
          <span className={item}><span className="inline-block size-3 rounded-sm outline-2 -outline-offset-1 outline-primary" /> character step {step + 1} chose</span>
          <span className={item}><span className="inline-block w-3 border-b-2 border-dashed border-foreground" /> context the next prediction reads</span>
        </>
      )}
      {generated && <span className={item}><span className="inline-block size-3 rounded-sm bg-data-soft" /> generated</span>}
    </div>
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

interface CompareConfig {
  vary: "prompt" | "seed"
  corpus: string
  length: number
  promptA: string
  promptB: string // the prompt B actually used: prompt A when only the seed differs
  seedA: number
  seedB: number // the seed B actually used: seed A when only the prompt differs
}

const compareBoth = (c: CompareConfig) => Promise.all([
  api.generate({ corpus: c.corpus, prompt: c.promptA, length: c.length, seed: c.seedA }),
  api.generate({ corpus: c.corpus, prompt: c.promptB, length: c.length, seed: c.seedB }),
])

/** Which settings differ between a finished comparison and the controls now. */
function compareChanges(run: CompareConfig, now: CompareConfig): string[] {
  const out: string[] = []
  if (run.vary !== now.vary) out.push("what differs")
  if (run.corpus !== now.corpus) out.push("training text")
  if (run.length !== now.length) out.push("length")
  if (run.promptA !== now.promptA) out.push("prompt A")
  if (run.vary === now.vary && run.promptB !== now.promptB) out.push("prompt B")
  if (run.seedA !== now.seedA) out.push("seed")
  if (run.vary === now.vary && run.seedB !== now.seedB) out.push("seed B")
  return out
}

function ComparePanel({ corpus, length, seed }: { corpus: string; length: number; seed: number }) {
  const [vary, setVary] = useState<"prompt" | "seed">("prompt")
  const [promptA, setPromptA] = useState("The rain")
  const [promptB, setPromptB] = useState("Spain")
  const [seedB, setSeedB] = useState(seed + 1)
  const { run, pending, error, start } = useSnapshotRun(compareBoth)
  const now: CompareConfig = { vary, corpus, length, promptA, promptB: vary === "prompt" ? promptB : promptA, seedA: seed, seedB: vary === "seed" ? seedB : seed }
  const changed = run ? compareChanges(run.config, now) : []
  const stale = changed.length > 0

  async function compare() {
    const finished = await start(now)
    if (finished) {
      const [ra, rb] = finished.result
      actions.logRun({ route: "playground", title: `Compared ${finished.config.vary === "prompt" ? "two prompts" : "two seeds"}`, summary: ra.suggestion === rb.suggestion ? "identical suggestions" : "different suggestions", source: "model" }, ["bigram", "seed"])
    }
  }

  // Everything below describes the comparison that was actually run, in its own mode.
  const done = run ? { cfg: run.config, a: run.result[0], b: run.result[1] } : null
  const same = done ? done.a.suggestion === done.b.suggestion : undefined
  const observation = done ? (
    done.cfg.vary === "prompt" ? (
      <>
        A ends in <Tok tone="context">{done.a.contextUsedLabel}</Tok>, B ends in <Tok tone="context">{done.b.contextUsedLabel}</Tok>, same seed {done.a.seed}.
        The suggestions are <strong>{same ? "identical" : "different"}</strong>.
        {done.a.contextUsed === done.b.contextUsed ? " The engine read the same single character, so it used the same row of counts and the same random draws." : " The engine read different characters, so it started from different rows of counts."}
      </>
    ) : (
      <>Same prompt, seeds {done.a.seed} and {done.b.seed}: the suggestions are <strong>{same ? "identical" : "different"}</strong>. {same ? "Different seeds can still give the same output by chance." : "A different seed gives different random draws."}</>
    )
  ) : undefined
  // The guided cycle asks about the mode selected now; an old run in another mode cannot answer it.
  const answers = !!done && !stale

  return (
    <>
      <Panel
        id="compare"
        title="Compare side by side"
        source={done && <Source kind="model" detail={done.a.modelVersion} />}
        aside={<Segmented label="What differs" value={vary} onChange={setVary} options={[{ value: "prompt", label: "Prompt differs" }, { value: "seed", label: "Seed differs" }]} />}
        teach={{
          calc: done ? <p>Run A: prompt “{done.cfg.promptA}”, seed {done.cfg.seedA}, context {done.a.contextUsedLabel}. Run B: prompt “{done.cfg.promptB}”, seed {done.cfg.seedB}, context {done.b.contextUsedLabel}. A bigram run depends only on the context character, the seed, the length and the training text, so {done.cfg.vary === "prompt" ? (done.a.contextUsed === done.b.contextUsed ? "with the same context and seed the two runs must match." : "with different contexts the first rows differ.") : "with different seeds the draws differ."}</p> : undefined,
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["A", "B"] as const).map((side) => {
            const data = done ? (side === "A" ? done.a : done.b) : undefined
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
                {error ? <ErrorNote error={error} onRetry={compare} /> : pending ? <LoadingRows rows={1} /> : data ? (
                  <div className={cn(stale && "opacity-60")}>
                    <p className="tok whitespace-pre-wrap break-words text-[14px] leading-6">
                      <span className="text-muted-foreground">{withoutLastChar(data.prompt)}</span>
                      <mark className="rounded-sm bg-context px-0.5 text-context-ink">{data.contextUsedLabel}</mark>
                      <span className="rounded-sm bg-data-soft">{data.suggestion}</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground">prompt “{data.prompt}”, seed {data.seed}</p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Not run yet.</p>}
              </div>
            )
          })}
        </div>
        {done && (
          <p className="mt-3 text-sm" data-testid="compare-settings">
            These results are a <strong>{done.cfg.vary === "prompt" ? "different-prompt, same-seed" : "same-prompt, different-seed"}</strong> comparison: A “{done.cfg.promptA}” with seed {done.cfg.seedA}, B “{done.cfg.promptB}” with seed {done.cfg.seedB}.
          </p>
        )}
        {done && stale && (
          <div className="mt-2"><Note tone="warning">Settings changed since this comparison ({changed.join(", ")}). The results above still belong to the settings just named. Press Run both to compare with the new ones.</Note></div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={compare} disabled={!!pending}>Run both</Button>
          <p className="text-[13px] text-muted-foreground">Uses the training text and length set above; the seed is the one above unless seed B differs.</p>
        </div>
      </Panel>
      <GuidedCycle
        id="pg"
        conceptId="bigram"
        route="playground"
        question={vary === "prompt" ? `With the same seed, will “${promptA}” and “${promptB}” get the same suggestion?` : "With the same prompt, will seed A and seed B give the same suggestion?"}
        choices={[{ id: "same", label: "Identical suggestions" }, { id: "different", label: "Different suggestions" }]}
        correct={answers ? (same ? "same" : "different") : undefined}
        observation={answers ? observation : undefined}
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

function PlaygroundExplain({ current, index, result }: { current?: Generation["steps"][number]; index: number | null; result?: Generation }) {
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
            <p>At step {(index ?? 0) + 1} the context is <Tok tone="context">{calc.label}</Tok>. The engine's row for it gives {current.candidates.length} possible next characters.</p>
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
