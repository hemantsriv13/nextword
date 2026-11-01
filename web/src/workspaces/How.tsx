// How NextWord Works: the technical reference. Each section opens in plain words; technical depth is behind
// "More detail". Live values (MLP defaults and limits, datasets, tutor limits, what is running) come from the
// backend; measurements from the author's laptop are labelled as one-off, dated measurements, never as readings
// of this computer. Nothing on this page asks the AI to write.
import { useEffect, useState, type ReactNode } from "react"
import { NavArrowDownIcon } from "@/components/icons"
import { Term } from "@/components/lab/glossary"
import { InfoTip } from "@/components/lab/info-tip"
import { Source } from "@/components/lab/source"
import { SystemStatusList } from "@/components/lab/system-status"
import type { Route } from "@/content/glossary"
import { WORKSPACE_HELP } from "@/content/help"
import { WORKSPACES } from "@/content/journey"
import { useCorpora } from "@/lib/corpora"
import { fmt, hrefFor } from "@/lib/hooks"
import { LESSONS } from "@/lib/lessons"
import { mlpApi, type MlpStatus } from "@/lib/mlp"
import { useSystemStatus } from "@/lib/system"
import { cn } from "@/lib/utils"

const SECTIONS = [
  { id: "architecture", label: "The parts" },
  { id: "workflows", label: "Two workflows" },
  { id: "mlp", label: "Inside the MLP" },
  { id: "data", label: "Data" },
  { id: "tutor", label: "The tutor" },
  { id: "hardware", label: "Hardware and storage" },
  { id: "evaluation", label: "Evaluation" },
  { id: "tools", label: "Tools and setup" },
  { id: "roadmap", label: "Roadmap" },
] as const

const doc = (name: string) => `/docs/${name}`

export default function How() {
  const status = useSystemStatus()
  const [mlp, setMlp] = useState<MlpStatus | null>(null)
  const [mlpError, setMlpError] = useState<string | null>(null)
  useEffect(() => { mlpApi.status().then(setMlp, (e: Error) => setMlpError(e.message)) }, [])
  const limits = status.explainer.state === "ok" ? status.explainer.data.limits : undefined

  return (
    <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6 lg:px-8 lg:pt-8" data-testid="how">
      <header className="flex flex-col gap-2">
        <h1 className="text-lesson font-semibold sm:text-page">How NextWord Works</h1>
        <p className="measure text-prose text-muted-foreground">What runs where, what learns and what only explains, the data, the tutor, the hardware, how answers are evaluated, and what is still planned. Each section starts in plain words; open “More detail” for the technical version.</p>
      </header>
      <div className="grid grid-cols-1 gap-12 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <Contents />
        <div className="flex min-w-0 flex-col gap-16">
          <Architecture />
          <Workflows />
          <InsideMlp mlp={mlp} error={mlpError} />
          <Data />
          <Tutor limits={limits} />
          <Hardware />
          <Evaluation />
          <Tools status={status} />
          <Roadmap />
        </div>
      </div>
    </div>
  )
}

/** On-page contents. Hash routing owns the URL, so these move focus to the section instead of changing it. */
function Contents() {
  const go = (id: string) => {
    const h = document.getElementById(`${id}-h`)
    h?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    h?.focus({ preventScroll: true })
  }
  return (
    <nav aria-label="On this page" className="xl:sticky xl:top-16 xl:self-start" data-testid="how-contents">
      <p className="mb-2 text-label font-medium text-muted-foreground">On this page</p>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 xl:flex-col xl:gap-0.5">
        {SECTIONS.map((s, i) => (
          <li key={s.id}><button type="button" onClick={() => go(s.id)} className="min-h-9 rounded-md text-left text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><span className="num mr-1.5 text-muted-foreground">{String.fromCharCode(65 + i)}</span>{s.label}</button></li>
        ))}
      </ol>
    </nav>
  )
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: ReactNode; children: ReactNode }) {
  const i = SECTIONS.findIndex((s) => s.id === id)
  return (
    <section aria-labelledby={`${id}-h`} className="flex scroll-mt-16 flex-col gap-4" data-testid={`how-${id}`}>
      <h2 id={`${id}-h`} tabIndex={-1} className="text-section font-semibold outline-none focus-visible:outline-2 focus-visible:outline-ring"><span className="num mr-2 text-muted-foreground">{String.fromCharCode(65 + i)}</span>{title}</h2>
      <div className="measure text-prose">{intro}</div>
      {children}
    </section>
  )
}

