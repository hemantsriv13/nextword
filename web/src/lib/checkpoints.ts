// Learning checkpoints: short, automatically checkable questions at concept boundaries of the
// guided lessons. This file is pure: question generation, answer checking, hints, solutions and
// progress outcomes, so each can be tested on its own. The dialog lives in components/lab/checkpoint.tsx.
//
// A question is built once, from a frozen snapshot of the run or from stated worked-example values,
// and keeps those values even if the controls change afterwards. Builders return null rather than
// invent a question when the data can't support one (no generated steps, an empty row, a stopped run).
import type { Journey } from "@/lib/api"
import { contextBefore, engineRow, intervals, pairOccurrences, topPairs } from "@/lib/journey"
import { charTokens, visible } from "@/sim/tokenize"

export interface Choice { id: string; label: string }

export interface Question {
  checkpoint: string
  version: number
  variant: number
  /** Identifies these exact values; stored with every attempt. */
  instance: string
  kind: "choice" | "number"
  source: "Your model" | "Worked example"
  /** What the values come from, shown above the question. */
  basis: string
  prompt: string
  choices?: Choice[]
  /** The id of the correct choice, or the exact number. */
  answer: string | number
  /** For numbers: how close counts as correct, and how to write the answer. */
  tolerance?: number
  rounding?: string
  /** Point to the idea, suggest the method, give a partial setup. Never the answer. */
  hints: [string, string, string]
  solution: { answer: string; explanation: string; working: string }
  /** Said when an answer is not right yet. Names what to revisit, not the answer. */
  notYet: string
  /** Said on a pass: what the answer shows you can do. */
  passed: string
}

export interface JourneyContext {
  run: { config: { corpus: string; prompt: string; length: number; seed: number }; result: Journey }
  pair: { a: string; b: string }
  sel: number
}

export type Context = JourneyContext | Record<string, never>

export interface CheckpointDef {
  id: string
  version: number
  /** The lesson section this checkpoint closes. */
  section: string
  build: (ctx: Context, variant: number) => Question | null
}

const q = (c: string) => `‘${visible(c)}’`
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places

/** Order choices by a seed so the correct one is not always in the same place. */
export function shuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
    const j = Math.abs(h) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A number as typed: 0.2, .2, 0,2, 1/5, 20% or 2e-1. Returns null if it isn't one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s+/g, "").replace(",", ".")
  if (!t) return null
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2])
  const pct = t.match(/^(-?\d*\.?\d+)%$/)
  if (pct) return Number(pct[1]) / 100
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function isCorrect(question: Question, input: string): boolean {
  if (question.kind === "choice") return input === question.answer
  const n = parseNumber(input)
  return n !== null && Math.abs(n - (question.answer as number)) <= (question.tolerance ?? 1e-9)
}

const isJourney = (ctx: Context): ctx is JourneyContext => "run" in ctx

// ----------------------------------------------------------------------------- Bigram journey

const journeyBasis = (ctx: JourneyContext) => `From your run: ${ctx.run.result.corpus.name}, prompt “${ctx.run.config.prompt}”, seed ${ctx.run.config.seed}.`

