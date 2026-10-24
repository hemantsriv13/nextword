import { describe, expect, it } from "vitest"
import { GLOSSARY, GLOSSARY_BY_ID } from "./glossary"
import { JOURNEY, WORKSPACE_BY_ROUTE } from "./journey"

describe("glossary and journey content", () => {
  it("has unique ids", () => {
    expect(GLOSSARY_BY_ID.size).toBe(GLOSSARY.length)
  })
  it("every related link points at a real entry", () => {
    for (const g of GLOSSARY) for (const r of g.related) expect(GLOSSARY_BY_ID.has(r), `${g.id} → ${r}`).toBe(true)
  })
  it("every experiment route is a real workspace", () => {
    for (const g of GLOSSARY) expect(WORKSPACE_BY_ROUTE.has(g.experiment.route), g.id).toBe(true)
  })
  it("every journey concept exists, and every entry appears in exactly one stage", () => {
    const seen = new Map<string, number>()
    for (const s of JOURNEY) for (const c of s.concepts) {
      expect(GLOSSARY_BY_ID.has(c), c).toBe(true)
      seen.set(c, (seen.get(c) ?? 0) + 1)
    }
    for (const g of GLOSSARY) expect(seen.get(g.id), g.id).toBe(1)
  })
  it("each entry's stage matches the journey stage that lists it", () => {
    for (const s of JOURNEY) for (const c of s.concepts) expect(GLOSSARY_BY_ID.get(c)!.stage, c).toBe(s.id)
  })
})
