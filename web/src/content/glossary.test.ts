import { describe, expect, it } from "vitest"
import { encodeBpe, learnBpe } from "@/sim/tokenize"
import { findTerm, GLOSSARY, GLOSSARY_BY_ID } from "./glossary"

const num = (s: string) => Number(s.replace(/[≈\s]/g, "").replace("−", "-"))
const rows = (id: string) => findTerm(id)!.worked!.rows

describe("terminology help content", () => {
  it("every prerequisite is a real entry, and no entry needs itself", () => {
    for (const g of GLOSSARY) for (const n of g.needs ?? []) {
      expect(GLOSSARY_BY_ID.has(n), `${g.id} needs ${n}`).toBe(true)
      expect(n).not.toBe(g.id)
    }
  })

  it("covers the terms the Lab shows", () => {
    for (const id of ["bpe", "token", "vocabulary", "context-window", "embedding", "logits", "softmax", "distribution", "nll", "cross-entropy", "nats", "ln", "exp", "perplexity", "gradient", "learning-rate", "batch", "epoch", "attention", "causal-mask", "qkv", "temperature", "top-k", "top-p", "training-vs-inference", "split", "leakage", "rag", "chunking", "lexical-search"]) {
      expect(GLOSSARY_BY_ID.has(id), id).toBe(true)
    }
    expect(findTerm("nll")!.abbr).toBe("NLL")
    expect(findTerm("bpe")!.abbr).toBe("BPE")
    expect(findTerm("exp")!.say).toBe("exponential")
  })

  it("NLL examples are −ln p", () => {
    for (const [p, nll] of rows("nll")) {
      if (p === "0") { expect(nll).toMatch(/∞/); continue }
      expect(-Math.log(num(p))).toBeCloseTo(num(nll), 3)
    }
  })

  it("ln and exp examples undo each other", () => {
    for (const [x, y] of rows("ln")) expect(Math.log(num(x))).toBeCloseTo(num(y), 2)
    for (const [x, y] of rows("exp")) expect(Math.exp(num(x))).toBeCloseTo(num(y), 2)
  })

  it("perplexity examples are exp(mean NLL)", () => {
    for (const [nll, ppl] of rows("perplexity")) {
      if (nll === "∞") { expect(ppl).toBe("∞"); continue }
      expect(Math.exp(num(nll))).toBeCloseTo(num(ppl), 1)
    }
  })

  it("the BPE example is what the Lab's own BPE does, learning and then applying", () => {
    const { steps } = learnBpe("low lower lowest", 40)
    expect(steps.map((s) => [s.merged, s.count, s.tokenCount])).toEqual([["lo", 3, 13], ["low", 3, 10], ["lowe", 2, 8]])
    expect(rows("bpe").map((r) => r[0])).toEqual(["none yet", "l + o → lo", "lo + w → low", "low + e → lowe"])
    expect(rows("bpe").slice(1).map((r) => parseInt(r[1]))).toEqual(steps.map((s) => s.tokenCount))
    expect(encodeBpe("slow", steps)).toEqual(["s", "low"])
    expect(findTerm("bpe")!.example).toContain("\"slow\" gives s + low")
  })
})
