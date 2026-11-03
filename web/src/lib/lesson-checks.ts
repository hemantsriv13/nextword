// Comprehension checks for the beginner lessons. Each uses a different example from its lesson, with
// stated values ("Worked example"), so it can be answered without the lesson's own screen. Answers that can
// be computed (counts, fractions, losses, updates) are computed here from the stated values, not typed in.
// Graded by the app (lib/checkpoints.ts isCorrect); the tutor never sees these questions or answers.
import type { CheckpointDef, Question } from "./checkpoints"

const q = (c: string) => `‘${c === " " ? "␣" : c}’`
const countPair = (text: string, a: string, b: string) => [...text].slice(0, -1).filter((c, i) => c === a && text[i + 1] === b).length
const rowTotal = (text: string, a: string) => [...text].slice(0, -1).filter((c) => c === a).length
const r = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places

type Spec = Omit<Question, "checkpoint" | "version" | "variant" | "instance" | "source" | "basis"> & { basis?: string }

function def(lesson: string, section: string, specs: Spec[]): CheckpointDef {
  const id = `learn.${lesson}`
  return {
    id, version: 1, section,
    build: (_ctx, variant) => {
      const s = specs[variant % specs.length]
      return { ...s, checkpoint: id, version: 1, variant, instance: `${lesson}#${variant % specs.length}`, source: "Worked example",
        basis: s.basis ?? "A new example with stated values, different from the lesson's." }
    },
  }
}

const num = (prompt: string, answer: number, tolerance: number, rounding: string, rest: Pick<Spec, "hints" | "solution" | "notYet" | "passed">): Spec =>
  ({ kind: "number", prompt, answer, tolerance, rounding, ...rest })
const choice = (prompt: string, options: string[], answer: number, rest: Pick<Spec, "hints" | "solution" | "notYet" | "passed">): Spec =>
  ({ kind: "choice", prompt, choices: options.map((label, i) => ({ id: `o${i}`, label })), answer: `o${answer}`, ...rest })

function characters(text: string): Spec {
  return num(`How many characters does “${text}” have?`, text.length, 0, "A whole number.", {
    hints: ["Every letter is one character.", "Spaces and punctuation marks count too.", `Write the text out one box per character: ${[...text].map((c) => (c === " " ? "␣" : "_")).join(" ")}.`],
    solution: { answer: String(text.length), explanation: "Every letter, space and punctuation mark is one character.", working: [...text].map((c) => q(c)).join(" ") },
    notYet: "Not quite yet. Count every box, including spaces and punctuation.",
    passed: "You counted every character, including the ones that aren't letters.",
  })
}

function pairs(text: string): Spec {
  const n = text.length - 1
  return num(`How many neighbouring pairs does “${text}” have?`, n, 0, "A whole number.", {
    hints: ["A pair is one character and the character right after it.", "Each pair starts where the last one ended.", `The text has ${text.length} characters. Does the last one start a pair?`],
    solution: { answer: String(n), explanation: "There is one pair fewer than characters, because the last character has nothing after it.", working: [...text].slice(0, -1).map((c, i) => `${q(c)}→${q(text[i + 1])}`).join(", ") },
    notYet: "Not quite yet. Join each character to the next one and count the joins.",
    passed: "You can turn a text into its pairs.",
  })
}

function count(text: string, a: string, b: string): Spec {
  const n = countPair(text, a, b)
  return num(`In “${text}”, how many times is ${q(a)} followed right away by ${q(b)}?`, n, 0, "A whole number.", {
    hints: [`Find every ${q(a)} in the text.`, `For each one, look at the very next character.`, `Count only the ones where that next character is ${q(b)}.`],
    solution: { answer: String(n), explanation: `Each time ${q(a)} is followed by ${q(b)} is one count in the row for ${q(a)}.`, working: `${q(a)} appears with a follower ${rowTotal(text, a)} times; ${n} of those followers are ${q(b)}.` },
    notYet: "Not quite yet. Check each place the first character appears, and the character just after it.",
    passed: "You can read a count from a text, which is how the bigram model builds its table.",
  })
}