const count: CheckpointDef = {
  id: "journey.count", version: 1, section: "Count pairs",
  build: (ctx, variant) => {
    if (!isJourney(ctx)) return null
    const { table, text } = ctx.run.result
    // Ask about a pair other than the one on screen, so the answer has to be counted, not read off.
    const pairs = topPairs(table, 10).filter((p) => p.count >= 2 && !(p.a === ctx.pair.a && p.b === ctx.pair.b))
    if (!pairs.length) return null
    const p = pairs[variant % pairs.length]
    const places = pairOccurrences(text, p.a, p.b)
    const n = table.rows[p.a]?.[p.b] ?? 0
    if (places.length !== n) return null // the text and the table must agree, or the question would be wrong
    return {
      checkpoint: "journey.count", version: 1, variant, instance: `${ctx.run.result.corpus.fingerprint}:${p.a}${p.b}`,
      kind: "number", source: "Your model", basis: journeyBasis(ctx),
      prompt: `How many times is ${q(p.a)} immediately followed by ${q(p.b)} in the training text?`,
      answer: n, tolerance: 0, rounding: "A whole number.",
      hints: [
        "The model's counts are just how often one character came right after another.",
        `Pick the pair ${q(p.a)}, ${q(p.b)} in the Count pairs stage, or scan the text: every ${q(p.a)} whose very next character is ${q(p.b)} adds one.`,
        `The first place is at character ${places[0] + 1}. Keep going through the text and count each further place the same way.`,
      ],
      solution: {
        answer: String(n),
        explanation: "Each place where the first character is directly followed by the second adds one to that pair's count. Your engine's count table holds the same number.",
        working: `Places at characters ${places.map((i) => i + 1).join(", ")}: ${places.map(() => "1").join(" + ")} = ${n}.`,
      },
      notYet: "Not quite yet. Revisit the highlighted places in the text and count each one, including those next to spaces, then try again.",
      passed: "You counted how often one character followed another: that count is all this model learns.",
    }
  },
}

const context: CheckpointDef = {
  id: "journey.context", version: 1, section: "Read the context",
  build: (ctx, variant) => {
    const worked = variant > 0 || !isJourney(ctx)
    const prompt = worked ? ["the cat sa", "on the ma", "a rat a"][(variant - 1 + 3) % 3] : ctx.run.config.prompt
    const chars = charTokens(prompt)
    if (chars.length < 2) return null
    const last = chars.at(-1)!
    const words = prompt.trimEnd().split(/\s+/)
    const lastWord = words.at(-1) ?? prompt
    const distinct = [
      { id: "last", label: `Only its last character, ${q(last)}` },
      { id: "word", label: `Its last word, “${lastWord}”` },
      { id: "first", label: `Its first character, ${q(chars[0])}` },
      { id: "all", label: "All of it, with the end counting most" },
    ]
    return {
      checkpoint: "journey.context", version: 1, variant, instance: `ctx:${prompt}`,
      kind: "choice", source: worked ? "Worked example" : "Your model",
      basis: worked ? "A worked example prompt, not your run." : journeyBasis(ctx as JourneyContext),
      prompt: `The prompt is “${prompt}”. What does the bigram engine use to choose the next character?`,
      choices: shuffle(distinct, prompt), answer: "last",
      hints: [
        "A bigram model has a context of exactly one character.",
        "Look at where the prediction starts in the Read the context stage: which part is highlighted, and which is faded?",
        "Only one character selects the row of the count table. Which position in the prompt does it come from?",
      ],
      solution: {
        answer: `Only its last character, ${q(last)}`,
        explanation: "A bigram model's context is one character: the last one. Earlier characters and words do not change which row of the count table is used.",
        working: `“${prompt}” ends in ${q(last)}, so the row for ${q(last)} gives the probabilities for the next character.`,
      },
      notYet: "Not quite yet. Revisit which character of the prompt is highlighted in the Read the context stage, then try again.",
      passed: "You identified the context used for the next prediction.",
    }
  },
}

