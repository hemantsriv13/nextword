// The learning paths: the order in which NextWord's existing lessons and tools teach. Every step points at
// lessons that exist (content/lessons.json) and routes that exist; nothing here has progress of its own:
// progress comes from the lessons' saved records and checks (lib/lessons.ts, lib/paths.ts).
import type { Route } from "./glossary"

export interface Tool { route: Route; label: string; use: string }

export interface FoundationStep {
  id: string
  title: string
  question: string
  /** Steps this one builds on. Shown as guidance, never as a lock. */
  builds: string[]
  /** What to understand first, in words. */
  before: string
  /** Beginner lessons (ids in lessons.json) that teach this step, in order. Empty: no lesson yet. */
  lessons: string[]
  tools: Tool[]
  /** What you should be able to explain afterwards. */
  after: string
  /** Said when a step has no lesson or app-graded check yet. */
  noCheck?: string
}

export const FOUNDATION: FoundationStep[] = [
  { id: "text", title: "Characters and text", question: "What does a language model actually read?", builds: [],
    before: "Nothing: this is the start.", lessons: ["characters"],
    tools: [{ route: "data", label: "Data and tokens", use: "see a whole training text split into characters" }],
    after: "What a token is here, and why a space or a line break counts as one." },
  { id: "pairs", title: "Pairs and counts", question: "How can a model learn what tends to come next?", builds: ["text"],
    before: "That text is a list of characters.", lessons: ["pairs", "counts"],
    tools: [{ route: "counts", label: "Counts and probability", use: "open the full count table of a real text" }],
    after: "How a text becomes pairs, and how a row of counts says what followed one character." },
  { id: "probability", title: "Probability", question: "How sure can the model be about the next character?", builds: ["pairs"],
    before: "How to read a row of counts.", lessons: ["probability"],
    tools: [{ route: "counts", label: "Counts and probability", use: "check one division by hand for any row" }],
    after: "Why P(next | current) is a count divided by its row's total, and why a row adds up to 1." },
  { id: "sampling", title: "Random selection and seeds", question: "When several characters are possible, which one gets written?", builds: ["probability"],
    before: "What a probability of 2/3 means.", lessons: ["sampling"],
    tools: [{ route: "playground", label: "Writing playground", use: "step through each draw and compare two seeds" },
            { route: "decoding", label: "Decoding sandbox", use: "see how temperature and top-k change the choice" }],
    after: "How a random number picks a character in proportion to its probability, and what a seed repeats." },
  { id: "bigram", title: "Bigram generation and its limits", question: "How does the bigram write text, and why does it stay word-shaped noise?", builds: ["sampling"],
    before: "How one character is chosen.", lessons: ["generation"],
    tools: [{ route: "journey", label: "Bigram journey", use: "follow one real run from text to generated characters" },
            { route: "evaluation", label: "Evaluation bench", use: "see why unseen pairs make its loss infinite" }],
    after: "Why each written character becomes the next context, and why one character of context is not enough." },
  { id: "examples", title: "Training examples and context windows", question: "What does a neural network learn from?", builds: ["bigram"],
    before: "How the bigram uses one character of context.", lessons: ["learning"],
    tools: [{ route: "mlp", label: "MLP journey", use: "see the windows and targets a real run trains on" }],
    after: "What a training example is (a window and the character that followed), and why random weights guess blindly." },
  { id: "embeddings", title: "Embeddings and hidden layers", question: "How does a network turn characters into numbers it can combine?", builds: ["examples"],
    before: "What a window of characters is.", lessons: ["embeddings", "hidden"],
    tools: [{ route: "mlp", label: "MLP journey", use: "inspect one example's embeddings and hidden values" }],
    after: "That embeddings are learned numbers, and what a weighted sum plus tanh does." },
  { id: "loss", title: "Predictions and loss", question: "How does a network make a guess, and how do we score it?", builds: ["embeddings"],
    before: "What the hidden layer computes.", lessons: ["softmax", "loss"],
    tools: [{ route: "mlp", label: "MLP journey", use: "compare the loss of random and trained weights on one example" }],
    after: "How softmax turns scores into probabilities, and why loss is −ln of the right character's probability." },
  { id: "updates", title: "Gradients and weight updates", question: "How does a network get better?", builds: ["loss"],
    before: "What the loss measures.", lessons: ["update"],
    tools: [{ route: "mlp", label: "MLP journey", use: "replay a recorded update and check it by hand" },
            { route: "neural", label: "Neural training (simulation)", use: "apply single updates to a tiny network" }],
    after: "What a gradient says, and how new weight = weight − learning rate × gradient lowers the loss." },
  { id: "validation", title: "Training versus validation, and overfitting", question: "Did the network learn, or memorise?", builds: ["updates"],
    before: "What one update does.", lessons: ["training"],
    tools: [{ route: "mlp", label: "MLP journey", use: "train on the tiny, medium and large texts and compare the curves" },
            { route: "evaluation", label: "Evaluation bench", use: "measure held-out loss for the bigram" }],
    after: "Why held-out text is kept apart, and how to spot overfitting in two loss curves." },
  { id: "comparison", title: "Generation and model comparison", question: "Is the MLP better than counting, and how would we know?", builds: ["validation", "bigram"],
    before: "Training and validation loss; how the bigram writes.", lessons: [],
    tools: [{ route: "mlp", label: "MLP journey, Generation step", use: "generate text, then compare the MLP with the bigram on the same targets" }],
    after: "Why both models are scored on the same held-out targets, and why the unsmoothed bigram can score infinity.",
    noCheck: "No beginner lesson or app-graded check covers this yet. The MLP journey's own checkpoints cover examples, loss and updates." },
  { id: "ai", title: "Evaluating AI explanations", question: "Can I trust what the local tutor says?", builds: ["loss"],
    before: "Enough of a lesson to know its numbers.", lessons: [],
    tools: [{ route: "learn", label: "Beginner lessons, Ask your tutor", use: "ask for an explanation, then check it against “Numbers from your engine”" },
            { route: "how", label: "How NextWord Works, Evaluation", use: "see how the tutor's answers were measured and where they went wrong" }],
    after: "Why a fluent answer can still be wrong, and how to check it against the engine's own numbers.",
    noCheck: "No app-graded check yet. Practise by comparing an answer with the engine's numbers shown beside it." },
]

export const FOUNDATION_BY_ID = new Map(FOUNDATION.map((s) => [s.id, s]))

/** The deeper paths: existing pages in a sensible order, each with what it needs first. */
export interface DeeperPath { id: string; title: string; teaches: string; needs: string; needsSteps: string[]; routes: Route[]; note?: string }

export const PATHS: DeeperPath[] = [
  { id: "bigram", title: "The bigram in depth", teaches: "Your count-based engine end to end: a real run, your own text, the whole count table, and fair held-out scoring.",
    needs: "Foundation steps 1–5.", needsSteps: ["text", "pairs", "probability", "sampling", "bigram"], routes: ["journey", "playground", "counts", "evaluation"] },
  { id: "neural", title: "The neural network in depth", teaches: "Train the real character MLP on tiny, medium and large texts, follow one example through it, and replay its recorded training.",
    needs: "Foundation steps 6–10.", needsSteps: ["examples", "embeddings", "loss", "updates", "validation"], routes: ["mlp", "neural", "data"] },
  { id: "beyond", title: "Beyond the MLP", teaches: "How larger models attend, decode, get served and use new information.",
    needs: "The neural network in depth.", needsSteps: ["validation"], routes: ["attention", "decoding", "serving", "adapt"],
    note: "These pages are browser simulations or worked examples: no trained transformer exists in NextWord yet." },
]
