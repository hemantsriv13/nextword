import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { NavArrowLeftIcon, NavArrowRightIcon, PauseIcon, PlayIcon, SkipNextIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IntervalStrip, Tok } from "@/components/lab/charts"
import { EngineCode } from "@/components/lab/code"
import { Term } from "@/components/lab/glossary"
import { ErrorNote, LoadingRows, Note, NumberField, Panel, Workspace } from "@/components/lab/layout"
import { Source } from "@/components/lab/source"
import { Symbols, Teach, WorkspaceGuide, useTeach, type Guide } from "@/components/lab/teach"
import { api, type Generation, type Journey as JourneyData } from "@/lib/api"
import { useCorpora } from "@/lib/corpora"
import { useSnapshotRun } from "@/lib/evaluation"
import { fmt, usePrefersReducedMotion } from "@/lib/hooks"
import { contextBefore, engineRow, intervals, JOURNEY_DEFAULTS, journeyChanges, landing, pairOccurrences, stepAgrees, topPairs, type JourneyConfig } from "@/lib/journey"
import { cn } from "@/lib/utils"
import { charTokens, visible } from "@/sim/tokenize"

const MAX_JOURNEY_CHARS = 20_000
type Step = Generation["steps"][number]
type Run = { config: JourneyConfig; result: JourneyData }

/** A character as the journey shows it: spaces and line breaks get a visible symbol. */
function Ch({ c }: { c: string }) {
  return <>{c === " " ? "␣" : c === "\n" ? "↵" : c === "\t" ? "⇥" : c}</>
}
const q = (c: string) => `‘${visible(c)}’`

// ----------------------------------------------------------------------------- the guide