const probs: CheckpointDef = {
  id: "journey.probs", version: 1, section: "Calculate probabilities",
  build: (ctx, variant) => {
    if (!isJourney(ctx)) return null
    const { table, generation } = ctx.run.result
    // Rows with at least two followers, the run's first context first; never an empty row.
    const first = generation.steps[0]?.context
    const rows = Object.keys(table.rows).filter((c) => Object.keys(table.rows[c]).length >= 2 && (table.totals[c] ?? 0) > 0)
    rows.sort((x, y) => (x === first ? -1 : y === first ? 1 : (table.totals[y] ?? 0) - (table.totals[x] ?? 0)))
    if (!rows.length) return null
    const a = rows[variant % rows.length]
    const { total, items } = engineRow(table, a)
    const sorted = [...items].sort((x, y) => y.count - x.count)
    const target = sorted[1] // not the most common: the division has to be done
    const p = round(target.count / total, 2)
    const list = sorted.map((i) => `${q(i.token)} ${i.count} ${i.count === 1 ? "time" : "times"}`).join(", ")
    return {
      checkpoint: "journey.probs", version: 1, variant, instance: `${ctx.run.result.corpus.fingerprint}:${a}${target.token}`,
      kind: "number", source: "Your model", basis: journeyBasis(ctx),
      prompt: `After ${q(a)}, the training text continues with ${list}. What is the probability that the next character is ${q(target.token)}?`,
      answer: p, tolerance: 0.006, rounding: "A decimal rounded to 2 places (a fraction like 1/5 or a percentage also works).",
      hints: [
        "A probability here is the share of the row that one next character takes.",
        "Divide that character's count by the row total.",
        `The row total is the sum of all the counts after ${q(a)}. Set it up as ${target.count} ÷ (${sorted.map((i) => i.count).join(" + ")}).`,
      ],
      solution: {
        answer: p.toFixed(2),
        explanation: "The engine divides each count in the row by the row total, so the probabilities of a row add up to one. This is normalization.",
        working: `count(${visible(a)} → ${visible(target.token)}) ÷ total(${visible(a)}) = ${target.count} ÷ ${total} = ${(target.count / total).toFixed(4)} ≈ ${p.toFixed(2)}.`,
      },
      notYet: "Not quite yet. Revisit how the row total is calculated, then try again.",
      passed: "You turned a count into a probability by dividing by its row total.",
    }
  },
}

const sample: CheckpointDef = {
  id: "journey.sample", version: 1, section: "Sample a character",
  build: (ctx, variant) => {
    if (!isJourney(ctx)) return null
    const g = ctx.run.result.generation
    const surprising = g.steps.findIndex((s) => s.token !== [...s.candidates].sort((x, y) => y.p - x.p)[0].token)
    if (variant % 2 === 0 && surprising >= 0) {
      const s = g.steps[surprising]
      const top = [...s.candidates].sort((x, y) => y.p - x.p)[0]
      const chosen = s.candidates.find((c) => c.token === s.token)!
      const iv = intervals(s).find((x) => x.token === s.token)!
      return {
        checkpoint: "journey.sample", version: 1, variant, instance: `${ctx.run.result.corpus.fingerprint}:${ctx.run.config.seed}:${surprising}`,
        kind: "choice", source: "Your model", basis: journeyBasis(ctx),
        prompt: `At step ${surprising + 1}, after ${q(s.context)}, ${q(top.token)} had p = ${top.p.toFixed(2)} and ${q(s.token)} had p = ${chosen.p.toFixed(2)}. The engine wrote ${q(s.token)}. Why?`,
        choices: shuffle([
          { id: "random", label: `The draw is random: ${q(s.token)} owns ${Math.round(chosen.p * 100)}% of the range from 0 to 1, and the random number landed there.` },
          { id: "seed", label: "The seed tells the engine to skip the most likely character." },
          { id: "recent", label: `${q(top.token)} was used recently, so it was blocked.` },
          { id: "rounded", label: `The probabilities are rounded, so ${q(s.token)} was really the more likely one.` },
        ], `${surprising}`), answer: "random",
        hints: [
          "Sampling uses the probabilities; it does not always take the largest one.",
          "Look at the strip in the Sample a character stage: each character owns a stretch, and the red line is the random number.",
          `For this step the random number was u = ${s.draw.toFixed(3)}. Find which stretch contains it.`,
        ],
        solution: {
          answer: `The draw is random, and ${q(s.token)} owns ${Math.round(chosen.p * 100)}% of the range.`,
          explanation: "The engine lays the probabilities end to end from 0 to 1 and picks the character whose stretch the random number lands in. A likelier character is more often picked, not always.",
          working: `${q(s.token)}'s stretch runs from ${iv.start.toFixed(3)} to ${iv.end.toFixed(3)}; u = ${s.draw.toFixed(3)} falls inside it.`,
        },
        notYet: "Not quite yet. Revisit where the random number lands on the strip in the Sample a character stage, then try again.",
        passed: "You explained why the most likely character is not guaranteed to be chosen.",
      }
    }
    return {
      checkpoint: "journey.sample", version: 1, variant, instance: `seed:${ctx.run.config.seed}`,
      kind: "choice", source: "Your model", basis: journeyBasis(ctx),
      prompt: `You run the journey again with the same training text, prompt, length and seed (${ctx.run.config.seed}). What happens?`,
      choices: shuffle([
        { id: "same", label: "Exactly the same characters, because the same random numbers are drawn." },
        { id: "different", label: "Different characters, because sampling is random each time." },
        { id: "first", label: "Only the first character is the same; the rest change." },
        { id: "top", label: "The most likely character is picked at every step." },
      ], `seed${variant}`), answer: "same",
      hints: [
        "The seed decides which random numbers are drawn.",
        "With everything else unchanged, ask what the same random numbers do to each draw.",
        "Step 1 uses the same row and the same random number as before. What follows from that for step 2?",
      ],
      solution: {
        answer: "Exactly the same characters.",
        explanation: "A seed fixes the sequence of random numbers. With the same model, prompt and settings, every draw lands in the same place, so the output repeats. A seed does not make the engine pick the most likely character.",
        working: `Same rows, same draws (seed ${ctx.run.config.seed}) → same choices at every step.`,
      },
      notYet: "Not quite yet. Revisit what the seed controls in the Sample a character stage, then try again.",
      passed: "You predicted that matching conditions and the same seed repeat a run exactly.",
    }
  },
}

