import { describe, expect, it } from "vitest"
import { charCount, firstChars } from "@/sim/tokenize"
import { fakeGeneration } from "@/test/fixtures"
import { lastChars, traceView, withoutLastChar } from "./trace"

const roles = (v: ReturnType<typeof traceView>) =>
  v.segments.flatMap((s) => [s.stepContext && `ctx:${s.text}`, s.stepChoice && `chose:${s.text}`, s.nextContext && `next:${s.text}`]).filter(Boolean)

describe("traceView: which character each highlight means", () => {
  it("before any generation, the next prediction reads the prompt's last character", () => {
    const v = traceView("The rain", undefined, 0, null, false)
    expect(roles(v)).toEqual(["next:n"])
    expect(v.selected).toBeNull()
    expect(v.segments.map((s) => s.text).join("")).toBe("The rain")
  })

  it("after generating, the next prediction reads the last generated character, not the prompt's", () => {
    const g = fakeGeneration("ab", ["c", "d", "e"])
    const v = traceView("ab", g, 3, null, false)
    // Default selection is the latest step: it read "d" and chose "e"; the next step will read "e".
    expect(roles(v)).toEqual(["ctx:d", "chose:e", "next:e"])
    expect(v.nextContext).toBe("e")
    expect(v.revealedText).toBe("cde")
  })

  it("selecting an earlier step highlights that step's own context and choice", () => {
    const g = fakeGeneration("ab", ["c", "d", "e"])
    const first = traceView("ab", g, 3, 0, false)
    expect(roles(first)).toEqual(["ctx:b", "chose:c", "next:e"])
    const middle = traceView("ab", g, 3, 1, false)
    expect(roles(middle)).toEqual(["ctx:c", "chose:d", "next:e"])
    // Every highlighted step context matches the context the trace recorded.
    for (let i = 0; i < 3; i++) {
      const v = traceView("ab", g, 3, i, false)
      expect(v.segments.find((s) => s.stepContext)!.text).toBe(g.steps[i].context)
    }
  })

  it("while stepping, only the revealed part of the trace is laid out", () => {
    const g = fakeGeneration("ab", ["c", "d", "e"])
    const v = traceView("ab", g, 1, 0, false)
    expect(v.revealedText).toBe("c")
    expect(roles(v)).toEqual(["ctx:b", "chose:c", "next:c"])
  })

  it("a selection past the revealed steps falls back to the latest revealed step", () => {
    const g = fakeGeneration("ab", ["c", "d", "e"])
    expect(traceView("ab", g, 2, 2, false).selected).toBe(1)
  })

  it("a stale trace is ignored: no generated text, no step highlight, context from the current prompt", () => {
    const g = fakeGeneration("ab", ["c", "d", "e"])
    const v = traceView("abx", g, 3, 1, true)
    expect(v.revealedText).toBe("")
    expect(v.selected).toBeNull()
    expect(roles(v)).toEqual(["next:x"])
  })
})

describe("characters are code points, as in the engine (Python list(text))", () => {
  it("an emoji at the end of the prompt is highlighted whole", () => {
    const v = traceView("rain 🌧", undefined, 0, null, false)
    expect(roles(v)).toEqual(["next:🌧"])
    expect(v.segments.map((s) => s.text).join("")).toBe("rain 🌧")
  })

  it("generated emoji come from the trace tokens, never half a surrogate pair", () => {
    const g = fakeGeneration("a🌧", ["🌈", "b", "😀"])
    const v = traceView("a🌧", g, 2, 0, false)
    expect(v.revealedText).toBe("🌈b")
    expect(roles(v)).toEqual(["ctx:🌧", "chose:🌈", "next:b"])
    for (const s of v.segments) expect(s.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it("a combining mark is its own character, like the engine sees it", () => {
    const v = traceView("café", undefined, 0, null, false)
    expect(roles(v)).toEqual(["next:́"])
  })

  it("helpers count and cut by code point", () => {
    expect(charCount("a🌧b")).toBe(3)
    expect("a🌧b".length).toBe(4)
    expect(charCount("é")).toBe(2)
    expect(firstChars("🌧🌈😀", 2)).toBe("🌧🌈")
    expect(lastChars("x🌧🌈", 1)).toBe("🌈")
    expect(withoutLastChar("ab🌧")).toBe("ab")
  })
})
