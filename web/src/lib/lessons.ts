// Beginner lessons: the authored text (content/lessons.json, works offline), the real results from the
// backend (nextword/lab/lessons.py), and the pure rules for progress and status, kept here so they can be tested.
import content from "@/content/lessons.json"
import { ApiError } from "./api"
import { statusOf, type CheckpointRecord } from "./checkpoints"

export type StepId = "question" | "predict" | "result" | "why" | "term" | "check"

export interface LessonText {
  id: string
  part: "counting" | "learning"
  title: string
  question: string
  setup: string
  lookAt: string
  matters: string
  why: string
  simpler: string
  term: { name: string; glossary: string; definition: string }
  detail: string
  deeper: { route: string; label: string }
}

export const LESSONS = content.lessons as LessonText[]
export const PARTS = content.parts as { id: LessonText["part"]; title: string; about: string }[]
export const STEPS = content.steps as { id: StepId; label: string }[]
export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]))
export const checkpointId = (lessonId: string) => `learn.${lessonId}`

/** What the backend computed for one example of one lesson. Fields beyond these depend on the lesson. */
export interface LessonResult {
  lesson: string
  example: number
  examples: number
  engine: "bigram" | "mlp"
  prediction: { prompt: string; kind: "choice"; options: string[]; answer: string; show?: { token: string; score: number }[] }
  facts: string[]
  [key: string]: unknown
}

const cache = new Map<string, Promise<LessonResult>>()

export async function lessonResult(lesson: string, example: number): Promise<LessonResult> {
  const key = `${lesson}#${example}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = (async () => {
    let res: Response
    try {
      res = await fetch("/api/lessons/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lesson, example }) })
    } catch {
      throw new ApiError("Can't reach the Python backend. Start it with: .venv\\Scripts\\python -m nextword.lab. The lesson text still works.", "offline", 0)
    }
    if (!res.ok) {
      let e: { code?: string; message?: string } | undefined
      try { e = ((await res.json()) as { error?: { code: string; message: string } }).error } catch { /* not JSON */ }
      throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? "error", res.status)
    }
    return res.json() as Promise<LessonResult>
  })()
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  return p
}

// ----------------------------------------------------------------------------- progress

export interface LessonRecord {
  started?: string
  /** Furthest step reached, as an index into STEPS. */
  reached: number
  skipped?: string
  /** Help used before the check (simpler wording, the tutor). Recorded, but it doesn't change the check's status. */
  helpUsed?: string[]
  /** Your prediction for each example, by example number. A guess, never graded. */
  predictions?: Record<number, string>
}

export interface Place { lesson: string; step: number; example: number }

export type LessonStatus =
  | "Not started"
  | "In progress"
  | "Skipped"
  | "Check skipped"
  | "Completed with help"
  | "Reviewed with the solution"
  | "Completed on your own"

/**
 * A lesson's status, from its own record and its check's record. Only the check decides "completed":
 * on your own (no hints), with help (hints), or reviewed with the solution (not passed since).
 */
export function lessonStatus(rec: LessonRecord | undefined, check: CheckpointRecord | undefined, version = 1): LessonStatus {
  const s = statusOf(check, version)
  if (s === "Passed") return "Completed on your own"
  if (s === "Passed with hints") return "Completed with help"
  if (s === "Reviewed with solution") return "Reviewed with the solution"
  if (s === "Checkpoint skipped") return "Check skipped"
  if (rec?.skipped) return "Skipped"
  if (rec?.started) return "In progress"
  return "Not started"
}

export const STATUS_TONE: Record<LessonStatus, "done" | "help" | "skip" | "open" | "none"> = {
  "Completed on your own": "done",
  "Completed with help": "help",
  "Reviewed with the solution": "help",
  "Check skipped": "skip",
  "Skipped": "skip",
  "In progress": "open",
  "Not started": "none",
}

/** Terms introduced before this lesson, plus this lesson's own once its "word for it" step is reached. */
export function termsSoFar(lessonId: string, step: number): LessonText["term"][] {
  const i = LESSONS.findIndex((l) => l.id === lessonId)
  const termStep = STEPS.findIndex((s) => s.id === "term")
  return LESSONS.slice(0, i + (step >= termStep ? 1 : 0)).map((l) => l.term)
}

/** Where to go from the overview: the saved place, else the first lesson not yet finished. */
export function resumePlace(place: Place | null, records: Record<string, LessonRecord>, checks: Record<string, CheckpointRecord>): Place {
  if (place && LESSON_BY_ID.has(place.lesson)) return place
  const next = LESSONS.find((l) => {
    const s = lessonStatus(records[l.id], checks[checkpointId(l.id)])
    return s === "Not started" || s === "In progress"
  })
  return { lesson: (next ?? LESSONS[0]).id, step: 0, example: 0 }
}
