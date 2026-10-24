// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const memory = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
})

const { actions, getState } = await import("./store")

describe("lab persistence", () => {
  beforeEach(() => actions.reset())

  it("starts with the evidence carried over from the glossary", () => {
    expect(getState().evidence.bigram.practiced).toBe("2026-10-25")
  })
  it("export then import restores notes, bookmarks and evidence", () => {
    actions.addNote({ kind: "question", text: "Why does smoothing help?" })
    actions.toggleBookmark("softmax")
    actions.setEvidence("softmax", "tested", true)
    const exported = actions.exportJson()
    actions.reset()
    expect(getState().notes).toHaveLength(0)
    actions.importJson(exported)
    expect(getState().notes[0].text).toBe("Why does smoothing help?")
    expect(getState().bookmarks).toContain("softmax")
    expect(getState().evidence.softmax.tested).toBeTruthy()
  })
  it("rejects files that are not Lab exports", () => {
    expect(() => actions.importJson('{"hello": 1}')).toThrow()
    expect(() => actions.importJson("not json")).toThrow()
  })
  it("logging a run marks concepts explored but nothing more", () => {
    actions.logRun({ route: "decoding", title: "Draws", summary: "1000 draws", source: "simulation" }, ["temperature"])
    expect(getState().evidence.temperature).toEqual({ explored: expect.any(String) })
  })
  it("reset clears everything back to the start", () => {
    actions.addNote({ kind: "note", text: "x" })
    actions.reset()
    expect(getState().notes).toEqual([])
  })
})