const GUIDE: Guide = {
  question: "How does your bigram engine turn a training text and a prompt into the next character, and then the one after that?",
  scope: "Every number on this page comes from one request to your Python engine: the text, its count table and one generation run are read together as a single snapshot. The browser only lays those numbers out; it never predicts anything itself.",
  sources: ["model"],
  nodes: [
    { id: "text", label: "Training text", kind: "input", target: "j-text", carries: "characters",
      goesIn: "A text file. On this page: a three-line example written for this journey, or any of your texts.",
      happens: "The engine splits it into characters, one per Unicode code point, spaces and line breaks included.",
      why: "The model has no knowledge except what this text shows. Every prediction is a replay of what followed what here.",
      comesOut: "A list of characters, in order.",
      next: "Neighbouring characters are read off in pairs and counted.",
      tryIt: "Pick a different training text in the inputs and watch every count below change." },
    { id: "count", label: "Count neighbouring pairs", kind: "operation", target: "j-count", carries: "counts",
      goesIn: "The list of characters.",
      happens: "For every position, the engine adds one to the count of (this character, next character).",
      why: "Counts are the whole model. A pair that happened often will be predicted often.",
      comesOut: "A table: for each character, how many times each other character followed it.",
      next: "One row of that table is turned into probabilities when a prediction needs it.",
      tryIt: "Pick a common pair, then a rare one, and compare the highlighted places with the count." },
    { id: "norm", label: "Counts to probabilities", kind: "operation", target: "j-norm", carries: "probabilities",
      goesIn: "One row of counts: everything that followed one character.",
      happens: "Each count is divided by the row's total.",
      why: "Counts of different rows are on different scales. Dividing by the total gives shares that add up to one, which can be used to draw a choice.",
      comesOut: "A probability for each possible next character.",
      next: "The prompt decides which row is needed; sampling uses its probabilities.",
      tryIt: "Choose a context character with many followers, then one with a single follower (its probability is 1)." },
    { id: "prompt", label: "Read the prompt", kind: "input", target: "j-prompt", carries: "one character",
      goesIn: "The prompt you typed.",
      happens: "The engine keeps only its last character.",
      why: "A bigram model has a context of exactly one character. That is the definition of this model, not a shortcut.",
      comesOut: "The context: one character, which selects one row of the count table.",
      next: "That row's probabilities go to the random draw.",
      tryIt: "Change the prompt's earlier words but keep its last letter: the run starts from the same row." },
    { id: "sample", label: "Sample a character", kind: "operation", target: "j-sample", carries: "the chosen character",
      goesIn: "The probabilities of the selected row, and one random number from the seeded generator.",
      happens: "The probabilities are laid end to end between 0 and 1; the character whose stretch the random number lands in is chosen.",
      why: "Drawing in proportion to the probabilities makes common continuations common without making them certain.",
      comesOut: "One character.",
      next: "It is appended to the output and becomes the next context.",
      tryIt: "Change only the seed: the same rows are used, but different draws pick different characters." },
    { id: "repeat", label: "Append and repeat", kind: "output", target: "j-repeat",
      goesIn: "The chosen character.",
      happens: "It joins the output; the loop goes back to reading one character, now this one.",
      why: "Generating one character at a time from the one just generated is how the model writes more than one character.",
      comesOut: "The generated text, one traced step per character.",
      next: "Nothing inside this model. The Writing playground runs the same loop on your own prompts.",
      tryIt: "Select any generated character to trace it back to its context, counts, probabilities and draw." },
  ],
  tour: [
    { target: "j-setup", title: "One example, start to finish", plain: <><p>This walkthrough follows one real run of your engine. It uses a short training text, a prompt, a length and a seed, shown here.</p><p>You don't need to change anything. Press Next to go through it at your own pace; nothing moves on by itself.</p></> },
    { target: "j-text", title: "The training text supplies examples", plain: <><p>This text supplies examples of which characters follow each other. This model learns pair counts from those examples.</p><p>The highlighted places are where one chosen pair of characters occurs. Every visible symbol is one character, including ␣ for a space and ↵ for a line break.</p></>,
      terms: [{ id: "corpus", role: "the text the counts are learned from." }, { id: "token", role: "one character, as the engine counts it." }] },
    { target: "j-count", title: "Count neighbouring characters", plain: <><p>Each highlighted place adds one to that pair's count. The engine does this for every pair of neighbours in the text at once.</p><p>Two neighbouring characters counted like this are called a bigram (“bi” means two).</p></>,
      terms: [{ id: "bigram", role: "the pairs being counted, and the name of this whole model." }] },
    { target: "j-norm", title: "Turn counts into probabilities", plain: <><p>Take one character and everything that followed it. Divide each count by the row's total, so the shares add up to one.</p><p>Dividing by the total like this is called normalization. The result, a probability for every possible next character, is a probability distribution.</p></>,
      terms: [{ id: "normalization", role: "count ÷ row total." }, { id: "distribution", role: "the list of next characters with their probabilities." }] },
    { target: "j-prompt", title: "Read the prompt", plain: <><p>This version uses only the previous character to predict the next one. Earlier words do not change this prediction.</p><p>That one character picks a row of the count table: the row that says what followed it in the training text.</p></>,
      terms: [{ id: "context-window", role: "here it is one character wide." }] },
    { target: "j-sample", title: "Sample a character", plain: <><p>Sampling uses these probabilities. The most likely character is not guaranteed to be selected.</p><p>The probabilities are laid end to end between 0 and 1, and the engine's random number (the red line) lands in one of them. The seed only makes these random numbers repeatable: the same seed, text, prompt and length give the same draws.</p></>,
      terms: [{ id: "sampling", role: "the draw that picks the next character." }, { id: "seed", role: "fixes which random numbers are drawn, so the run can be repeated." }] },
    { target: "j-repeat", title: "Append and repeat", plain: <><p>The chosen character joins the output and becomes the context for the next step, which selects a new row and draws again.</p><p>Press Next step to watch this happen one character at a time. Select any generated character to trace it back to its context, counts and draw.</p></>,
      terms: [{ id: "autoregressive", role: "each output character becomes the next input." }] },
  ],
}

// ----------------------------------------------------------------------------- page

export default function Journey() {
  const { corpora } = useCorpora()
  const [form, setForm] = useState<JourneyConfig>(JOURNEY_DEFAULTS)
  const { run, pending, error, start } = useSnapshotRun(api.journey)
  // The calm path: an example run is ready as soon as the page opens. It reads; it never retrains.
  useEffect(() => { void start(JOURNEY_DEFAULTS) }, [start])

  const choices = (corpora ?? []).filter((c) => c.chars <= MAX_JOURNEY_CHARS)
  const changed = run ? journeyChanges(run.config, form) : []
  const promptOk = charTokens(form.prompt).length > 0

  return (
    <Teach guide={GUIDE}>
      <Workspace
        title="Bigram journey"
        subtitle="One example from training text to generated characters, with every number from your Python engine. Read it, or press Read and watch to go one step at a time."
      >
        <WorkspaceGuide />

        <Panel id="j-setup" title="The inputs for this run" source={<Source kind="model" detail={run ? `text ${run.result.corpus.fingerprint}` : undefined} />}
          aside={<Button onClick={() => start(form)} disabled={!!pending || !promptOk}>{pending ? "Running…" : "Run the journey"}</Button>}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-2">
              <span id="j-corpus" className="text-sm font-medium">Training text</span>
              <Select value={form.corpus} onValueChange={(v) => setForm({ ...form, corpus: String(v) })} items={choices.map((c) => ({ value: c.id, label: c.name }))}>
                <SelectTrigger aria-labelledby="j-corpus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(choices.length ? choices : [{ id: "example", name: "Example passage", chars: 69 }]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} <span className="num text-muted-foreground">({fmt.n(c.chars)} chars)</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="j-prompt-in" className="text-sm font-medium">Prompt</label>
              <input id="j-prompt-in" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="tok h-9 rounded-md border border-input bg-card px-3 text-sm" />
            </div>
            <NumberField id="j-len" label="Characters to generate" value={form.length} min={1} max={40} onChange={(v) => setForm({ ...form, length: v })} />
            <NumberField id="j-seed" label={<Term id="seed">Seed</Term>} value={form.seed} min={0} max={4294967295} onChange={(v) => setForm({ ...form, seed: v })} />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Texts over {fmt.n(MAX_JOURNEY_CHARS)} characters are left out, because the journey shows the whole text.</p>
          {error && <div className="mt-3"><ErrorNote error={error} onRetry={() => start(form)} /></div>}
          {run && changed.length > 0 && (
            <div className="mt-3"><Note tone="warning">You changed the {changed.join(", ")}. Everything below still explains the earlier run. Press Run the journey to recompute it with the new inputs.</Note></div>
          )}
        </Panel>

        {!run ? (pending ? <LoadingRows rows={8} label="Asking your engine" /> : null) : <Stages key={`${run.config.corpus}|${run.config.prompt}|${run.config.length}|${run.config.seed}|${run.result.corpus.fingerprint}`} run={run} stale={changed.length > 0} />}
      </Workspace>
    </Teach>
  )
}

function SnapshotLine({ run, stale }: { run: Run; stale: boolean }) {
  const c = run.config
  return (
    <p className="mb-4 text-[13px] text-muted-foreground" data-testid="snapshot-line">
      From the run on {run.result.corpus.name} (text {run.result.corpus.fingerprint}), prompt “{c.prompt}”, seed {c.seed}, {c.length} characters.
      {stale && <span className="font-medium text-foreground"> The inputs above have changed since; this still describes that run.</span>}
    </p>
  )
}

// ----------------------------------------------------------------------------- the stages

function Stages({ run, stale }: { run: Run; stale: boolean }) {
  const { text, table, generation: g } = run.result
  const chars = useMemo(() => charTokens(text), [text])
  const first = g.steps[0]
  const [pair, setPair] = useState<{ a: string; b: string }>(first ? { a: first.context, b: first.token } : topPairs(table, 1).map((p) => ({ a: p.a, b: p.b }))[0] ?? { a: chars[0], b: chars[1] })
  const [context, setContext] = useState(first?.context ?? chars[0])
  const [sel, setSel] = useState(0)
  const [revealed, setRevealed] = useState(Math.min(1, g.steps.length))
  const teach = useTeach()
  const replays = teach?.replays ?? 0
  const [seenReplays, setSeenReplays] = useState(replays)
  if (seenReplays !== replays) {
    // Replay restarts the step-by-step view of the same run. It draws nothing new.
    setSeenReplays(replays)
    setRevealed(Math.min(1, g.steps.length))
    setSel(0)
  }

  return (
    <>
      <TextStage run={run} stale={stale} chars={chars} pair={pair} setPair={setPair} />
      <CountStage run={run} stale={stale} chars={chars} pair={pair} />
      <NormStage run={run} stale={stale} context={context} setContext={setContext} />
      <PromptStage run={run} stale={stale} />
      {g.steps.length > 0 && <SampleStage run={run} stale={stale} index={Math.min(sel, g.steps.length - 1)} />}
      <RepeatStage run={run} stale={stale} sel={sel} setSel={setSel} revealed={revealed} setRevealed={setRevealed} />
    </>
  )
}

function TextStage({ run, stale, chars, pair, setPair }: { run: Run; stale: boolean; chars: string[]; pair: { a: string; b: string }; setPair: (p: { a: string; b: string }) => void }) {
  const { table, corpus } = run.result
  const occ = useMemo(() => new Set(pairOccurrences(chars.join(""), pair.a, pair.b)), [chars, pair])
  const common = topPairs(table, 8)
  const vocab = table.vocab.map((v) => v.token)
  const followers = Object.keys(table.rows[pair.a] ?? {})
  return (
    <Panel id="j-text" title="The training text supplies examples" source={<Source kind="model" detail={`${fmt.n(chars.length)} characters, read by tokenize()`} />}
      teach={{
        calc: <><p>No arithmetic yet: the text becomes a list of characters, and each neighbouring pair is one example.</p>
          <Symbols rows={[["N", "characters in the text", fmt.n(chars.length)], ["N − 1", "neighbouring pairs (every character except the last has a next one)", fmt.n(table.pairs)]]} />
          <p>The engine's table holds exactly {fmt.n(table.pairs)} pairs, so every pair in this text was counted once.</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="tokenize" /><p className="text-sm">Input: the text. Operation: <code className="tok">list(text)</code> splits it into code points. Returns: the list of characters the rest of the engine works on.</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      <p className="mb-3 max-w-3xl text-[15px]">This text supplies examples of which characters follow each other. This model learns pair counts from those examples.
        {corpus.origin === "example" && <span className="text-muted-foreground"> It is a short original passage written for this journey.</span>}</p>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="pair-a" className="text-sm font-medium">First character</span>
          <Select value={pair.a} onValueChange={(v) => { const a = String(v); setPair({ a, b: Object.keys(table.rows[a] ?? {})[0] ?? pair.b }) }} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
            <SelectTrigger aria-labelledby="pair-a" className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span id="pair-b" className="text-sm font-medium">Followed by</span>
          <Select value={pair.b} onValueChange={(v) => setPair({ ...pair, b: String(v) })} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
            <SelectTrigger aria-labelledby="pair-b" className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}{followers.includes(t) ? "" : " (never)"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Common pairs</span>
          <div className="flex flex-wrap gap-1.5">
            {common.map((c) => (
              <Button key={c.a + c.b} size="sm" variant={c.a === pair.a && c.b === pair.b ? "default" : "outline"} onClick={() => setPair({ a: c.a, b: c.b })} aria-pressed={c.a === pair.a && c.b === pair.b} aria-label={`${visible(c.a)} followed by ${visible(c.b)}, ${c.count} times`}>
                <span className="tok">{visible(c.a)}{visible(c.b)}</span> <span className="num text-[12px] opacity-80">{c.count}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
      <p className="tok max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-raised p-4 text-[15px] leading-8" data-testid="journey-text">
        {chars.map((c, i) => {
          const starts = occ.has(i)
          const ends = occ.has(i - 1)
          return (
            <span key={i} className={cn(c === " " || c === "\n" ? "text-muted-foreground" : "", (starts || ends) && "rounded-sm bg-context text-context-ink", starts && "underline decoration-2 underline-offset-4")} data-pair={starts ? "start" : ends ? "end" : undefined}>
              <Ch c={c} />{c === "\n" && "\n"}
            </span>
          )
        })}
      </p>
      <p className="mt-2 text-sm" role="status">
        {q(pair.a)} followed by {q(pair.b)} appears <span className="num font-medium">{occ.size}</span> {occ.size === 1 ? "time" : "times"} (highlighted; the first character of each pair is underlined). ␣ is a space and ↵ a line break: each is one character.
      </p>
    </Panel>
  )
}

function CountStage({ run, stale, chars, pair }: { run: Run; stale: boolean; chars: string[]; pair: { a: string; b: string } }) {
  const { table } = run.result
  const places = pairOccurrences(chars.join(""), pair.a, pair.b)
  const engineCount = table.rows[pair.a]?.[pair.b] ?? 0
  const shown = places.slice(0, 10)
  return (
    <Panel id="j-count" title="Count neighbouring characters" source={<Source kind="model" detail="count_bigrams()" />}
      teach={{
        calc: <><Symbols rows={[
          [`count(${visible(pair.a)} → ${visible(pair.b)})`, `the number of positions i where character i is ${q(pair.a)} and character i + 1 is ${q(pair.b)}`, String(engineCount)],
          ["places found", "highlighted in the text above", String(places.length)],
        ]} />
          <p>{places.length ? `${places.map(() => "1").join(" + ")} = ${places.length}` : "No place, so the count is 0"}. The engine's table says {engineCount}{places.length === engineCount ? ", the same number." : "; these differ, which would mean the text and the table came from different snapshots."}</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="count_bigrams" /><p className="text-sm">Input: the list of characters. Operation: <code className="tok">zip(tokens, tokens[1:])</code> walks every neighbouring pair and adds one to its counter. Returns: a dictionary from each character to a Counter of what followed it.</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      {places.length === 0 ? (
        <Note>{q(pair.a)} is never followed by {q(pair.b)} in this text, so the count is 0. A pair the model never saw can never be generated.</Note>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {shown.map((i, k) => (
            <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="num w-24 text-muted-foreground">character {i + 1}</span>
              <span className="tok rounded bg-raised px-2 py-0.5">
                {chars.slice(Math.max(0, i - 4), i).map((c, j) => <span key={j} className="text-muted-foreground"><Ch c={c} /></span>)}
                <span className="rounded-sm bg-context px-0.5 text-context-ink"><Ch c={chars[i]} /><Ch c={chars[i + 1]} /></span>
                {chars.slice(i + 2, i + 6).map((c, j) => <span key={j} className="text-muted-foreground"><Ch c={c} /></span>)}
              </span>
              <span className="num">count so far: {k + 1}</span>
            </li>
          ))}
          {places.length > shown.length && <li className="text-sm text-muted-foreground">and {places.length - shown.length} more places</li>}
        </ol>
      )}
      <p className="mt-4 max-w-3xl text-[15px]">
        Each place adds one, so {q(pair.a)} → {q(pair.b)} has a count of <span className="num font-semibold" data-testid="pair-count">{engineCount}</span> in your engine's table.
        A pair of neighbouring characters counted like this is called a <Term id="bigram">bigram</Term>. The engine counts every bigram in the text: {fmt.n(table.pairs)} in all.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">A character here is one Unicode code point, exactly as Python's <code className="tok">list(text)</code> splits it. So a space and a line break count as characters, an emoji is one character, and an accent typed as a separate mark is its own character.</p>
    </Panel>
  )
}

function NormStage({ run, stale, context, setContext }: { run: Run; stale: boolean; context: string; setContext: (c: string) => void }) {
  const { table } = run.result
  const { total, items } = engineRow(table, context)
  const sorted = [...items].sort((a, b) => b.count - a.count)
  const vocab = table.vocab.map((v) => v.token)
  return (
    <Panel id="j-norm" title="Turn counts into probabilities" source={<Source kind="model" detail="next_token_probabilities()" />}
      teach={{
        calc: total === 0 ? <p>The row for {q(context)} is empty, so there is no total to divide by. The engine raises an unseen-context error here instead of guessing.</p> : <>
          <Symbols rows={[
            [`total(${visible(context)})`, `how many pairs start with ${q(context)}: ${items.map((i) => i.count).join(" + ")}`, String(total)],
            ...sorted.map((it) => [`P(${visible(it.token)} | ${visible(context)})`, `count ÷ total = ${it.count} ÷ ${total}`, it.p.toFixed(4)] as [string, string, string]),
          ]} />
          <p>Sum of the probabilities: {sorted.map((i) => i.p.toFixed(3)).join(" + ")} = {sorted.reduce((s, i) => s + i.p, 0).toFixed(3)}. P(b | a) reads “the probability of b, given that the current character is a”. Your engine uses the raw counts: it adds no smoothing, so a character that never followed {q(context)} has probability exactly 0.</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="next_token_probabilities" /><p className="text-sm">Input: the count table and one context character. Operation: look up its row and divide each count by the row's sum. Returns: a dictionary from next character to probability, in the order the pairs were first seen. If the row is missing it raises UnseenContextError.</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="norm-ctx" className="text-sm font-medium">Current character</span>
          <Select value={context} onValueChange={(v) => setContext(String(v))} items={vocab.map((t) => ({ value: t, label: visible(t) }))}>
            <SelectTrigger aria-labelledby="norm-ctx" className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{vocab.map((t) => <SelectItem key={t} value={t}>{visible(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="pb-2 text-sm text-muted-foreground">The row for the first step of this run is {q(run.result.generation.steps[0]?.context ?? context)}.</p>
      </div>
      {total === 0 ? (
        <Note tone="warning">Nothing ever follows {q(context)} in this text (it only appears at the very end). Its row is empty, so there is nothing to divide: the engine cannot predict after it, and a run that reaches it stops.</Note>
      ) : (
        <>
          <table className="w-full max-w-2xl text-sm" data-testid="norm-table">
            <caption className="sr-only">Counts after {visible(context)} divided by their total</caption>
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th scope="col" className="py-1 font-normal">Next character</th>
                <th scope="col" className="py-1 text-right font-normal">Count</th>
                <th scope="col" className="py-1 text-right font-normal">÷ total</th>
                <th scope="col" className="py-1 text-right font-normal">Probability</th>
                <th scope="col" className="w-2/5 py-1 pl-4 font-normal"><span className="sr-only">Bar</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((it) => (
                <tr key={it.token} className="border-t border-rule">
                  <th scope="row" className="py-1.5 text-left font-normal"><Tok>{visible(it.token)}</Tok></th>
                  <td className="num py-1.5 text-right">{it.count}</td>
                  <td className="num py-1.5 text-right text-muted-foreground">÷ {total}</td>
                  <td className="num py-1.5 text-right font-medium">{it.p.toFixed(3)}</td>
                  <td className="py-1.5 pl-4"><div className="h-3 rounded-[3px] bg-secondary" aria-hidden="true"><div className="h-full rounded-[3px] bg-data" style={{ width: `${it.p * 100}%` }} /></div></td>
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <th scope="row" className="py-1.5 text-left font-medium">Total</th>
                <td className="num py-1.5 text-right font-medium">{total}</td>
                <td />
                <td className="num py-1.5 text-right font-medium">{sorted.reduce((s, i) => s + i.p, 0).toFixed(3)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="mt-3 max-w-3xl text-[15px]">
            We divide each count by the total ({total}) so the probabilities add up to one. This is called <Term id="normalization">normalization</Term>. The column of probabilities is a <Term id="distribution">probability distribution</Term>: everything that can come after {q(context)}, and how often.
          </p>
        </>
      )}
    </Panel>
  )
}

function PromptStage({ run, stale }: { run: Run; stale: boolean }) {
  const { table, generation: g } = run.result
  const chars = charTokens(g.prompt)
  const last = chars.at(-1)!
  const { total, items } = engineRow(table, last)
  return (
    <Panel id="j-prompt" title="Read the prompt" source={<Source kind="model" detail="generate_steps()" />}
      teach={{
        calc: <Symbols rows={[
          ["prompt", "what you typed", `“${g.prompt}”`],
          ["context", "its last character, prompt[−1]", visible(last)],
          [`counts[${visible(last)}]`, "the row of the count table for that character", items.map((i) => `${visible(i.token)}: ${i.count}`).join(", ")],
          ["row total", "pairs starting with it", String(total)],
        ]} />,
        code: <><EngineCode path="nextword/bigram.py" symbol="generate_steps" /><p className="text-sm">Input: the counts, the prompt, a length and a seeded random generator. Operation: start from <code className="tok">prompt[-1]</code>, then loop. Returns: one Step per generated character (its context, probabilities, draw and choice).</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      <p className="tok text-[22px] leading-10" data-testid="journey-prompt">
        <span className="text-muted-foreground/60">{chars.slice(0, -1).map((c, i) => <Ch key={i} c={c} />)}</span>
        <mark className="rounded-sm bg-context px-1 text-context-ink" aria-label={`last character ${visible(last)}, the only one used`}><Ch c={last} /></mark>
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">Faded: not used by this model. Highlighted: the one character it reads.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Tok tone="context">{visible(last)}</Tok>
        <span className="text-muted-foreground">selects the row</span>
        <span className="flex flex-wrap gap-1.5 rounded-md bg-raised px-3 py-2">
          {items.map((i) => <span key={i.token} className="num"><Tok>{visible(i.token)}</Tok> {i.count}</span>)}
          <span className="num text-muted-foreground">total {total}</span>
        </span>
      </div>
      <p className="mt-4 max-w-3xl text-[15px]">This version uses only the previous character to predict the next one. Earlier words do not change this prediction: “{g.prompt}” and any other prompt ending in {q(last)} start from the same row.</p>
    </Panel>
  )
}

function SampleStage({ run, stale, index }: { run: Run; stale: boolean; index: number }) {
  const { generation: g } = run.result
  const step = g.steps[index]
  const ivs = intervals(step)
  const land = landing(step)
  const top = [...step.candidates].sort((a, b) => b.p - a.p)[0]
  return (
    <Panel id="j-sample" title="Sample a character" source={<Source kind="model" detail={`draw from random.Random(${g.seed})`} />}
      teach={{
        calc: <>
          <Symbols rows={[
            ["u", `the engine's random number for step ${index + 1}, between 0 and 1`, step.draw.toFixed(4)],
            ...ivs.map((iv) => [visible(iv.token), `its stretch runs from ${iv.start.toFixed(3)} to ${iv.end.toFixed(3)} (width p = ${iv.p.toFixed(3)})`] as [string, string]),
          ]} />
          <p>Each stretch starts where the previous one ended, so they cover 0 to 1 without gaps. u = {step.draw.toFixed(4)} is at least {land?.start.toFixed(3)} and below {land?.end.toFixed(3)}, so it falls in {q(land?.token ?? step.token)}, and the engine chose {q(step.token)}.</p></>,
        code: <><EngineCode path="nextword/bigram.py" symbol="sample_next" /><p className="text-sm">Input: the probabilities and the seeded generator. Operation: running sums of the probabilities, one random number, then a binary search for the first sum past it. Returns: the chosen character and the draw, so it can be traced.</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      <h3 className="mb-3 text-sm font-medium">Step {index + 1}: after <Tok tone="context">{step.contextLabel}</Tok></h3>
      <IntervalStrip ariaLabel={`Probability stretches after ${step.contextLabel}, with the draw`} segments={ivs.map((iv) => ({ key: iv.token, label: visible(iv.token), p: iv.p }))} draw={step.draw} chosen={step.token} />
      <table className="mt-4 w-full max-w-xl text-sm" data-testid="interval-table">
        <caption className="sr-only">Stretch of each character between 0 and 1</caption>
        <thead><tr className="text-left text-[12px] text-muted-foreground"><th scope="col" className="font-normal">Character</th><th scope="col" className="text-right font-normal">Probability</th><th scope="col" className="text-right font-normal">From</th><th scope="col" className="text-right font-normal">To</th><th scope="col" className="pl-4 font-normal">The draw</th></tr></thead>
        <tbody>
          {ivs.map((iv) => (
            <tr key={iv.token} className={cn("border-t border-rule", iv.token === step.token && "font-medium")}>
              <th scope="row" className="py-1 text-left font-normal"><Tok tone={iv.token === step.token ? "chosen" : "plain"}>{visible(iv.token)}</Tok></th>
              <td className="num text-right">{iv.p.toFixed(3)}</td>
              <td className="num text-right">{iv.start.toFixed(3)}</td>
              <td className="num text-right">{iv.end.toFixed(3)}</td>
              <td className="pl-4">{iv.token === land?.token ? `u = ${step.draw.toFixed(4)} lands here` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 max-w-3xl text-[15px]">
        Sampling uses these probabilities. The most likely character is not guaranteed to be selected.{" "}
        {top.token === step.token
          ? <>Here the draw did land on the most likely character, {q(top.token)} (p = {top.p.toFixed(3)}).</>
          : <>Here the most likely was {q(top.token)} (p = {top.p.toFixed(3)}), but the draw landed on {q(step.token)} (p = {(step.candidates.find((c) => c.token === step.token)?.p ?? 0).toFixed(3)}).</>}
      </p>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">The <Term id="seed">seed</Term> ({g.seed}) fixes the sequence of random numbers. Run again with the same text, prompt, length and seed and you get the same draws and the same output. A seed does not tell the engine to choose the most likely character.</p>
    </Panel>
  )
}

function RepeatStage({ run, stale, sel, setSel, revealed, setRevealed }: { run: Run; stale: boolean; sel: number; setSel: (i: number) => void; revealed: number; setRevealed: (n: number) => void }) {
  const { table, generation: g } = run.result
  const reduced = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(false)
  const n = g.steps.length
  const promptChars = charTokens(g.prompt)
  const i = Math.min(sel, Math.max(0, revealed - 1))
  const step: Step | undefined = g.steps[i]
  const nextContext = revealed > 0 ? g.steps[revealed - 1].token : promptChars.at(-1)!
  const agrees = step ? stepAgrees(table, step, contextBefore(g, i)) : true
  const { total, items } = step ? engineRow(table, step.context) : { total: 0, items: [] }
  const isPlaying = playing && revealed < n
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!isPlaying) return
    timer.current = window.setTimeout(() => { setRevealed(revealed + 1); setSel(revealed) }, reduced ? 400 : 900)
    return () => clearTimeout(timer.current)
  }, [isPlaying, revealed, reduced, setRevealed, setSel])

  const advance = () => { if (revealed < n) { setSel(revealed); setRevealed(revealed + 1) } }
  return (
    <Panel id="j-repeat" title="Append and repeat" source={<Source kind="model" detail={`${n} steps traced`} />}
      aside={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => { setPlaying(false); setRevealed(Math.max(1, revealed - 1)); setSel(Math.max(0, revealed - 2)) }} disabled={revealed <= 1}><NavArrowLeftIcon className="size-4" /> Back a step</Button>
          <Button size="sm" onClick={() => { setPlaying(false); advance() }} disabled={revealed >= n}><SkipNextIcon className="size-4" /> Next step</Button>
          <Button variant="outline" size="sm" onClick={() => setPlaying(!isPlaying)} disabled={revealed >= n}>{isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />} {isPlaying ? "Pause" : "Play"}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setPlaying(false); setRevealed(n); setSel(n - 1) }} disabled={revealed >= n}>Show all</Button>
        </div>
      }
      teach={{
        calc: step ? <>
          <Symbols rows={[
            [`context for step ${i + 1}`, i === 0 ? "the prompt's last character" : `the character chosen at step ${i}`, visible(step.context)],
            ["its row", items.map((it) => `${visible(it.token)}: ${it.count}`).join(", "), `total ${total}`],
            ["probabilities", "count ÷ total", step.candidates.map((c) => `${visible(c.token)} ${c.p.toFixed(3)}`).join(", ")],
            ["u", "the draw", step.draw.toFixed(4)],
            ["chosen", "appended to the output", visible(step.token)],
            [`context for step ${i + 2}`, "the character just chosen", visible(step.token)],
          ]} />
          <p>{agrees ? "Checked: these probabilities are the row's counts divided by its total, from the same snapshot, and the draw lands on the chosen character." : "These values do not agree with the count table, so they came from different snapshots. Run the journey again."}</p></> : undefined,
        code: <><EngineCode path="nextword/bigram.py" symbol="generate_steps" /><p className="text-sm">The loop sets <code className="tok">context = token</code> after every draw: that one line is “append and repeat”. It stops early only when the context has no row.</p></>,
      }}>
      <SnapshotLine run={run} stale={stale} />
      <p className="tok whitespace-pre-wrap break-words text-[20px] leading-10" data-testid="journey-output">
        <span className="text-muted-foreground/60">{promptChars.slice(0, -1).map((c, k) => <Ch key={k} c={c} />)}</span>
        <span className={cn("rounded-sm px-0.5", i === 0 && step && "bg-context text-context-ink", revealed === 0 && "underline decoration-dashed decoration-2 underline-offset-[6px]")}><Ch c={promptChars.at(-1)!} /></span>
        {g.steps.slice(0, revealed).map((s, k) => {
          const isCtx = step && k === i - 1
          const isChosen = k === i
          const isNext = k === revealed - 1
          return (
            <button
              key={k}
              type="button"
              onClick={() => { setPlaying(false); setSel(k) }}
              aria-pressed={isChosen}
              aria-label={`Step ${k + 1}: ${visible(s.token)}, chosen after ${visible(s.context)}`}
              data-role={[isCtx && "step-context", isChosen && "step-choice", isNext && "next-context"].filter(Boolean).join(" ") || undefined}
              className={cn(
                "rounded-sm bg-data-soft px-0.5",
                isCtx && "bg-context text-context-ink",
                isChosen && "outline-2 -outline-offset-1 outline-primary",
                isNext && "underline decoration-dashed decoration-2 underline-offset-[6px]",
              )}
            >
              <Ch c={s.token} />
            </button>
          )
        })}
        {revealed < n && <span className="text-muted-foreground">▏</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-context" /> context step {i + 1} read</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm outline-2 -outline-offset-1 outline-primary" /> character step {i + 1} chose</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 border-b-2 border-dashed border-foreground" /> context the next prediction reads</span>
      </div>

      {step && (
        <div className="mt-5 rounded-md bg-raised p-4" data-testid="trace-back">
          <h3 className="text-sm font-medium">Tracing step {i + 1} back to where it came from</h3>
          <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <TraceBox label="context">{<Tok tone="context">{step.contextLabel}</Tok>}</TraceBox>
            <Arrow>selects the row</Arrow>
            <TraceBox label="counts">{items.map((it) => `${visible(it.token)} ${it.count}`).join(", ")} <span className="text-muted-foreground">of {total}</span></TraceBox>
            <Arrow>÷ total</Arrow>
            <TraceBox label="probabilities">{step.candidates.map((c) => `${visible(c.token)} ${c.p.toFixed(2)}`).join(", ")}</TraceBox>
            <Arrow>draw u = {step.draw.toFixed(3)}</Arrow>
            <TraceBox label="chosen"><Tok tone="chosen">{step.tokenLabel}</Tok></TraceBox>
            <Arrow>becomes</Arrow>
            <TraceBox label={`context for step ${i + 2}`}><Tok tone="context">{step.tokenLabel}</Tok></TraceBox>
          </ol>
          <p className={cn("mt-3 text-[13px]", agrees ? "text-muted-foreground" : "text-negative")}>{agrees ? "Checked against the count table of the same snapshot." : "These values do not agree with the count table; run the journey again."}</p>
        </div>
      )}
      <p className="mt-4 max-w-3xl text-[15px]">
        Showing {revealed} of {n} steps. The context used by the selected step (step {i + 1}, {q(step?.context ?? "")}) is different from the context the next prediction reads ({q(nextContext)}): every new character moves the context forward by one.
      </p>
      {g.stopped && revealed >= n && (
        <div className="mt-3"><Note tone="warning">The run stopped after {n} of {g.length} characters: {q(g.steps.at(-1)!.token)} never has a following character in this text (it only appears at the very end), so its row is empty and there is nothing to sample from.</Note></div>
      )}
      {n === 0 && <Note tone="warning">Nothing was generated.</Note>}
    </Panel>
  )
}

function TraceBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex flex-col rounded-md bg-card px-3 py-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="num">{children}</span>
    </li>
  )
}

function Arrow({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-1 text-[12px] text-muted-foreground"><NavArrowRightIcon className="size-4" />{children}</li>
}
