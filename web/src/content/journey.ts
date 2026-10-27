// The learning journey: text → tokens → prediction → training → attention → generation →
// evaluation → serving → adaptation and retrieval. Each stage names where it lives in the Lab and
// whether that is your real engine, a simulation or a worked example.

import type { Route, StageId } from "./glossary"

export interface Stage {
  id: StageId
  title: string
  question: string
  route: Route
  source: "model" | "simulation" | "mixed"
  roadmap: string
  concepts: string[]
}

export const JOURNEY: Stage[] = [
  { id: "text", title: "Text", question: "What does the model learn from?", route: "data", source: "model", roadmap: "Stage 1", concepts: ["corpus"] },
  { id: "tokens", title: "Tokenization", question: "How does text become units?", route: "data", source: "mixed", roadmap: "Stage 1", concepts: ["token", "tokenization", "vocabulary", "token-id", "bpe", "context-window", "training-pair"] },
  { id: "prediction", title: "Prediction from counts", question: "How do counts become a next-token guess?", route: "counts", source: "model", roadmap: "Stage 1", concepts: ["bigram", "conditional-probability", "normalization", "distribution", "sampling", "seed", "unseen-context", "smoothing", "n-gram"] },
  { id: "training", title: "Training", question: "How does a network learn from its mistakes?", route: "neural", source: "simulation", roadmap: "Stage 2", concepts: ["parameter", "tensor", "embedding", "forward-pass", "logits", "softmax", "cross-entropy", "gradient", "backpropagation", "learning-rate", "optimizer", "batch", "epoch", "overfitting"] },
  { id: "attention", title: "Attention", question: "How can each position use the others?", route: "attention", source: "simulation", roadmap: "Stage 3", concepts: ["attention", "qkv", "causal-mask", "multi-head", "positional-encoding", "residual", "layer-norm", "feedforward", "transformer"] },
  { id: "generation", title: "Generation", question: "How do probabilities become text?", route: "decoding", source: "mixed", roadmap: "Stage 4", concepts: ["autoregressive", "greedy", "temperature", "top-k", "top-p", "training-vs-inference", "confidence"] },
  { id: "evaluation", title: "Evaluation", question: "How do we know if a model is better?", route: "evaluation", source: "model", roadmap: "Stages 1 and 4", concepts: ["split", "leakage", "loss", "perplexity", "baseline", "ablation", "error-analysis", "reproducibility"] },
  { id: "serving", title: "Serving", question: "What happens when the app asks for a suggestion?", route: "serving", source: "mixed", roadmap: "Stage 5", concepts: ["api", "latency", "throughput", "serving-batch", "streaming", "model-version", "caching", "kv-cache", "quantization"] },
  { id: "adaptation", title: "Adaptation and retrieval", question: "How do models use new information?", route: "adapt", source: "mixed", roadmap: "Stage 6", concepts: ["pretraining", "continued-training", "forgetting", "instruction-tuning", "prompt-vs-weights", "rag", "chunking", "lexical-search", "semantic-search", "reranking", "grounding"] },
]

export interface Workspace {
  route: Route
  title: string
  short: string
  description: string
  group: "start" | "build" | "simulate" | "measure" | "keep"
}

export const WORKSPACES: Workspace[] = [
  { route: "home", title: "Home", short: "Home", description: "Your learning map and next step", group: "start" },
  { route: "journey", title: "Bigram journey", short: "Bigram journey", description: "One example from text to generated characters, step by step", group: "start" },
  { route: "playground", title: "Writing playground", short: "Playground", description: "Write with your bigram engine and trace each step", group: "start" },
  { route: "data", title: "Data and tokens", short: "Data and tokens", description: "Corpus, tokenizers, windows and splits", group: "build" },
  { route: "counts", title: "Counts and probability", short: "Counts", description: "Your engine's count table, normalization and sampling", group: "build" },
  { route: "neural", title: "Neural network training", short: "Neural training", description: "Embeddings, loss, gradients and overfitting", group: "simulate" },
  { route: "attention", title: "Attention explorer", short: "Attention", description: "Queries, keys, values and the causal mask", group: "simulate" },
  { route: "decoding", title: "Decoding sandbox", short: "Decoding", description: "Softmax, temperature, top-k and top-p", group: "simulate" },
  { route: "evaluation", title: "Evaluation bench", short: "Evaluation", description: "Held-out loss, baselines and ablations", group: "measure" },
  { route: "serving", title: "Serving and performance", short: "Serving", description: "Requests, latency, caching and KV caches", group: "measure" },
  { route: "adapt", title: "Adaptation and retrieval", short: "Adaptation", description: "Continued training and document retrieval", group: "measure" },
  { route: "toolkit", title: "Toolkit Guide", short: "Toolkit Guide", description: "What every page, control and tour is for", group: "keep" },
  { route: "glossary", title: "Glossary", short: "Glossary", description: "Every term, with its experiment", group: "keep" },
  { route: "notebook", title: "Notebook", short: "Notebook", description: "Notes, questions, bookmarks and your data", group: "keep" },
]

export const WORKSPACE_BY_ROUTE = new Map(WORKSPACES.map((w) => [w.route, w]))