const repeat: CheckpointDef = {
  id: "journey.repeat", version: 1, section: "Append and repeat",
  build: (ctx, variant) => {
    if (!isJourney(ctx)) return null
    const g = ctx.run.result.generation
    if (g.steps.length < 2) return null // a run that stopped at once has no next context to ask about
    const k = (Math.min(ctx.sel, g.steps.length - 2) + variant) % (g.steps.length - 1)
    const s = g.steps[k]
    const promptLast = charTokens(g.prompt).at(-1)!
    const options = [
      { id: "chosen", token: s.token },
      { id: "previous", token: s.context },
      { id: "prompt", token: promptLast },
      { id: "two-back", token: k > 0 ? contextBefore(g, k - 1) : charTokens(g.prompt).at(-2) ?? " " },
    ]
    // Distractors must differ from the answer and from each other.
    const seen = new Set<string>()
    const choices = options.filter((o) => { if (seen.has(o.token)) return false; seen.add(o.token); return true })
    if (choices.length < 2) return null
    return {
      checkpoint: "journey.repeat", version: 1, variant, instance: `${ctx.run.result.corpus.fingerprint}:${ctx.run.config.seed}:${k}`,
      kind: "choice", source: "Your model", basis: journeyBasis(ctx),
      prompt: `Step ${k + 1} read the context ${q(s.context)} and chose ${q(s.token)}. Which character is the context for step ${k + 2}?`,
      choices: shuffle(choices.map((o) => ({ id: o.id, label: q(o.token) })), `rep${k}`), answer: "chosen",
      hints: [
        "After every step, the output grows by one character.",
        "The next prediction reads the last character of everything written so far.",
        `After step ${k + 1}, the text ends with the character that step just added. What was it?`,
      ],
      solution: {
        answer: q(s.token),
        explanation: "The chosen character is appended, and it becomes the context for the next step. That is how the model writes more than one character.",
        working: `Step ${k + 1}: context ${q(s.context)} → chose ${q(s.token)} → step ${k + 2} reads ${q(s.token)}.`,
      },
      notYet: "Not quite yet. Revisit how the context moves forward in the Append and repeat stage, then try again.",
      passed: "You followed the context forward: each chosen character becomes the next context.",
    }
  },
}

// ----------------------------------------------------------------------------- workspace walkthroughs
// These pages are simulations or worked examples, so their questions use stated numbers.

const worked = (basis: string) => ({ source: "Worked example" as const, basis })

