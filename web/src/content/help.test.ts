import { describe, expect, it } from "vitest"
import { helpFor } from "@/components/lab/help"
import { CONCEPTS, CONTROLS, CONTROL_BY_ID, TOURS, WORKSPACE_HELP } from "./help"
import { findTerm } from "./glossary"
import { WORKSPACES } from "./journey"

// The inventory is only honest if it matches the pages: every help id on a page has an entry, every
// entry is used on a page, and every tour step and question points at something real.
const sources = {
  ...import.meta.glob("../workspaces/*.tsx", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../components/lab/*.tsx", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>
const ui = Object.entries(sources).filter(([p]) => !p.includes(".test."))
const used = new Set<string>()
for (const [, text] of ui) {
  for (const m of text.matchAll(/(?:data-help-id|helpId)="([\w.-]+)"/g)) used.add(m[1])
}
const teachIds = new Set(ui.flatMap(([, text]) => [...text.matchAll(/(?:Panel|TeachSpot)\s+id="([\w-]+)"[^>]*/g)].map((m) => m[1])))

describe("the help inventory matches the app", () => {
  it("every help id used on a page has help", () => {
    const missing = [...used].filter((id) => !helpFor(id))
    expect(missing).toEqual([])
  })

  it("every control in the inventory is used somewhere (no placeholder entries)", () => {
    const unused = CONTROLS.map((c) => c.id).filter((id) => !used.has(id) && id !== "shell.nav.toolkit")
    expect(unused).toEqual([])
    // The Toolkit Guide's sidebar entry is given its id by the shell's nav list.
    expect(sources["../components/lab/shell.tsx"]).toContain('"shell.nav.toolkit"')
  })

  it("ids are unique, and every entry is complete and specific", () => {
    expect(new Set(CONTROLS.map((c) => c.id)).size).toBe(CONTROLS.length)
    for (const c of CONTROLS) {
      expect(c.does.length, c.id).toBeGreaterThan(20)
      expect(c.when.length, c.id).toBeGreaterThan(5)
      expect(c.where.length, c.id).toBeGreaterThan(3)
      if (c.term) expect(findTerm(c.term), `${c.id} → ${c.term}`).toBeTruthy()
    }
  })

  it("every sidebar link has help, built from its workspace's own description", () => {
    for (const w of WORKSPACES) {
      const h = helpFor(w.route === "toolkit" ? "shell.nav.toolkit" : `nav.${w.route}`)
      expect(h, w.route).toBeTruthy()
      expect(h!.effect).toBe("navigates")
    }
  })

  it("the directory covers every page, and its next steps are real pages", () => {
    const routes = new Set(WORKSPACES.map((w) => w.route))
    expect(WORKSPACE_HELP.map((h) => h.route).sort()).toEqual([...routes].sort())
    for (const h of WORKSPACE_HELP) for (const r of h.next) expect(routes.has(r), `${h.route} → ${r}`).toBe(true)
  })

  it("questions link to real controls and terms", () => {
    for (const c of CONCEPTS) {
      for (const id of c.controls) expect(CONTROL_BY_ID.has(id), `${c.id} → ${id}`).toBe(true)
      for (const t of c.terms) expect(findTerm(t), `${c.id} → ${t}`).toBeTruthy()
    }
  })

  it("every tour step targets something a page renders, on a real route", () => {
    const routes = new Set(WORKSPACES.map((w) => w.route))
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        expect(routes.has(step.route), `${tour.id}/${step.id}`).toBe(true)
        expect(used.has(step.target) || teachIds.has(step.target), `${tour.id}/${step.id} → ${step.target}`).toBe(true)
        if (step.action?.help) expect(CONTROL_BY_ID.has(step.action.help)).toBe(true)
      }
    }
  })
})

describe("the help says only what the controls do", () => {
  const byId = (id: string) => CONTROL_BY_ID.get(id)!
  it("replay and stepping are described as showing stored results, not new draws", () => {
    expect(byId("journey.replay").effect).toBe("view")
    expect(byId("journey.replay").learn!.misconception).toMatch(/does not rerun the engine and draws no new random numbers/)
    expect(byId("journey.next-step").effect).toBe("view")
    expect(byId("journey.next-step").learn!.misconception).toMatch(/does not ask the engine/)
  })

  it("simulations are never described as your engine, and the engine is named where it runs", () => {
    for (const id of ["neural.apply", "neural.train", "attention.mask", "decoding.temperature", "counts.draws-1000", "counts.smoothing"]) expect(byId(id).effect, id).toBe("simulation")
    for (const id of ["playground.suggest", "journey.run", "evaluation.measure", "counts.draw", "adapt.continue", "serving.send"]) expect(byId(id).effect, id).toBe("engine")
    expect(byId("neural.apply").learn!.misconception).toMatch(/not your bigram engine/)
  })

  it("the seed is not said to pick the most likely character or to always change the text", () => {
    expect(byId("playground.seed").learn!.misconception).toMatch(/does not choose the most likely character, and different seeds do not always give different text/)
    expect(CONCEPTS.find((c) => c.id === "different-text")!.answer).toMatch(/usually, but not always/)
  })

  it("probability is not described as factual confidence, and tours are not counted as understanding", () => {
    expect(CONCEPTS.find((c) => c.id === "confidence")!.answer).toMatch(/not whether it is true/)
    expect(byId("evidence.levels").learn!.misconception).toMatch(/Finishing a walkthrough or tour is not recorded/)
  })
})