function probability(text: string, a: string, b: string): Spec {
  const c = countPair(text, a, b), total = rowTotal(text, a), p = c / total
  return num(`In “${text}”, what is P(${b} | ${a}): the probability that ${q(b)} comes next after ${q(a)}?`, r(p, 4), 0.005, "A fraction like 1/2, or a decimal like 0.5.", {
    hints: [`Count how often ${q(a)} is followed by anything.`, `Count how often it is followed by ${q(b)}.`, `Divide the second count by the first.`],
    solution: { answer: `${c}/${total} = ${r(p, 4)}`, explanation: "A probability here is a follower's count divided by the total of its row.", working: `${q(a)}→${q(b)}: ${c}; ${q(a)}→anything: ${total}; ${c} ÷ ${total} = ${r(p, 4)}` },
    notYet: "Not quite yet. The count for this follower goes on top, the row's total underneath.",
    passed: "You can turn counts into a probability.",
  })
}

function sampling(segs: [string, number][], draw: number): Spec {
  let lo = 0
  const spans = segs.map(([t, p]) => { const s = { t, from: lo, to: lo + p }; lo += p; return s })
  const hit = spans.findIndex((s) => draw >= s.from && draw < s.to)
  const line = spans.map((s) => `${q(s.t)} from ${r(s.from, 2)} to ${r(s.to, 2)}`).join(", ")
  return choice(`The probabilities ${segs.map(([t, p]) => `${q(t)} ${p}`).join(", ")} are laid end to end in that order. The random number is ${draw}. Which character is written?`,
    segs.map(([t]) => q(t)), hit, {
      hints: ["Each character owns a stretch of the line from 0 to 1, as long as its probability.", "Work out where each stretch starts and ends.", `The stretches are: ${line}.`],
      solution: { answer: q(spans[hit].t), explanation: "The random number lands in exactly one stretch; that character is written.", working: `${draw} is between ${r(spans[hit].from, 2)} and ${r(spans[hit].to, 2)}.` },
      notYet: "Not quite yet. Find which stretch of the line the random number falls in.",
      passed: "You can follow a random choice made in proportion to the probabilities.",
    })
}

function generation(written: string): Spec {
  return choice(`A bigram model has just written ${q(written)}. Which row of counts does it read to choose the next character?`,
    [`The row for ${q(written)}`, "The row for the first character it was given", "All rows at once"], 0, {
      hints: ["A bigram model looks at only one character.", "Which character is the current one after a step?", "The character it just wrote becomes the current character."],
      solution: { answer: `The row for ${q(written)}`, explanation: "Each written character becomes the context for the next step.", working: `just wrote ${q(written)} → read row ${q(written)} → choose the next character` },
      notYet: "Not quite yet. Think about which single character the model looks at after it writes one.",
      passed: "You can follow how generation feeds each choice back in.",
    })
}