const neuralLoss: CheckpointDef = {
  id: "neural.loss", version: 1, section: "Scores, probabilities and the loss",
  build: (_ctx, variant) => {
    const p = [0.25, 0.5, 0.1][variant % 3]
    const loss = round(-Math.log(p), 2)
    return {
      checkpoint: "neural.loss", version: 1, variant, instance: `p=${p}`, kind: "number",
      ...worked("A worked example for the browser simulation, not your bigram engine."),
      prompt: `The network gives the correct next token probability p = ${p}. The loss is −log p, using the natural log. What is the loss?`,
      answer: loss, tolerance: 0.006, rounding: "A decimal rounded to 2 places.",
      hints: ["The loss measures the miss on the correct token only.", "Take the natural logarithm of p and change its sign.", `Set it up as −ln(${p}). ln of a number below 1 is negative, so the loss is positive.`],
      solution: { answer: loss.toFixed(2), explanation: "Loss is 0 when the model gives the correct token probability 1, and grows as that probability shrinks.", working: `−ln(${p}) = ${(-Math.log(p)).toFixed(4)} ≈ ${loss.toFixed(2)}.` },
      notYet: "Not quite yet. Revisit how the loss is computed from the correct token's probability, then try again.",
      passed: "You computed the loss from the probability of the correct token.",
    }
  },
}

const neuralUpdate: CheckpointDef = {
  id: "neural.update", version: 1, section: "The update, before and after",
  build: (_ctx, variant) => {
    const [w, g, lr] = [[0.4, 0.25, 0.5], [0.8, -0.3, 0.1], [-0.2, 0.5, 0.2]][variant % 3]
    const after = round(w - lr * g, 3)
    return {
      checkpoint: "neural.update", version: 1, variant, instance: `w=${w},g=${g},lr=${lr}`, kind: "number",
      ...worked("A worked example for the browser simulation, not your bigram engine."),
      prompt: `A weight w = ${w} has gradient ${g}, and the learning rate is ${lr}. What is w after one update?`,
      answer: after, tolerance: 0.0006, rounding: "A decimal rounded to 3 places.",
      hints: ["An update moves each weight against its gradient.", "Multiply the gradient by the learning rate, then subtract that from the weight.", `Set it up as ${w} − ${lr} × (${g}).`],
      solution: { answer: after.toFixed(3), explanation: "Plain gradient descent: every weight moves by −learning rate × its gradient. A negative gradient makes the weight grow.", working: `${w} − ${lr} × (${g}) = ${w} − ${(lr * g).toFixed(3)} = ${after.toFixed(3)}.` },
      notYet: "Not quite yet. Revisit the before and after table: which direction does the update move a weight?",
      passed: "You applied one gradient-descent update.",
    }
  },
}

const attentionMask: CheckpointDef = {
  id: "attention.mask", version: 1, section: "Match, scale, mask, normalize",
  build: (_ctx, variant) => {
    const [from, to] = [[2, 4], [1, 3], [3, 5]][variant % 3]
    return {
      checkpoint: "attention.mask", version: 1, variant, instance: `${from}->${to}`, kind: "choice",
      ...worked("About the toy attention simulation on this page."),
      prompt: `With the causal mask on, how much attention weight can position ${from} give position ${to}?`,
      choices: shuffle([
        { id: "zero", label: "Exactly 0" },
        { id: "small", label: "A small amount, depending on the scores" },
        { id: "equal", label: `An equal share, 1 ÷ ${to}` },
        { id: "words", label: "It depends on which words are there" },
      ], `${from}${to}`), answer: "zero",
      hints: ["The mask is about earlier and later positions.", `Is position ${to} before or after position ${from}?`, "Before softmax, every later position's score is replaced by one particular value. What does softmax turn it into?"],
      solution: { answer: "Exactly 0", explanation: "The causal mask sets every later position's score to −∞, and e^(−∞) = 0, so its weight is exactly zero. A position can only read itself and earlier positions.", working: `Position ${to} is after position ${from} → score −∞ → weight 0.` },
      notYet: "Not quite yet. Revisit the masked scores matrix and the row for this position, then try again.",
      passed: "You applied the causal mask: later positions get no weight at all.",
    }
  },
}

