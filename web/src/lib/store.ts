import { recordOutcome, type CheckpointRecord, type Outcome } from "./checkpoints"
// Personal Lab state kept in this browser's localStorage: preferences, evidence levels, notes,
// bookmarks and experiment history. Model data never lives here; it stays with the Python backend.

import { useSyncExternalStore } from "react"

export const STORAGE_KEY = "nextword-lab:v1"

export type EvidenceLevel = "explored" | "practiced" | "implemented" | "tested" | "explained"

export const EVIDENCE_LEVELS: { id: EvidenceLevel; label: string; hint: string }[] = [
  { id: "explored", label: "Explored", hint: "You ran an experiment about this." },
  { id: "practiced", label: "Practiced with assistance", hint: "You worked through it with hints or help." },
  { id: "implemented", label: "Implemented", hint: "You wrote or changed the code for it yourself." },
  { id: "tested", label: "Tested", hint: "You checked its behaviour with a test or experiment of your own." },
  { id: "explained", label: "Explained independently", hint: "You wrote your own explanation, without help." },
]

export interface Evidence {
  explored?: string
  practiced?: string
  implemented?: string
  tested?: string
  explained?: string
  explanation?: string
}

export type NoteKind = "note" | "question" | "prediction" | "explanation"

export interface Note {
  id: string
  kind: NoteKind
  text: string
  conceptId?: string
  route?: string
  createdAt: string
  resolved?: boolean
}

export interface RunRecord {
  id: string
  route: string
  title: string
  summary: string
  source: "model" | "simulation" | "example"
  at: string
}

export interface SavedExperiment {
  id: string
  name: string
  createdAt: string
  config: { corpus: string; train: number; val: number; on: "val" | "test"; k: number }
  result: { targets: number; meanNll: number | null; meanNllCovered: number | null; perplexity: number | null; unseenContext: number; unseenPair: number; covered: number; modelVersion: string; corpusFingerprint: string }
  notes: string
}

export interface LabState {
  version: 1
  prefs: { sidebarCollapsed: boolean; explainOpen: boolean; explainSize: number; guideOpen: boolean; flowOpen: boolean; helpMode: boolean; tour: { id: string; index: number } | null; tourPositions: Record<string, number>; checkpointPractice: boolean }
  lastRoute: string
  evidence: Record<string, Evidence>
  notes: Note[]
  bookmarks: string[]
  runs: RunRecord[]
  experiments: SavedExperiment[]
  guide: Record<string, boolean>
  /** Learning checkpoints: kept apart from the evidence levels, which you record yourself. */
  checkpoints: Record<string, CheckpointRecord>
}

function initialState(): LabState {
  return {
    version: 1,
    prefs: { sidebarCollapsed: false, explainOpen: true, explainSize: 34, guideOpen: true, flowOpen: false, helpMode: false, tour: null, tourPositions: {}, checkpointPractice: false },
    lastRoute: "playground",
    // Carried over from GLOSSARY.md (2026-10-25): explained with help, recheck independently later.
    evidence: {
      bigram: { practiced: "2026-10-25" },
      sampling: { practiced: "2026-10-25" },
    },
    notes: [],
    bookmarks: [],
    runs: [],
    experiments: [],
    guide: {},
    checkpoints: {},
  }
}

let storageOk = true
let state: LabState = load()
const listeners = new Set<() => void>()

function load(): LabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    return migrate(JSON.parse(raw))
  } catch {
    storageOk = false
    return initialState()
  }
}

function migrate(data: unknown): LabState {
  const base = initialState()
  if (!data || typeof data !== "object" || (data as LabState).version !== 1) throw new Error("this file is not a NextWord Lab export (version 1)")
  const d = data as Partial<LabState>
  return {
    ...base,
    ...d,
    prefs: { ...base.prefs, ...(d.prefs ?? {}) },
    evidence: { ...(d.evidence ?? base.evidence) },
    notes: Array.isArray(d.notes) ? d.notes : [],
    bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
    runs: Array.isArray(d.runs) ? d.runs : [],
    experiments: Array.isArray(d.experiments) ? d.experiments : [],
    guide: { ...(d.guide ?? {}) },
    checkpoints: d.checkpoints && typeof d.checkpoints === "object" ? { ...d.checkpoints } : {},
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      storageOk = true
    } catch {
      storageOk = false
    }
    listeners.forEach((l) => l())
  }, 150)
}