export const LESSON_CHECKS: CheckpointDef[] = [
  def("characters", "Characters", [characters("a dog"), characters("hi there"), characters("yes!")]),
  def("pairs", "Pairs", [pairs("tree"), pairs("dog"), pairs("go go")]),
  def("counts", "Counts", [count("to too tot", "t", "o"), count("the theme", "t", "h"), count("cocoa", "o", "c")]),
  def("probability", "Probability", [probability("xy xz xy xy", "x", "y"), probability("ma me ma", "m", "a"), probability("tip top tap tip", "t", "i")]),
  def("sampling", "Random selection", [sampling([["u", 0.75], ["a", 0.25]], 0.81), sampling([["e", 0.5], ["o", 0.3], ["i", 0.2]], 0.62), sampling([["u", 0.75], ["a", 0.25]], 0.12)]),
  def("generation", "Writing text", [generation("r"), generation(" "), generation("o")]),
  def("learning", "From counting to learning", [4, 10, 8].map((v) => num(`A network with random weights must choose among ${v} characters. Roughly what probability does it give each one?`, r(1 / v, 4), 0.01, "A fraction like 1/2, or a decimal.", {
    hints: ["Random weights don't favour any character.", "So each character gets about the same share.", `The shares of all ${v} characters add up to 1.`],
    solution: { answer: `1/${v} = ${r(1 / v, 4)}`, explanation: "A network that hasn't learned anything is about as good as a blind guess.", working: `1 ÷ ${v} = ${r(1 / v, 4)}` },
    notYet: "Not quite yet. Think of it as sharing a probability of 1 equally.",
    passed: "You know what a network knows before training: about nothing.",
  }))),
  def("embeddings", "Characters as numbers", [[3, 4], [2, 5], [4, 3]].map(([n, d]) => num(`A window of ${n} characters, each with an embedding of ${d} numbers, is put side by side. How many numbers go into the next layer?`, n * d, 0, "A whole number.", {
    hints: ["Each character in the window has its own list of numbers.", "The lists are joined end to end.", `${n} lists of ${d} numbers each.`],
    solution: { answer: String(n * d), explanation: "Joining the window's embeddings gives one longer list.", working: `${n} × ${d} = ${n * d}` },
    notYet: "Not quite yet. Count the numbers in all the joined lists together.",
    passed: "You can work out how much the network reads at once.",
  }))),
  def("hidden", "Combining the numbers", [
    choice("Which of these can tanh never produce?", ["0.5", "−0.99", "1.7"], 2, {
      hints: ["tanh squeezes numbers.", "Think about the range it squeezes them into.", "The range is from −1 to 1."],
      solution: { answer: "1.7", explanation: "tanh always gives a number between −1 and 1.", working: "1.7 > 1, so it is outside the range." },
      notYet: "Not quite yet. Remember the range tanh squeezes every number into.", passed: "You know what tanh does to any number.",
    }),
    choice("tanh(−8) is closest to which number?", ["−1", "0", "−8"], 0, {
      hints: ["tanh keeps the sign.", "Big numbers end up near the edge of the range.", "The range is −1 to 1."],
      solution: { answer: "−1", explanation: "A large negative sum is squeezed close to −1.", working: "tanh(−8) ≈ −0.99999977" },
      notYet: "Not quite yet. Think about the sign and how big −8 is.", passed: "You know how tanh treats large numbers.",
    }),
  ]),
  def("softmax", "Scores to probabilities", [
    num("Three characters have the same score: x 1, y 1, z 1. What probability does softmax give x?", r(1 / 3, 4), 0.005, "A fraction like 1/2, or a decimal.", {
      hints: ["Equal scores get equal probabilities.", "The probabilities add up to 1.", "There are three characters."],
      solution: { answer: "1/3 ≈ 0.3333", explanation: "With equal scores, softmax shares the probability equally.", working: "e¹ ÷ (e¹ + e¹ + e¹) = 1/3" },
      notYet: "Not quite yet. If nothing is preferred, how is 1 shared out?", passed: "You know softmax keeps the scores' order and adds up to 1.",
    }),
    choice("Scores: a 3, b 1, c 2. Which character gets the highest probability?", ["‘a’", "‘b’", "‘c’"], 0, {
      hints: ["Softmax keeps the order of the scores.", "A higher score always gets a higher probability.", "Which score is highest?"],
      solution: { answer: "‘a’", explanation: "The highest score always gets the highest probability.", working: "3 > 2 > 1, so p(a) > p(c) > p(b)" },
      notYet: "Not quite yet. Compare the scores themselves.", passed: "You know softmax keeps the scores' order.",
    }),
  ]),
  def("loss", "Measuring mistakes", [
    num("The network gives the right character a probability of 0.5. What is the loss, −ln(0.5)?", r(-Math.log(0.5), 4), 0.005, "A decimal, to 2 or 3 places.", {
      hints: ["The loss is minus the natural logarithm of p.", "ln(0.5) is negative, so the loss is positive.", "ln(0.5) ≈ −0.693."],
      solution: { answer: String(r(-Math.log(0.5), 4)), explanation: "Half sure gives a medium-sized penalty.", working: `−ln(0.5) = ${r(-Math.log(0.5), 4)}` },
      notYet: "Not quite yet. Use loss = −ln(p) with p = 0.5.", passed: "You can turn a probability into a loss.",
    }),
    num("The network gives the right character a probability of 1. What is the loss?", 0, 0.0001, "A number.", {
      hints: ["The loss is −ln(p).", "What is ln(1)?", "Being completely sure and right should cost nothing."],
      solution: { answer: "0", explanation: "If the right character gets probability 1, there is no penalty.", working: "−ln(1) = 0" },
      notYet: "Not quite yet. Work out ln(1).", passed: "You know a perfect prediction has no loss.",
    }),
    choice("Which prediction gets the bigger loss?", ["p = 0.9 for the right character", "p = 0.1 for the right character", "They get the same loss"], 1, {
      hints: ["The loss only looks at the probability of the right character.", "Smaller p means a bigger penalty.", "Compare 0.9 and 0.1."],
      solution: { answer: "p = 0.1", explanation: "A small probability for the right character is penalised more.", working: `−ln(0.1) = ${r(-Math.log(0.1), 4)}; −ln(0.9) = ${r(-Math.log(0.9), 4)}` },
      notYet: "Not quite yet. Which one was less sure of the right answer?", passed: "You know which way the loss moves.",
    }),
  ]),
  def("update", "Getting better", [[0.5, 0.2, 0.1], [-1.0, -0.5, 0.2], [0.3, -0.4, 0.5]].map(([w, g, lr]) => num(`A weight is ${w}, its gradient is ${g}, and the learning rate is ${lr}. What is the new weight?`, r(w - lr * g, 4), 0.0005, "A decimal.", {
    hints: ["The rule is: new weight = weight − learning rate × gradient.", `First work out learning rate × gradient: ${lr} × ${g}.`, "Then subtract that from the weight. Watch the signs."],
    solution: { answer: String(r(w - lr * g, 4)), explanation: "The weight moves a small step against its gradient.", working: `${w} − ${lr} × (${g}) = ${r(w - lr * g, 4)}` },
    notYet: "Not quite yet. Use new weight = weight − learning rate × gradient, carefully with minus signs.",
    passed: "You can do one gradient-descent update by hand.",
  }))),
  def("training", "Many updates", [
    choice("Training loss keeps falling, but validation loss starts to rise. What is most likely happening?", ["The network is memorising its training text", "The network is learning faster", "The validation text is broken"], 0, {
      hints: ["Validation text is never trained on.", "It shows whether learning carries over to new text.", "Training gets better while new text gets worse."],
      solution: { answer: "Memorising the training text (overfitting)", explanation: "It fits the training examples better and better, but that stops helping on new text.", working: "training ↓, validation ↑ → overfitting" },
      notYet: "Not quite yet. Think about what validation text is for.", passed: "You can read a training curve for overfitting.",
    }),
    choice("Why is validation text never used for training?", ["So it can show whether learning carries over to new text", "Because it is too long", "Because the network can't read it"], 0, {
      hints: ["Think about what you learn from a test you have already seen.", "Validation is a check, not practice.", "It must be new to the network."],
      solution: { answer: "So it can show whether learning carries over", explanation: "Text the network trained on can't tell you if it learned general patterns.", working: "unseen text → honest check" },
      notYet: "Not quite yet. What would a check be worth if the network had practised on it?", passed: "You know why held-out text is kept apart.",
    }),
  ]),
]