const decodingOrder: CheckpointDef = {
  id: "decoding.order", version: 1, section: "The distribution after each stage",
  build: (_ctx, variant) => {
    const v = [
      { after: "keeping only the top-k tokens", answer: "renorm" },
      { after: "dividing the logits by the temperature", answer: "softmax" },
      { after: "the top-p filter", answer: "renorm" },
    ][variant % 3]
    return {
      checkpoint: "decoding.order", version: 1, variant, instance: v.after, kind: "choice",
      ...worked("About the decoding pipeline in this sandbox."),
      prompt: `In this sandbox's pipeline, what happens right after ${v.after}?`,
      choices: shuffle([
        { id: "renorm", label: "Renormalize: divide the kept probabilities by their sum" },
        { id: "softmax", label: "Softmax: turn the scores into probabilities" },
        { id: "sample", label: "Draw the token" },
        { id: "temperature", label: "Divide the logits by the temperature" },
      ], v.after), answer: v.answer,
      hints: ["The order is written under the stage table: divide by T, softmax, top-k, renormalize, top-p, renormalize, sample.", "Ask what the numbers are at that point: scores, or probabilities that no longer add up to one?", "Filtering removes probability, so the rest must be made to add up to one again; scores must first become probabilities."],
      solution: { answer: v.answer === "renorm" ? "Renormalize" : "Softmax", explanation: "The sandbox runs: divide logits by T → softmax → top-k → renormalize → top-p → renormalize → sample.", working: `After ${v.after} comes ${v.answer === "renorm" ? "renormalizing" : "softmax"}.` },
      notYet: "Not quite yet. Revisit the order of the stages written under the table, then try again.",
      passed: "You placed a decoding step in the right order.",
    }
  },
}

const evaluationSplit: CheckpointDef = {
  id: "evaluation.validation", version: 1, section: "Change one thing: k",
  build: (_ctx, variant) => {
    const what = ["the smoothing strength k", "between two training texts", "how many characters to keep in each split"][variant % 3]
    return {
      checkpoint: "evaluation.validation", version: 1, variant, instance: what, kind: "choice",
      ...worked("About how this bench uses your engine's scores."),
      prompt: `You are choosing ${what} by comparing scores. Which part of the text should those scores come from?`,
      choices: shuffle([
        { id: "val", label: "The validation part" },
        { id: "test", label: "The test part" },
        { id: "train", label: "The training part the engine counted" },
        { id: "any", label: "Any part, as long as it is the same one each time" },
      ], what), answer: "val",
      hints: ["The three parts have three different jobs.", "One part is for trying settings, and one is kept untouched for a final check.", "If the part you tune on is later used for the final score, is that final score still independent?"],
      solution: { answer: "The validation part", explanation: "Validation is for trying and choosing settings. The test part is kept for one final check; choosing with test scores would make the test part of tuning. Training text is what the engine counted, so it says little about unseen text.", working: "Choose on validation → check once on test." },
      notYet: "Not quite yet. Revisit what Measure on says about validation and test, then try again.",
      passed: "You kept the test part for the final check and tuned on validation.",
    }
  },
}

