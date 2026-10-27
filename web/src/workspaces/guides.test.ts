import { describe, expect, it } from "vitest"

// Every workspace's flow boxes and walkthrough steps point at panels by id. A typo would leave a
// step with nothing to explain, so check every target against the ids in the same file.
const sources = import.meta.glob("./*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>
const withGuides = Object.entries(sources).filter(([path, text]) => !path.includes(".test.") && text.includes("const GUIDE: Guide"))

describe("workspace guides", () => {
  it("every workspace with a guide renders it", () => {
    expect(withGuides.map(([p]) => p).sort()).toEqual([
      "./Adapt.tsx", "./Attention.tsx", "./Counts.tsx", "./DataStudio.tsx", "./Decoding.tsx", "./Evaluation.tsx",
      "./Neural.tsx", "./Playground.tsx", "./Serving.tsx",
    ])
    for (const [, text] of withGuides) expect(text).toContain("<WorkspaceGuide />")
  })

  it.each(withGuides)("%s: every target is a panel or spot on the page", (_, text) => {
    const targets = [...text.matchAll(/target: "([\w-]+)"/g)].map((m) => m[1])
    expect(targets.length).toBeGreaterThan(0)
    const ids = new Set([...text.matchAll(/(?:Panel|TeachSpot)\s+id="([\w-]+)"/g)].map((m) => m[1]))
    // Neural builds its flow boxes with a helper: node(id, label, kind, target, ...).
    const nodeTargets = [...text.matchAll(/node\("[\w-]+", "[^"]+", "\w+", "([\w-]+)"/g)].map((m) => m[1])
    for (const t of [...targets, ...nodeTargets]) expect(ids, `target ${t}`).toContain(t)
  })
})
