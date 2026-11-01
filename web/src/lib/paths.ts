// Progress through the learning paths, derived only from saved lesson records and their checks. Nothing is
// estimated: no percentages, no time left. A lesson's status keeps its meaning from lib/lessons.ts (on your
// own, with help, reviewed with the solution, check skipped, skipped, in progress, not started).
import { FOUNDATION, type FoundationStep } from "@/content/paths"
import type { CheckpointRecord } from "./checkpoints"
import { checkpointId, LESSON_BY_ID, LESSONS, lessonStatus, STEPS, type LessonRecord, type LessonStatus, type Place } from "./lessons"

export interface Saved { place: Place | null; records: Record<string, LessonRecord>; checks: Record<string, CheckpointRecord> }

const DONE: LessonStatus[] = ["Completed on your own", "Completed with help"]
const RECHECK: LessonStatus[] = ["Reviewed with the solution", "Check skipped"]

export const statusOf = (id: string, s: Saved) => lessonStatus(s.records[id], s.checks[checkpointId(id)])

/** Each lesson's status, counted by kind: real counts, never a percentage. */
export function tally(s: Saved): Record<LessonStatus, number> {
  const out = { "Completed on your own": 0, "Completed with help": 0, "Reviewed with the solution": 0, "Check skipped": 0, "Skipped": 0, "In progress": 0, "Not started": 0 } as Record<LessonStatus, number>
  for (const l of LESSONS) out[statusOf(l.id, s)]++
  return out
}

export const isNewLearner = (s: Saved) => Object.keys(s.records).length === 0 && !Object.keys(s.checks).some((k) => k.startsWith("learn."))

/** A lesson's link. The lesson page opens it where you left it if it is in progress, else at its start. */
export const lessonHref = (id: string) => `#/learn?lesson=${encodeURIComponent(id)}`

export type StepState = "not started" | "in progress" | "done" | "needs a recheck" | "skipped" | "no lesson yet"

/** A foundation step's state from its lessons. "done" only when every lesson's check was passed. */
export function stepState(step: FoundationStep, s: Saved): StepState {
  if (!step.lessons.length) return "no lesson yet"
  const st = step.lessons.map((id) => statusOf(id, s))
  if (st.every((x) => DONE.includes(x))) return "done"
  if (st.some((x) => RECHECK.includes(x)) && st.every((x) => DONE.includes(x) || RECHECK.includes(x))) return "needs a recheck"
  if (st.every((x) => x === "Skipped")) return "skipped"
  if (st.every((x) => x === "Not started")) return "not started"
  return "in progress"
}

/** The lesson a step's action should open: its first lesson not yet passed. */
export function stepLesson(step: FoundationStep, s: Saved): string | null {
  if (!step.lessons.length) return null
  return step.lessons.find((id) => !DONE.includes(statusOf(id, s))) ?? step.lessons[0]
}

/** Earlier steps this one builds on that you haven't completed: guidance, never a lock. */
export function missingBefore(step: FoundationStep, s: Saved): FoundationStep[] {
  const before = new Set<string>()
  const walk = (id: string) => { for (const b of FOUNDATION.find((x) => x.id === id)?.builds ?? []) { if (!before.has(b)) { before.add(b); walk(b) } } }
  walk(step.id)
  return FOUNDATION.filter((x) => before.has(x.id) && x.lessons.length > 0 && !["done", "needs a recheck"].includes(stepState(x, s)))
}

export interface Recommendation {
  kind: "start" | "continue" | "next" | "recheck" | "beyond"
  title: string
  why: string
  href: string
  lesson?: string
}

/**
 * The next step, from saved progress only:
 * 1. Nothing saved: start lesson 1.
 * 2. A saved place in a lesson that is still in progress: continue it, at its step.
 * 3. Otherwise the first lesson, in order, not started or in progress (skipped lessons are your choice, so not pushed).
 * 4. Every lesson passed, skipped or rechecked: recheck one whose solution you viewed or whose check you skipped.
 * 5. Everything passed: generation and model comparison, in the MLP journey.
 */
export function recommend(s: Saved): Recommendation {
  if (isNewLearner(s)) {
    return { kind: "start", lesson: LESSONS[0].id, title: `Start with the basics: ${LESSONS[0].title}`, why: "You haven't started a lesson yet. Lesson 1 begins with a seven-character text.", href: lessonHref(LESSONS[0].id) }
  }
  const p = s.place
  if (p && LESSON_BY_ID.has(p.lesson) && statusOf(p.lesson, s) === "In progress") {
    const l = LESSON_BY_ID.get(p.lesson)!
    return { kind: "continue", lesson: l.id, title: `Continue: ${l.title}`, why: `You stopped at “${STEPS[Math.min(p.step, STEPS.length - 1)].label}” in lesson ${LESSONS.indexOf(l) + 1}.`, href: lessonHref(l.id) }
  }
  const next = LESSONS.find((l) => ["Not started", "In progress"].includes(statusOf(l.id, s)))
  if (next) {
    const n = LESSONS.indexOf(next) + 1
    return { kind: "next", lesson: next.id, title: `Next: lesson ${n}, ${next.title}`, why: statusOf(next.id, s) === "In progress" ? `You started lesson ${n} and haven't finished its check.` : `Lesson ${n} is the first one you haven't started.`, href: lessonHref(next.id) }
  }
  const recheck = LESSONS.find((l) => RECHECK.includes(statusOf(l.id, s)))
  if (recheck) {
    const st = statusOf(recheck.id, s)
    return { kind: "recheck", lesson: recheck.id, title: `Recheck: ${recheck.title}`, why: st === "Check skipped" ? "You finished this lesson but skipped its check." : "You viewed this check's solution and haven't passed a new question since.", href: lessonHref(recheck.id) }
  }
  return { kind: "beyond", title: "Compare the MLP with the bigram", why: "Every lesson's check is passed or skipped by choice. Generation and model comparison has no lesson yet: try it in the MLP journey.", href: "#/mlp" }
}

/** An optional session built from one maintained lesson: a concept, an experiment, a check, a recap and what's next. */
export interface SessionPlan { lesson: string; concept: string; experiment: string; experimentHref: string; check: string; checkStatus: LessonStatus; recap: string; next: { title: string; href: string } | null }

export function sessionPlan(s: Saved): SessionPlan | null {
  const r = recommend(s)
  const l = r.lesson ? LESSON_BY_ID.get(r.lesson) : undefined
  if (!l) return null
  const i = LESSONS.indexOf(l)
  const n = LESSONS[i + 1]
  return {
    lesson: l.id,
    concept: `${l.question} The idea gets its name at the end: ${l.term.name}.`,
    experiment: `Predict, then see the real result in lesson ${i + 1}; afterwards try it at full size: ${l.deeper.label.toLowerCase()}.`,
    experimentHref: `#/${l.deeper.route}`,
    check: "The lesson's check: one question with a different example, graded by the app. Hints only if you ask.",
    checkStatus: statusOf(l.id, s),
    recap: l.why,
    next: n ? { title: `Lesson ${i + 2}: ${n.title}`, href: lessonHref(n.id) } : { title: "Generation and model comparison, in the MLP journey", href: "#/mlp" },
  }
}