function More({ children, label = "More detail" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group rounded-xl border border-border px-4 [&[open]]:pb-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <NavArrowDownIcon className="size-4 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none" aria-hidden="true" />{label}
      </summary>
      <div className="measure flex flex-col gap-3 pt-1 text-sm">{children}</div>
    </details>
  )
}

const Badge = ({ tone, children }: { tone: "learns" | "infers" | "neutral"; children: ReactNode }) => (
  <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium",
    tone === "learns" ? "bg-src-sim text-src-sim-ink ring-1 ring-inset ring-src-sim-edge" : tone === "infers" ? "bg-data-soft text-foreground" : "bg-raised text-muted-foreground")}>{children}</span>
)

// ----------------------------------------------------------------------------- A. architecture

function Box({ title, sub, badge, children, className }: { title: string; sub?: string; badge?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3", className)}>
      <p className="font-semibold">{title}</p>
      {sub && <p className="text-label text-muted-foreground">{sub}</p>}
      {badge}
      {children}
    </div>
  )
}

function Architecture() {
  return (
    <Section id="architecture" title="The parts, and what each one does" intro={<>
      <p>NextWord has three programs on your computer. Your <strong>browser</strong> shows the pages. A small <strong>Python backend</strong> holds the two models you study and computes every number. A separate, optional program, <strong>Colibri</strong>, runs a pretrained model called <strong>Qwen</strong> that rewords explanations. Only the MLP learns here.</p>
    </>}>
      <figure className="flex flex-col gap-3" aria-labelledby="arch-cap">
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.6fr)_auto_minmax(0,1fr)]" aria-hidden="true">
          <Box title="Your browser" sub="NextWord's interface (React)">Pages, lessons, progress (saved in this browser) and the learning panel.</Box>
          <div className="flex items-center justify-center text-sm text-muted-foreground lg:flex-col"><span className="lg:hidden">↓</span><span className="hidden lg:inline">⇄</span><span className="ml-2 lg:ml-0">port 8765</span></div>
          <Box title="Python backend" sub="The Lab server, on this computer only">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Box title="Bigram engine" sub="nextword/bigram.py" badge={<Badge tone="neutral">Counts; no weights</Badge>} className="bg-raised" />
              <Box title="Character MLP" sub="nextword/mlp.py, using PyTorch" badge={<Badge tone="learns">Learns: its weights change</Badge>} className="bg-raised" />
              <Box title="Lesson results and facts" sub="every number on every page" className="bg-raised sm:col-span-2" />
            </div>
          </Box>
          <div className="flex items-center justify-center text-sm text-muted-foreground lg:flex-col"><span className="lg:hidden">↓</span><span className="hidden lg:inline">⇄</span><span className="ml-2 lg:ml-0">port 8000, tutor only</span></div>
          <Box title="Colibri (optional)" sub="A separate program that runs Qwen" badge={<Badge tone="infers">Inference only: weights never change</Badge>}>Qwen3-4B: a pretrained model, downloaded, not trained here. It rewords; it doesn't calculate the lessons.</Box>
        </div>
        <figcaption id="arch-cap" className="text-label text-muted-foreground">The browser talks only to the Python backend. The backend computes everything and, only when you ask the tutor, sends facts to Colibri and passes its answer back.</figcaption>
        <details className="text-sm"><summary className="min-h-9 w-fit cursor-pointer py-2 text-muted-foreground hover:text-foreground">The diagram in words</summary>
          <ol className="measure mt-1 flex list-decimal flex-col gap-1 pl-5">
            <li>Your browser shows NextWord's pages and talks to the Python backend on this computer (port 8765).</li>
            <li>The backend runs the bigram engine (counts, no weights) and the character MLP (PyTorch; its weights change when it trains), and computes every lesson's result.</li>
            <li>Only for “Ask your tutor”, the backend sends facts to Colibri (port 8000), which runs the pretrained Qwen model. Qwen's weights never change.</li>
          </ol>
        </details>
      </figure>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">What each part is</caption>
          <thead><tr className="text-left text-label text-muted-foreground"><th className="py-2 pr-4 font-normal">Part</th><th className="pr-4 font-normal">What it is</th><th className="pr-4 font-normal">Learns here?</th><th className="font-normal">Runs on</th></tr></thead>
          <tbody className="[&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_tr]:border-t [&_tr]:border-border">
            <tr><td className="font-medium">Interface</td><td>The pages you use. Keeps your lesson progress in this browser.</td><td>No</td><td>Browser</td></tr>
            <tr><td className="font-medium">Python backend</td><td>A small local web server (standard library) that computes every number and answers the pages.</td><td>No</td><td>CPU</td></tr>
            <tr><td className="font-medium"><Term id="bigram">Bigram engine</Term></td><td>Counts which character followed which. Writing reads one row of counts.</td><td>It counts; there is nothing to train</td><td>CPU</td></tr>
            <tr><td className="font-medium">Character MLP</td><td>A small neural network: embeddings, a tanh hidden layer, softmax.</td><td><strong>Yes</strong>: training changes its weights</td><td>CPU (2 threads)</td></tr>
            <tr><td className="font-medium">PyTorch</td><td>The library the MLP is built with: tensors, and automatic gradients.</td><td>A tool, not a model</td><td>CPU build</td></tr>
            <tr><td className="font-medium">Qwen3-4B</td><td>A pretrained language model from the Qwen team, used only to reword explanations.</td><td><strong>No</strong>: never trained or changed here</td><td>GPU when it fits, else CPU</td></tr>
            <tr><td className="font-medium">Colibri</td><td>The program that loads Qwen's file and answers requests on this computer.</td><td>A runtime, not a model</td><td>Its own process</td></tr>
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ----------------------------------------------------------------------------- B. workflows

