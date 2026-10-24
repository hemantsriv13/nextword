import { describe, expect, it } from "vitest"
import { extractSymbol } from "./code"

const py = `import random


def tokenize(text):
    """Doc."""
    return list(text)


def count(tokens):
    counts = {}

    for a in tokens:
        counts[a] = 1
    return counts
`

const ts = `// header

export function softmax(z: number[]) {
  const m = Math.max(...z)
  return z.map((v) => v - m)
}

export function other() {}
`

describe("extractSymbol", () => {
  it("finds a Python function including blank lines inside it", () => {
    const r = extractSymbol(py, "count")!
    expect(r.start).toBe(9)
    expect(r.lines.at(-1)).toBe("    return counts")
    expect(r.lines).toContain("")
  })
  it("finds a TypeScript function with its closing brace", () => {
    const r = extractSymbol(ts, "softmax")!
    expect(r.lines[0]).toBe("export function softmax(z: number[]) {")
    expect(r.lines.at(-1)).toBe("}")
  })
  it("accepts Class.method names by their last part", () => {
    expect(extractSymbol(py, "Store.tokenize")!.lines[0]).toBe("def tokenize(text):")
  })
  it("returns null when missing", () => {
    expect(extractSymbol(py, "nope")).toBeNull()
  })
})
