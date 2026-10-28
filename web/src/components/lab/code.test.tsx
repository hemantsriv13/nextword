// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import { SimCode } from "./code"
import { ExplanationPanel } from "./explanation"

const SOURCE = ["export function long() {", ...Array.from({ length: 60 }, (_, i) => `  const v${i} = ${i}`), "}"].join("\n")

// jsdom has no layout: say the short view overflows, as 62 lines would in a real browser.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(384)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const block = () => screen.getByTestId("code-block")
const panel = () => block().closest("section")!

describe("expanding code in the explanation panel", () => {
  it("shows every line without the short view's limit, and widens the panel itself", async () => {
    render(<main><ExplanationPanel title="Example"><SimCode path="web/src/sim/x.ts" symbol="long" text={SOURCE} /></ExplanationPanel></main>)
    expect(block().querySelector("pre")!.className).toContain("max-h-96")
    const expand = screen.getByRole("button", { name: "Expand code" })
    expect(expand.getAttribute("aria-expanded")).toBe("false")
    await act(async () => { fireEvent.click(expand) })
    expect(block().querySelector("pre")!.className).not.toContain("max-h-96")
    expect(panel().getAttribute("data-expanded")).toBe("true")
    expect(panel().getAttribute("data-sticky")).toBeNull() // a tall expanded panel scrolls with the page
    expect(screen.getByText(/Showing all 62 lines/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Collapse code" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("Collapse code and Escape both return to the short view", async () => {
    render(<main><ExplanationPanel title="Example"><SimCode path="web/src/sim/x.ts" symbol="long" text={SOURCE} /></ExplanationPanel></main>)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Expand code" })) })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Collapse code" })) })
    expect(panel().getAttribute("data-expanded")).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Expand code" })) })
    await act(async () => { fireEvent.keyDown(document.body, { key: "Escape" }) })
    expect(panel().getAttribute("data-expanded")).toBeNull()
    expect(block().querySelector("pre")!.className).toContain("max-h-96")
  })

  it("code that already fits offers no Expand button", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200)
    render(<main><ExplanationPanel title="Example"><SimCode path="web/src/sim/x.ts" symbol="long" text={SOURCE} /></ExplanationPanel></main>)
    expect(screen.queryByRole("button", { name: "Expand code" })).toBeNull()
  })
})