function Flow({ id, title, steps, caption }: { id: string; title: string; steps: { label: string; detail: string; badge?: ReactNode }[]; caption: string }) {
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={`${id}-cap`} data-testid={`flow-${id}`}>
      <p className="font-semibold">{title}</p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={i} className="relative flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold"><span className="num mr-1.5 text-muted-foreground">{i + 1}</span>{s.label}</p>
            <p className="text-label text-muted-foreground">{s.detail}</p>
            {s.badge}
          </li>
        ))}
      </ol>
      <figcaption id={`${id}-cap`} className="text-label text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

function Workflows() {
  return (
    <Section id="workflows" title="Two separate workflows" intro={<>
      <p>Training changes a model; asking for an explanation doesn't. When you train the MLP, its weights move. When you ask the tutor, the backend sends facts as <strong>context</strong> for one answer: Qwen reads them, writes, and forgets. <strong>Training the MLP never trains Qwen.</strong></p>
    </>}>
      <Flow id="train" title="1. Training and writing with the MLP" caption="Steps 3 to 5 repeat for every update; only step 5 changes weights. Writing (step 7) uses the weights without changing them."
        steps={[
          { label: "Pick a text", detail: "A dataset with fixed training, validation and test parts, or a Lab text split 80/10/10." },
          { label: "Make examples", detail: "Each window of characters, and the character that came next. Training part only." },
          { label: "Predict", detail: "Embeddings → tanh hidden layer → one score per character → softmax probabilities." },
          { label: "Score", detail: "Loss = −ln of the probability given to the right character, averaged over a batch." },
          { label: "Update", detail: "Gradients from PyTorch; every weight moves by −learning rate × gradient.", badge: <Badge tone="learns">Changes the MLP's weights</Badge> },
          { label: "Save", detail: "Initial and trained weights, plus recorded steps for the replay." },
          { label: "Write", detail: "Probabilities for the window, a seeded random draw, the chosen character joins the window.", badge: <Badge tone="neutral">Uses weights; changes nothing</Badge> },
        ]} />
      <Flow id="tutor" title="2. Asking the tutor for an explanation" caption="Nothing in this workflow changes any model. The facts are context for one answer; Qwen keeps nothing afterwards."
        steps={[
          { label: "You ask", detail: "“Explain this step”, a follow-up, or “Explain in more detail”. Nothing is sent before you press a button." },
          { label: "Facts recomputed", detail: "The page sends which run and step; the backend recomputes the numbers from the engine itself." },
          { label: "Prompt built", detail: "Instructions + the facts + your question, within a 2,048-token limit." },
          { label: "Qwen answers", detail: "Colibri runs Qwen on the prompt and streams the words back.", badge: <Badge tone="infers">Inference only: no weights change</Badge> },
          { label: "You check", detail: "The answer appears beside the engine's own numbers, labelled as experimental." },
        ]} />
    </Section>
  )
}

// ----------------------------------------------------------------------------- C. inside the MLP

const KNOB: Record<string, [string, string]> = {
  context: ["Window", "previous characters read"], embed: ["Embedding size", "numbers per character"], hidden: ["Hidden size", "values in the hidden layer"],
  steps: ["Updates", "gradient-descent steps"], batch: ["Batch", "examples per update"], lr: ["Learning rate", "step size"], seed: ["Seed", "fixes random start and draws"],
}

function InsideMlp({ mlp, error }: { mlp: MlpStatus | null; error: string | null }) {
  const d = mlp?.defaults
  return (
    <Section id="mlp" title="Inside the character MLP" intro={<>
      <p>The MLP reads a few previous characters (its <Term id="context-window">window</Term>), looks up a learned list of numbers for each (its <Term id="embedding">embeddings</Term>), combines them in a <Term id="hidden-layer">hidden layer</Term>, and gives every possible next character a score. <Term id="softmax">Softmax</Term> turns the scores into probabilities. Training nudges every number to make the right character more likely.</p>
    </>}>
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1 text-sm font-semibold">Defaults for a new run <InfoTip id="mlp.steps" /></p>
        {error && <p className="text-sm">The backend isn't answering, so the defaults can't be shown. Start it, then reload this page.</p>}
        {mlp && !mlp.available && <p className="text-sm">PyTorch isn't available here ({mlp.error}). The rest of NextWord works; see <a className="underline underline-offset-2" href={doc("MLP.md")}>MLP.md</a> to install it.</p>}
        {d && mlp?.limits && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm" data-testid="mlp-defaults">
              <caption className="sr-only">The MLP's default settings and allowed ranges, from the backend</caption>
              <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1.5 pr-4 font-normal">Setting</th><th className="pr-4 font-normal">Default</th><th className="pr-4 font-normal">Allowed</th><th className="font-normal">Means</th></tr></thead>
              <tbody>{(Object.keys(KNOB) as (keyof typeof d)[]).map((k) => (
                <tr key={k} className="border-t border-border"><td className="py-1.5 pr-4">{KNOB[k][0]}</td><td className="num pr-4">{d[k]}</td><td className="num pr-4">{mlp.limits![k][0]}–{fmt.n(mlp.limits![k][1])}</td><td className="text-muted-foreground">{KNOB[k][1]}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-label text-muted-foreground">Read from the backend just now. These are the starting values for a new run, not the settings of any run you trained; each run shows its own.</p>
      </div>
      <More>
        <p><span className="font-medium">Shape.</span> window of n character ids → embedding lookup (n × d numbers) → joined into one list of n·d → hidden layer h = tanh(x·W₁ + b₁) with H values → output scores z = h·W₂ + b₂, one per vocabulary character → softmax probabilities.</p>
        <p><span className="font-medium">Vocabulary.</span> Every character of the training part, plus ⟨start⟩ (fills the window before a part begins) and ⟨?⟩ (a character never seen in training). Writing never picks either.</p>
        <p><span className="font-medium">Loss, gradients, optimiser.</span> Cross-entropy: −ln p(right character), averaged over a batch. PyTorch's automatic differentiation computes every weight's gradient (backpropagation). The optimiser is plain gradient descent: weight ← weight − learning rate × gradient, with no momentum.</p>
        <p><span className="font-medium">Checkpoints.</span> Each run keeps its initial (random) and trained weights, each with a fingerprint, plus weights at recorded steps (1, 2, 5, 10, 20, 50, 100, …) and the batches used, so a recorded update can be replayed and checked. Runs are saved in the project's <code className="tok">data/lab/</code> folder, which Git ignores.</p>
        <div className="flex flex-col gap-1 rounded-lg bg-raised p-3">
          <Source kind="example" className="w-fit" />
          <p>Counting the weights with the defaults and a 40-character vocabulary: embeddings 40 × 8 = 320; hidden layer 24 × 64 + 64 = 1,600; output 64 × 40 + 40 = 2,600; total 4,520.</p>
        </div>
        <p>Full description: <a className="underline underline-offset-2" href={doc("MLP.md")}>MLP.md</a>. Try it: <a className="underline underline-offset-2" href={hrefFor("mlp")}>the MLP journey</a>.</p>
      </More>
    </Section>
  )
}

// ----------------------------------------------------------------------------- D. data

function Data() {
  const { corpora } = useCorpora()
  const sets = (corpora ?? []).filter((c) => c.origin === "dataset")
  const missing = ["medium", "large"].filter((lvl) => !sets.some((s) => s.level === lvl))
  return (
    <Section id="data" title="Data: what the models learn from" intro={<>
      <p>The MLP trains on text at three levels: tiny teaching texts for reading every number, a medium practice passage, and a large public-domain corpus. Each has fixed training, validation and test parts, cut at whole chapters, so the model is never scored on text it trained on. These texts train only the small MLP, never Qwen.</p>
    </>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm" data-testid="how-datasets">
          <caption className="sr-only">Training texts on this computer</caption>
          <thead><tr className="text-left text-label text-muted-foreground"><th className="py-1.5 pr-4 font-normal">Text</th><th className="pr-4 font-normal">Level</th><th className="pr-4 font-normal">Characters: train / validation / test</th><th className="font-normal">Source and licence</th></tr></thead>
          <tbody>
            {sets.map((c) => (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="py-1.5 pr-4">{c.name}</td><td className="pr-4">{c.level}</td>
                <td className="num pr-4">{fmt.n(c.parts?.train ?? 0)} / {fmt.n(c.parts?.val ?? 0)} / {fmt.n(c.parts?.test ?? 0)}</td>
                <td className="text-muted-foreground">{c.sources?.length ? c.sources.map((s) => `${s.title}, ${s.author}`).join("; ") + ". Public domain (Project Gutenberg)." : "Written for NextWord."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {corpora && missing.length > 0 && <p className="text-sm">Not prepared on this computer: the {missing.join(" and ")} level. Run <code className="tok">python -m nextword.datasets download</code>, then <code className="tok">prepare</code> (see <a className="underline underline-offset-2" href={doc("DATASETS.md")}>DATASETS.md</a>).</p>}
      <More>
        <p><span className="font-medium">Preprocessing.</span> Only the text between Project Gutenberg's start and end markers; front matter, headings, captions and layout marks removed; one line per paragraph; curly quotes, dashes and accents mapped to plain ASCII. Each prepared dataset has a manifest with checksums.</p>
        <p><span className="font-medium">Avoiding <Term id="leakage">leakage</Term>.</span> Parts are cut before any example is made, so no window crosses two parts; any validation or test paragraph that repeats, or shares 12 words with, a training paragraph is removed; the vocabulary comes from the training part only; the test part is used once, in the final comparison, and nothing is tuned on it.</p>
        <p><span className="font-medium">Unseen characters and zero probabilities.</span> A character the MLP never saw in training becomes ⟨?⟩, and softmax never gives exactly 0, so its loss stays finite. The bigram gives probability 0 to any pair it never counted, so its unsmoothed loss can be infinite; the comparison also shows an add-1 smoothed bigram, and both models are scored on exactly the same targets.</p>
        <p>Your own pasted texts are split 80% / 10% / 10% in order. Details: <a className="underline underline-offset-2" href={doc("DATASETS.md")}>DATASETS.md</a>.</p>
      </More>
    </Section>
  )
}

// ----------------------------------------------------------------------------- E. tutor

function Tutor({ limits }: { limits?: { contextTokens: number; maxTurns: number; maxTokens: Record<string, number>; maxQuestionChars: number; readTimeoutSeconds: number; totalTimeoutSeconds: number } }) {
  return (
    <Section id="tutor" title="The tutor: how explanations are made" intro={<>
      <p>The tutor rewords; it doesn't calculate. When you ask, the backend recomputes the step's facts from the engine and sends them with your question. The answer streams in beside those facts. It is switched off during quizzes, and before you've made a lesson prediction.</p>
    </>}>
      <div className="flex flex-col gap-2 rounded-xl border border-border p-4" data-testid="how-sources">
        <p className="text-sm font-semibold">Three kinds of content, always labelled</p>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex flex-wrap items-center gap-2"><Source kind="model" /> Calculated by your engines (the bigram or the MLP). Correct for the run shown.</li>
          <li className="flex flex-wrap items-center gap-2"><Source kind="lesson" /> Written and maintained in the project. The reference; works offline.</li>
          <li className="flex flex-wrap items-center gap-2"><Source kind="ai" /> Generated by Qwen. Can be wrong; check it against the other two.</li>
        </ul>
      </div>
      <More>
        <p><span className="font-medium">What is sent.</span> The page names the run and step, never the numbers. The backend recomputes the facts (counts, probabilities, weights, losses), adds the lesson's question and the words you've already met, and sends them with fixed instructions. “Numbers from your engine” in the tutor tab shows exactly what was sent.</p>
        <p><span className="font-medium">Streaming.</span> Words arrive as they are written. Stop keeps the text so far, marked as stopped. After twice the model's usual time, the panel says it is taking longer than usual.</p>
        <p><span className="font-medium">Limits{limits ? ", from the backend" : ""}.</span> {limits
          ? <>A conversation must fit the model's {fmt.n(limits.contextTokens)}-token context and holds at most {limits.maxTurns} answers. A first explanation is at most {limits.maxTokens.explain} tokens; “more detail” {limits.maxTokens.detail}; a follow-up {limits.maxTokens.followup}. Questions are at most {limits.maxQuestionChars} characters. An answer is stopped after {limits.readTimeoutSeconds} s of silence or {limits.totalTimeoutSeconds} s in all.</>
          : <>The backend isn't answering, so the exact limits can't be shown here; see <a className="underline underline-offset-2" href={doc("LOCAL_AI.md")}>LOCAL_AI.md</a>.</>}
          {" "}After each answer the backend reports what still fits, so the panel says a conversation is full before you ask.</p>
        <p><span className="font-medium">Stale answers.</span> Every answer is bound to the run, the weights and the step it was about. When those change, earlier answers stay, marked as about an earlier experiment.</p>
        <p><span className="font-medium">Quiz protection.</span> While a checkpoint question is open, even minimised or in the expanded view, the tutor is off and its earlier answers are hidden; checks are graded by the app and never sent to the model. In the Beginner lessons the tutor opens only after you've predicted.</p>
        <p><span className="font-medium">When Colibri isn't running.</span> “Ask your tutor” says so and how to start it. Every lesson, model and written explanation keeps working. Checking only asks Colibri which model it serves; opening a page never asks it to write.</p>
        <p>Details and the request flow: <a className="underline underline-offset-2" href={doc("LOCAL_AI.md")}>LOCAL_AI.md</a>.</p>
      </More>
    </Section>
  )
}

// ----------------------------------------------------------------------------- F. hardware

function Hardware() {
  return (
    <Section id="hardware" title="Hardware and storage" intro={<>
      <p>The <strong>CPU</strong> runs the backend, the bigram and MLP training. The <strong>GPU</strong>, if there is one, runs Qwen through Colibri. <strong>RAM</strong> holds whatever is running; <strong>VRAM</strong> (the GPU's own memory) holds the parts of Qwen placed on the GPU. Where the model file is stored doesn't change how much GPU memory it needs.</p>
    </>}>
      <More>
        <p><span className="font-medium">Model files and quantisation.</span> Qwen is stored as one GGUF file. Q4_K_M quantisation keeps about 4–5 bits per weight instead of 16, so a 4-billion-weight model is a file of about 2.5 GB. Smaller numbers mean less memory and faster answers, with some loss of quality.</p>
        <p><span className="font-medium">Why the drive doesn't matter for VRAM.</span> When Colibri starts, it reads the file from disk into RAM and VRAM. VRAM use depends on the model's size, its quantisation and the context length, not on which drive the file sits on. A second drive only saves space (and may load a little slower or faster).</p>
        <p><span className="font-medium">When a model doesn't fit.</span> Colibri puts as many layers on the GPU as fit and runs the rest on the CPU, which is much slower.</p>
        <div className="flex flex-col gap-1 rounded-lg bg-raised p-3" data-testid="how-measured">
          <p className="text-label font-medium">Measured once on the author's laptop (6 GB GPU), 2026-11-01. Not a reading of this computer.</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Qwen3-4B: up to 4.6 GB of GPU memory; first words in about 0.6 s, a full answer in about 3.4 s.</li>
            <li>Qwen3.5-9B: did not fit on the GPU; about 45 s per answer, with free RAM down to about 1 GB.</li>
            <li>The MLP's largest setting on the 1.2-million-character corpus: 20,000 updates in 24 s, peak 377 MB of RAM.</li>
          </ul>
        </div>
        <p>This computer's live state is in <a className="underline underline-offset-2" href="#how-tools-status" onClick={(e) => { e.preventDefault(); document.getElementById("tools-h")?.scrollIntoView({ block: "start" }) }}>Tools and setup</a>: what is running, never memory readings.</p>
      </More>
    </Section>
  )
}

// ----------------------------------------------------------------------------- G. evaluation

const EVALS = [
  { what: "Bigram explanations, before and after fixes", date: "2026-11-01", sample: "16 fresh questions (frozen beforehand), 3 repeats; 19 development questions", settings: "Qwen3-4B, temperature 0", reviewer: "Automatic checks + AI review (the assistant that made the changes)", result: "After the fixes, 3 of 16 fresh answers still had an error (9 before).", limit: "One model, one laptop; the reviewer is not independent; no human review.", doc: "ROUND2.md" },
  { what: "Explaining model: 4B versus 9B", date: "2026-11-01", sample: "16 questions frozen before either model answered (4B: 3 repeats; 9B: 1)", settings: "Same prompt, facts, limits; temperature 0", reviewer: "Automatic checks + AI review", result: "4B: 13 correct; 9B: 12 correct, and about 12 times slower. The larger model was not better here.", limit: "The 9B partly ran on the CPU; one run per case; no human review.", doc: "COMPARE.md" },
  { what: "Beginner tutor", date: "2026-11-01", sample: "12 fresh questions, 3 repeats; 20 development questions", settings: "Qwen3-4B, temperature 0", reviewer: "Automatic checks + AI review", result: "Fresh: 7 correct, 3 with a minor issue, 2 wrong.", limit: "The human clarity review is still blank.", doc: "TUTOR.md" },
]

function Evaluation() {
  return (
    <Section id="evaluation" title="Evaluation, and what it can't tell you" intro={<>
      <p>Three different checks answer three different questions. <strong>Software tests</strong> check that the code does what it should (lesson results match the engine, checks are graded correctly). <strong>Factual review</strong> reads the AI's answers against the facts. <strong>Human clarity review</strong> asks whether a beginner understood. Passing automatic checks never proves an answer correct, and a bigger model is not automatically a better one.</p>
    </>}>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="how-evals">
        {EVALS.map((e) => (
          <li key={e.what} className="flex flex-col gap-1 p-4 text-sm">
            <p className="font-semibold">{e.what}</p>
            <p className="text-label text-muted-foreground">Run on {e.date}</p>
            <p>{e.result}</p>
            <dl className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-label sm:grid-cols-[7rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Sample</dt><dd>{e.sample}</dd>
              <dt className="text-muted-foreground">Settings</dt><dd>{e.settings}</dd>
              <dt className="text-muted-foreground">Reviewed by</dt><dd>{e.reviewer}</dd>
              <dt className="text-muted-foreground">Limits</dt><dd>{e.limit}</dd>
            </dl>
            <a className="inline-flex min-h-6 w-fit items-center text-label underline underline-offset-2" href={doc(e.doc)}>Full report: {e.doc}</a>
          </li>
        ))}
      </ul>
      <More>
        <p><span className="font-medium">Automatic checks</span> look for required numbers and phrases, forbidden ones, known mistakes and claims that contradict the engine's trace. They miss errors and raise false alarms.</p>
        <p><span className="font-medium">AI review</span> was done by the assistant that built the features: useful, but not independent. <span className="font-medium">Human review</span>: none recorded yet for any evaluation.</p>
        <p>Question sets are frozen (with checksums) before the answers they score are seen; a set used to fix something becomes a development set. See <a className="underline underline-offset-2" href={doc("FROZEN.md")}>FROZEN.md</a>.</p>
        <p>Software tests: <code className="tok">.venv\Scripts\python -m unittest</code> and <code className="tok">npm --prefix web test</code>.</p>
      </More>
    </Section>
  )
}

// ----------------------------------------------------------------------------- H. tools and setup

const TOOL_ROUTES: Route[] = ["learn", "paths", "journey", "mlp", "playground", "data", "counts", "evaluation", "neural", "attention", "decoding", "serving", "adapt", "toolkit", "glossary", "notebook"]

function Tools({ status }: { status: ReturnType<typeof useSystemStatus> }) {
  return (
    <Section id="tools" title="Tools and setup" intro={<p>Every page, what it is for, and how to set up the optional parts. Nothing here starts, stops or downloads anything: those are commands you run yourself.</p>}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ul className="flex flex-col divide-y divide-border" data-testid="how-tools">
          {TOOL_ROUTES.map((r) => {
            const w = WORKSPACES.find((x) => x.route === r)!
            const h = WORKSPACE_HELP.find((x) => x.route === r)
            return <li key={r} className="flex flex-col gap-0.5 py-2"><a className="inline-flex min-h-6 w-fit items-center font-medium underline-offset-2 hover:underline" href={hrefFor(r)}>{w.title}</a><span className="text-sm text-muted-foreground">{h?.practical ?? w.description}</span></li>
          })}
        </ul>
        <div className="flex flex-col gap-6">
          <div id="how-tools-status" className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">What is running on this computer</h3>
            <SystemStatusList status={status} />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <h3 className="font-semibold">Setup instructions</h3>
            <ul className="flex flex-col gap-1">
              <li><a className="underline underline-offset-2" href={doc("README.md")}>README</a>: Python, the interface, tests.</li>
              <li><a className="underline underline-offset-2" href={doc("MLP.md")}>MLP.md</a>: PyTorch for the MLP.</li>
              <li><a className="underline underline-offset-2" href={doc("DATASETS.md")}>DATASETS.md</a>: download and prepare the medium and large texts.</li>
              <li><a className="underline underline-offset-2" href={doc("LOCAL_AI.md")}>LOCAL_AI.md</a>: Colibri and the Qwen model for the tutor.</li>
              <li><a className="underline underline-offset-2" href={doc("LAB.md")}>LAB.md</a>: every page, in detail.</li>
            </ul>
            <p className="text-label text-muted-foreground">Documents open as plain text from your project folder.</p>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ----------------------------------------------------------------------------- roadmap

const ROADMAP: { title: string; tone: "now" | "doing" | "later"; items: { name: string; note: string; route?: Route }[] }[] = [
  { title: "Available now", tone: "now", items: [
    { name: "Beginner lessons", note: `${LESSONS.length} lessons with predictions, real results and app-graded checks.`, route: "learn" },
    { name: "Character bigram engine", note: "Counting model, command line and the Bigram journey.", route: "journey" },
    { name: "Character MLP (PyTorch)", note: "Train, inspect, replay recorded training, generate, compare with the bigram.", route: "mlp" },
    { name: "Three training-text levels", note: "Tiny in the project; medium and large prepared from public-domain books.", route: "mlp" },
    { name: "Optional AI tutor", note: "Qwen3-4B through Colibri; needs Colibri running.", route: "learn" },
    { name: "Evaluation bench", note: "Held-out loss for the bigram, with smoothing.", route: "evaluation" },
    { name: "Simulations", note: "Neural training, attention, decoding, serving, adaptation: browser demonstrations.", route: "attention" },
  ] },
  { title: "In progress", tone: "doing", items: [
    { name: "Human clarity review of the tutor", note: "Your review of the tutor's answers; the table in TUTOR.md is blank." },
    { name: "Your own walkthroughs", note: "Rechecking the bigram (increment 1.1) and the MLP independently, as ROADMAP.md lists." },
  ] },
  { title: "Planned or exploratory", tone: "later", items: [
    { name: "Lessons for comparison and AI evaluation", note: "Foundation steps 11 and 12 have no lesson or graded check yet." },
    { name: "Save and reload bigram counts", note: "Roadmap increment 1.3." },
    { name: "Longer-context n-gram", note: "Roadmap increment 1.5." },
    { name: "Tiny causal transformer", note: "Stage 3; today only the Attention simulation exists." },
    { name: "Regression checks for model swaps", note: "Stage 5." },
    { name: "Extensions", note: "Continued training, writing from your notes, faster inference: Stage 6, chosen later." },
  ] },
]

function Roadmap() {
  return (
    <Section id="roadmap" title="Roadmap" intro={<p>What exists, what is under way, and what is only planned. No dates: nothing planned is promised. Only available items link to a page. Full roadmap: <a className="underline underline-offset-2" href={doc("ROADMAP.md")}>ROADMAP.md</a>.</p>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="how-roadmap-columns">
        {ROADMAP.map((col) => (
          <section key={col.title} aria-label={col.title} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className={cn("size-2 rounded-full", col.tone === "now" ? "bg-positive" : col.tone === "doing" ? "bg-data" : "bg-muted-foreground/40")} />{col.title}</h3>
            <ul className="flex flex-col divide-y divide-border">
              {col.items.map((it) => (
                <li key={it.name} className="flex flex-col gap-0.5 py-2" data-roadmap={col.tone}>
                  {it.route && col.tone === "now" ? <a className="inline-flex min-h-6 w-fit items-center text-sm font-medium underline-offset-2 hover:underline" href={hrefFor(it.route)}>{it.name}</a> : <span className="text-sm font-medium">{it.name}</span>}
                  <span className="text-label text-muted-foreground">{it.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Section>
  )
}