export function update(fn: (s: LabState) => LabState) {
  state = fn(state)
  persist()
  listeners.forEach((l) => l())
}

export function getState() {
  return state
}

export function useLab<T>(select: (s: LabState) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => select(state),
  )
}

export function storageAvailable() {
  return storageOk
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ----------------------------------------------------------------------------- actions

export const actions = {
  setPref<K extends keyof LabState["prefs"]>(key: K, value: LabState["prefs"][K]) {
    update((s) => ({ ...s, prefs: { ...s.prefs, [key]: value } }))
  },
  visit(route: string) {
    if (state.lastRoute !== route) update((s) => ({ ...s, lastRoute: route }))
  },
  setEvidence(conceptId: string, level: EvidenceLevel, on: boolean) {
    update((s) => {
      const current = { ...(s.evidence[conceptId] ?? {}) }
      if (on) current[level] = today()
      else delete current[level]
      return { ...s, evidence: { ...s.evidence, [conceptId]: current } }
    })
  },
  recordExplanation(conceptId: string, text: string) {
    update((s) => ({
      ...s,
      evidence: { ...s.evidence, [conceptId]: { ...(s.evidence[conceptId] ?? {}), explained: today(), explanation: text } },
      notes: [{ id: uid(), kind: "explanation", text, conceptId, createdAt: new Date().toISOString() }, ...s.notes],
    }))
  },
  /** An experiment really ran: log it and mark its concepts as explored. */
  logRun(run: Omit<RunRecord, "id" | "at">, conceptIds: string[] = []) {
    update((s) => {
      const evidence = { ...s.evidence }
      for (const c of conceptIds) if (!evidence[c]?.explored) evidence[c] = { ...(evidence[c] ?? {}), explored: today() }
      return { ...s, evidence, runs: [{ ...run, id: uid(), at: new Date().toISOString() }, ...s.runs].slice(0, 60) }
    })
  },
  addNote(note: Omit<Note, "id" | "createdAt">) {
    update((s) => ({ ...s, notes: [{ ...note, id: uid(), createdAt: new Date().toISOString() }, ...s.notes] }))
  },
  updateNote(id: string, patch: Partial<Note>) {
    update((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  },
  deleteNote(id: string) {
    update((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }))
  },
  toggleBookmark(id: string) {
    update((s) => ({ ...s, bookmarks: s.bookmarks.includes(id) ? s.bookmarks.filter((b) => b !== id) : [...s.bookmarks, id] }))
  },
  saveExperiment(exp: Omit<SavedExperiment, "id" | "createdAt">) {
    const id = uid()
    update((s) => ({ ...s, experiments: [{ ...exp, id, createdAt: new Date().toISOString() }, ...s.experiments] }))
    return id
  },
  updateExperiment(id: string, patch: Partial<SavedExperiment>) {
    update((s) => ({ ...s, experiments: s.experiments.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  },
  deleteExperiment(id: string) {
    update((s) => ({ ...s, experiments: s.experiments.filter((e) => e.id !== id) }))
  },
  /** Record a checkpoint event: a visit, a skip, a wrong answer, a pass, a viewed solution. */
  recordCheckpoint(id: string, version: number, question: string, outcome: Outcome | "visited") {
    update((s) => ({ ...s, checkpoints: { ...s.checkpoints, [id]: recordOutcome(s.checkpoints[id], version, question, outcome, new Date().toISOString()) } }))
  },
  resetCheckpoints() {
    update((s) => ({ ...s, checkpoints: {} }))
  },
  setGuideStep(id: string, done: boolean) {
    update((s) => ({ ...s, guide: { ...s.guide, [id]: done } }))
  },
  exportJson(): string {
    return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)
  },
  importJson(text: string) {
    const next = migrate(JSON.parse(text))
    update(() => next)
  },
  reset() {
    update(() => initialState())
  },
}

export function download(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
