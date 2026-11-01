// Client for Ask local AI (nextword/lab/assist.py). The page names a run and a lesson step; the
// Python backend recomputes the facts, asks Colibri, and streams the answer back one line at a time.
// Nothing here talks to a model directly, and nothing falls back to another service.

import { ApiError } from "./api"

export type AssistAction = "explain" | "detail" | "simpler" | "example" | "followup"

export interface AssistRun {
  corpus: string
  fingerprint: string
  prompt: string
  length: number
  seed: number
}

export type AssistFocus =
  | { stage: "text" | "count"; pair: [string, string] }
  | { stage: "context" }
  | { stage: "probs"; context: string }
  | { stage: "sample" | "repeat"; step: number }

/** The MLP journey names a run, a checkpoint and its weights, and one example at one stage. */
export interface MlpRef { run: string; checkpoint: "initial" | "trained"; fingerprint: string }
export interface MlpFocus { stage: string; split: "train" | "val"; index: number; seed?: number }

/** A beginner lesson: which lesson, which of its examples, and how far the learner has got. */
export interface LessonRef { id: string; step: "result" | "why" | "term"; example: number }

/** What a page asks about: a bigram run and selection, an MLP checkpoint and example, or a lesson step. */
export type AssistRequest = { run: AssistRun; focus: AssistFocus } | { mlp: MlpRef; focus: MlpFocus } | { lesson: LessonRef }

/** The key that binds a tutor answer to one lesson, example and step. */
export function lessonKey(ref: LessonRef): string {
  return ["lesson", ref.id, ref.example, ref.step].join("|")
}

export interface AssistStatus {
  url: string
  model: string
  label?: string
  typicalSeconds?: number
  available: boolean
  modelServed: boolean
  served: string[]
  contextTokens: number | null
  message?: string
}

export interface AssistTimings {
  queue: number | null
  firstText: number | null
  total: number
}

export type AssistEvent =
  | { type: "start"; conversation: string; key: string; action: AssistAction; turn: number; maxTurns: number; model: string; url: string; maxTokens: number; facts: unknown; calculations: string[] }
  | { type: "delta"; text: string }
  | { type: "done"; finish: string | null; timingsMs: AssistTimings; turns: number; maxTurns: number; empty: boolean; room?: Partial<Record<AssistAction, boolean>> }
  | { type: "error"; code: string; message: string }

/** The key that binds an MLP answer to one run, one set of weights, one stage and one example. */
export function mlpKey(ref: MlpRef, focus: MlpFocus): string {
  return ["mlp", ref.run, ref.checkpoint, ref.fingerprint, focus.stage, focus.split, focus.index, focus.seed ?? ""].join("|")
}

/** The key that binds an answer to one run and one selection on screen. */
export function assistKey(run: AssistRun, focus: AssistFocus): string {
  const sel = "pair" in focus ? focus.pair.join("") : "context" in focus ? focus.context : "step" in focus ? String(focus.step) : ""
  return [run.corpus, run.fingerprint, run.prompt, run.length, run.seed, focus.stage, sel].join("|")
}

export async function assistStatus(): Promise<AssistStatus> {
  let res: Response
  try {
    res = await fetch("/api/assist/status", { signal: AbortSignal.timeout(6000) })
  } catch {
    throw new ApiError("Can't reach the Python backend. Start it with: .venv\\Scripts\\python -m nextword.lab", "offline", 0)
  }
  if (!res.ok) throw new ApiError(`The backend answered ${res.status}`, "bad_response", res.status)
  return res.json()
}

/**
 * Ask for one answer. Calls onEvent for each streamed line. Resolves when the stream ends; rejects
 * with an ApiError for a request the backend refused, and with an AbortError when cancelled.
 */
export async function streamAssist(
  body: AssistRequest & { action: AssistAction; question?: string; conversation?: string },
  onEvent: (e: AssistEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch("/api/assist/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal })
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err
    throw new ApiError("Can't reach the Python backend. Start it with: .venv\\Scripts\\python -m nextword.lab", "offline", 0)
  }
  if (!res.ok || !res.body) {
    let e: { code?: string; message?: string } | undefined
    try { e = ((await res.json()) as { error?: { code: string; message: string } }).error } catch { /* not JSON */ }
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? "error", res.status)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) onEvent(JSON.parse(line) as AssistEvent)
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as AssistEvent)
}

/** What the person sees for an error code: what happened and what to do next. */
export function assistErrorText(code: string, message: string): string {
  switch (code) {
    case "ai_unavailable": return "The local model isn't running. Start Colibri (local-ai\\start-colibri.cmd), then try again. The written explanation above doesn't need it."
    case "ai_busy": return "The local model is still answering another request. Wait for it to finish, or stop it, then try again."
    case "ai_timeout": return `The local model took too long, so the answer was stopped. ${message}`
    case "ai_model_missing": return `Colibri is running a different model. ${message}`
    case "snapshot_changed": return "The training text changed since this run. Run the journey again, then ask."
    case "conversation_missing": return "This conversation ended (the Lab was restarted). Start a new one about this step."
    case "conversation_mismatch": return "This conversation is about an earlier run or step. Start a new one about this step."
    case "tutor_locked": return "The tutor is off during a check. Use the check's own hints."
    case "tutor_after_prediction": return "The tutor opens after you've made your prediction."
    case "conversation_full": return "This conversation has as many answers as the model can keep in mind. Start a new one about this step."
    case "offline": return message
    default: return message
  }
}