const retrievalLexical: CheckpointDef = {
  id: "adapt.lexical", version: 1, section: "Score and rank the passages",
  build: (_ctx, variant) => {
    const [doc, query] = [["steep the leaves for three minutes", "brew"], ["the cat dozed on the sofa", "sleeping"], ["boil the kettle first", "heat water"]][variant % 3]
    return {
      checkpoint: "adapt.lexical", version: 1, variant, instance: query, kind: "choice",
      ...worked("About the lexical search simulation on this page."),
      prompt: `A document says “${doc}”, and you search for “${query}”. What does this page's search (BM25) find?`,
      choices: shuffle([
        { id: "none", label: "Nothing for that document: it shares no word with the question" },
        { id: "match", label: "That document, because it means the same thing" },
        { id: "model", label: "It asks a language model for synonyms first" },
        { id: "all", label: "Every document, ranked by meaning" },
      ], query), answer: "none",
      hints: ["Lexical search compares words, not meanings.", `List the words of “${query}” and check whether any of them appear in the document.`, "A passage only scores above zero if it shares at least one search word."],
      solution: { answer: "Nothing for that document.", explanation: "BM25 scores passages by the words they share with the question. Synonyms with no shared word score zero; an embedding model might find them, but none is used here.", working: `“${query}” and “${doc}” share no word → score 0.` },
      notYet: "Not quite yet. Revisit the Matched words column in the Search panel, then try again.",
      passed: "You saw that lexical search matches words, not meanings.",
    }
  },
}

export const CHECKPOINTS: CheckpointDef[] = [count, context, probs, sample, repeat, neuralLoss, neuralUpdate, attentionMask, decodingOrder, evaluationSplit, retrievalLexical]
export const CHECKPOINT_BY_ID = new Map(CHECKPOINTS.map((c) => [c.id, c]))

/** The journey stage whose Next opens each checkpoint (stage index → checkpoint id). */
export const JOURNEY_CHECKPOINTS: Record<number, string> = { 1: "journey.count", 2: "journey.context", 3: "journey.probs", 4: "journey.sample", 5: "journey.repeat" }

/** A question for this checkpoint, trying further examples if one can't be built from the data. */
export function questionFor(def: CheckpointDef, ctx: Context, variant: number): Question | null {
  for (let v = variant; v < variant + 6; v++) {
    const built = def.build(ctx, v)
    if (built) return built
  }
  return null
}

// ----------------------------------------------------------------------------- progress

export type Outcome = "wrong" | "passed" | "passed-with-hints" | "solution-viewed" | "matched-after-solution" | "skipped"

export interface CheckpointRecord {
  version: number
  visited?: string
  skipped?: string
  passed?: string
  passedWithHints?: boolean
  solutionViewed?: string
  attempts: { at: string; question: string; outcome: Outcome }[]
}

export type Status = "Not started" | "Section visited" | "Checkpoint skipped" | "Passed" | "Passed with hints" | "Reviewed with solution" | "Answered an earlier version"

/** One line that keeps the outcomes apart. A pass is evidence about one question, nothing more. */
export function statusOf(rec: CheckpointRecord | undefined, version: number): Status {
  if (!rec) return "Not started"
  if (rec.version !== version) return "Answered an earlier version"
  const passedAfterSolution = rec.passed && (!rec.solutionViewed || rec.passed > rec.solutionViewed)
  if (passedAfterSolution) return rec.passedWithHints ? "Passed with hints" : "Passed"
  if (rec.solutionViewed) return "Reviewed with solution"
  if (rec.skipped) return "Checkpoint skipped"
  if (rec.visited) return "Section visited"
  return "Not started"
}

/** Whether Next should stop for this checkpoint: not once it has been passed (unless practising). */
export function shouldAsk(rec: CheckpointRecord | undefined, version: number, practice: boolean) {
  if (practice) return true
  const s = statusOf(rec, version)
  return s !== "Passed" && s !== "Passed with hints"
}

/** Fold one event into a record. Pure, so the honesty rules can be tested directly. */
export function recordOutcome(rec: CheckpointRecord | undefined, version: number, question: string, outcome: Outcome | "visited", at: string): CheckpointRecord {
  const base: CheckpointRecord = rec && rec.version === version ? { ...rec, attempts: [...rec.attempts] } : { version, attempts: rec ? [...rec.attempts] : [] }
  if (outcome === "visited") return { ...base, visited: base.visited ?? at }
  base.attempts.push({ at, question, outcome })
  if (outcome === "skipped") base.skipped = at
  if (outcome === "solution-viewed") base.solutionViewed = at
  if (outcome === "passed" || outcome === "passed-with-hints") { base.passed = at; base.passedWithHints = outcome === "passed-with-hints" }
  return base
}
