import { describe, expect, it } from "vitest"
import { assemblePrompt, bm25, chunkDoc } from "./rag"
import { charTokens, encodeBpe, idTable, learnBpe, wordTokens } from "./tokenize"
import { makeWindows, splitWindows } from "./windows"

describe("tokenizers", () => {
  it("character tokens match the engine and keep spaces", () => {
    expect(charTokens("a b\n")).toEqual(["a", " ", "b", "\n"])
  })
  it("word splitter keeps every character", () => {
    const text = "It's raining, again!  Yes."
    expect(wordTokens(text).join("")).toBe(text)
  })
  it("ids round-trip", () => {
    const toks = charTokens("banana")
    const { toId, toToken } = idTable(toks)
    expect(toks.map((t) => toToken[toId.get(t)!])).toEqual(toks)
    expect(toToken).toEqual(["b", "a", "n"])
  })
  it("BPE merges shorten the sequence and keep the text", () => {
    const text = "low lower lowest low low"
    const { steps, tokens } = learnBpe(text, 5)
    expect(steps.length).toBeGreaterThan(0)
    expect(tokens.join("")).toBe(text)
    expect(tokens.length).toBeLessThan(text.length)
    expect(steps[0]).toMatchObject({ left: "l", right: "o" })
    expect(encodeBpe("slow", steps).join("")).toBe("slow")
  })
})

describe("windows and splits", () => {
  const text = "the rain fell on the plain and the rain stayed"
  it("makes one window per position", () => {
    expect(makeWindows("abcd", 2)).toEqual([{ start: 0, context: "ab", target: "c" }, { start: 1, context: "bc", target: "d" }])
  })
  it("split-first has no shared positions between train and val windows", () => {
    const r = splitWindows(text, 4, 0.25, "split-first")
    expect(r.leakedVal).toBe(0)
    expect(r.positions.some((p) => p.train && p.val)).toBe(false)
  })
  it("windows-first leaks overlapping text into validation", () => {
    const r = splitWindows(text, 4, 0.25, "windows-first", 3)
    expect(r.valCount).toBeGreaterThan(0)
    expect(r.leakedVal).toBeGreaterThan(0)
  })
})

describe("retrieval", () => {
  const doc = { id: "notes", title: "Notes", text: "one two three four five six seven eight nine ten" }
  it("chunks with overlap cover every word", () => {
    const chunks = chunkDoc(doc, 4, 1)
    expect(chunks.map((c) => c.text)).toEqual(["one two three four", "four five six seven", "seven eight nine ten"])
  })
  it("rejects overlap that is not smaller than the size", () => {
    expect(() => chunkDoc(doc, 3, 3)).toThrow()
  })
  it("BM25 ranks the chunk with the query words first", () => {
    const docs = [
      { id: "a", title: "Bread", text: "Bake bread at 220 degrees for thirty minutes." },
      { id: "b", title: "Tea", text: "Steep green tea for three minutes in water below boiling." },
    ]
    const ranked = bm25(docs.flatMap((d) => chunkDoc(d, 20, 0)), "how long to steep tea")
    expect(ranked[0].chunk.docId).toBe("b")
    expect(ranked[1].score).toBe(0)
  })
  it("prompt cites every passage id", () => {
    const ranked = bm25(chunkDoc(doc, 5, 0), "three")
    expect(assemblePrompt("q", ranked.slice(0, 1))).toContain("[notes#1]")
  })
})
