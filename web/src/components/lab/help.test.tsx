// @vitest-environment jsdom
import { useState } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"

const calls = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  // Any request at all would show up here: help must never make one.
  const spy = new Proxy(real.api, { get: (t, k) => (...a: unknown[]) => { calls(k, a); return (t as Record<string, (...x: unknown[]) => unknown>)[k as string]?.(...a) } })
  return { ...real, api: spy }
})

const { HelpModeSwitch, HelpProvider, place, useHelp, useHelpReveal } = await import("./help")
const { GlossaryProvider } = await import("./glossary")
const { actions } = await import("@/lib/store")

// jsdom has no layout: give every element a box so markers and placement have something to measure.
const box = { x: 100, y: 100, top: 100, left: 100, bottom: 130, right: 220, width: 120, height: 30, toJSON: () => ({}) }
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(box as DOMRect)
  actions.reset()
  calls.mockReset()
  window.location.hash = "#/playground"
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function pointer(type: "pointerover" | "pointerout", el: Element, related: Element | null = null) {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget: related })
  Object.defineProperty(e, "pointerType", { value: "mouse" })
  el.dispatchEvent(e)
}

function Page() {
  const [tab, setTab] = useState("one")
  useHelpReveal((r) => { if (r.tab) setTab(r.tab) })
  const help = useHelp()!
  return (
    <main>
      <HelpModeSwitch />
      <button type="button" data-help-id="playground.seed">Seed field</button>
      <button type="button" data-help-id="playground.length">Length field</button>
      <button type="button" data-help-id="playground.accept" disabled>Accept</button>
      <span data-help-id="layout.source">Your model</span>
      <p>tab {tab}</p>
      {tab === "tokens" && <input aria-label="Merges" data-help-id="data.merges" />}
      <button type="button" onClick={() => help.goTo("data.merges")}>Go to merges</button>
      <button type="button" onClick={() => help.goTo("evaluation.on")}>Go to evaluation</button>
    </main>
  )
}

const renderPage = () => render(<GlossaryProvider><HelpProvider><Page /></HelpProvider></GlossaryProvider>)
const hint = () => screen.queryByTestId("help-hint")
const popover = () => screen.queryByTestId("help-popover")

describe("quick hints", () => {
  it("appear after a deliberate hover, not at once, and hold no controls", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    renderPage()
    pointer("pointerover", screen.getByText("Seed field"))
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(hint()).toBeNull()
    await act(async () => { vi.advanceTimersByTime(250) })
    const h = hint()!
    expect(h.getAttribute("role")).toBe("tooltip")
    expect(h.textContent).toContain("Seed")
    expect(h.textContent).toContain("Changes a setting; nothing runs until you run it")
    expect(within(h).queryAllByRole("button")).toEqual([])
    expect(screen.getByText("Seed field").getAttribute("aria-describedby")).toBe("lab-help-hint")
  })

  it("open at once when moving to a neighbouring control, and close on leaving", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    renderPage()
    pointer("pointerover", screen.getByText("Seed field"))
    await act(async () => { vi.advanceTimersByTime(650) })
    pointer("pointerover", screen.getByText("Length field"))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(hint()!.textContent).toContain("Length")
    pointer("pointerover", document.body)
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(hint()).toBeNull()
  })

  it("show on keyboard focus, and Escape closes them", async () => {
    renderPage()
    await act(async () => { fireEvent.keyDown(document.body, { key: "Tab" }); screen.getByText("Seed field").focus() })
    expect(hint()!.textContent).toContain("Seed")
    await act(async () => { fireEvent.keyDown(document.body, { key: "Escape" }) })
    expect(hint()).toBeNull()
  })

  it("do not appear for regions such as a source label", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    renderPage()
    pointer("pointerover", screen.getByText("Your model"))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(hint()).toBeNull()
  })
})

describe("Learn this control", () => {
  it("Alt+H opens a pinned popover with the worked picture; Escape closes it and returns focus", async () => {
    renderPage()
    const seed = screen.getByText("Seed field")
    await act(async () => { fireEvent.keyDown(document.body, { key: "Tab" }); seed.focus() })
    await act(async () => { fireEvent.keyDown(seed, { key: "h", altKey: true }) })
    const p = popover()!
    expect(p.getAttribute("role")).toBe("dialog")
    expect(hint()).toBeNull() // one help surface at a time
    expect(document.activeElement?.id).toBe("lab-help-title")
    expect(p.textContent).toContain("Illustrative numbers.")
    expect(p.textContent).toMatch(/does not choose the most likely character/)
    // Pinned: clicking elsewhere on the page does not close it.
    await act(async () => { fireEvent.pointerDown(document.body); fireEvent.click(document.body) })
    expect(popover()).toBeTruthy()
    await act(async () => { fireEvent.keyDown(document.body, { key: "Escape" }) })
    expect(popover()).toBeNull()
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    expect(document.activeElement).toBe(seed)
    expect(calls).not.toHaveBeenCalled()
  })

  it("Help mode puts a marker beside each control; a marker opens that control's help", async () => {
    renderPage()
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    expect(screen.queryByRole("button", { name: /learn this control: seed/i })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole("switch", { name: /help mode/i })) })
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    const marker = screen.getByRole("button", { name: /learn this control: seed/i })
    expect(screen.queryByRole("button", { name: /learn this control: your model/i })).toBeNull() // regions get none
    await act(async () => { fireEvent.click(marker) })
    expect(within(popover()!).getByRole("heading", { name: "Seed" })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /learn this control: length/i })) })
    expect(within(popover()!).getByRole("heading", { name: "Length" })).toBeTruthy()
    expect(screen.getAllByTestId("help-popover")).toHaveLength(1)
    expect(calls).not.toHaveBeenCalled()
  })

  it("a disabled control always has a marker that says why it is unavailable", async () => {
    renderPage()
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    const why = screen.getByRole("button", { name: "Why is Accept unavailable?" })
    await act(async () => { fireEvent.click(why) })
    expect(popover()!.textContent).toMatch(/Why it is unavailable: There is no current suggestion/)
  })
})

describe("going to a control", () => {
  it("on the same page, opens its tab, points at it and explains it, without running anything", async () => {
    window.location.hash = "#/data"
    renderPage()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Go to merges" })) })
    await act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r(null))) })
    expect(screen.getByText("tab tokens")).toBeTruthy()
    expect(screen.getByLabelText("Merges").hasAttribute("data-help-spot")).toBe(true)
    expect(within(popover()!).getByRole("heading", { name: "Merges learned" })).toBeTruthy()
    expect(calls).not.toHaveBeenCalled()
  })

  it("on another page, opens that page with the control named in the link", async () => {
    renderPage()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Go to evaluation" })) })
    // The page opened, and the provider then pointed at the control and dropped the parameter.
    expect(window.location.hash.startsWith("#/evaluation")).toBe(true)
    expect(calls).not.toHaveBeenCalled()
  })
})

describe("placement", () => {
  const view = { width: 800, height: 600 }
  const size = { width: 300, height: 200 }
  it("goes below the control when there is room, above it when there isn't", () => {
    expect(place({ top: 100, left: 100, width: 80, height: 30 }, size, view)).toMatchObject({ side: "below", top: 138 })
    expect(place({ top: 500, left: 100, width: 80, height: 30 }, size, view)).toMatchObject({ side: "above", top: 292 })
  })
  it("never leaves the screen, even at the edges", () => {
    const right = place({ top: 100, left: 780, width: 20, height: 20 }, size, view)
    expect(right.left).toBe(800 - 300 - 8)
    const left = place({ top: 100, left: 0, width: 20, height: 20 }, size, view)
    expect(left.left).toBe(8)
    const tall = place({ top: 250, left: 300, width: 20, height: 20 }, { width: 300, height: 590 }, view)
    expect(tall.top).toBeGreaterThanOrEqual(8)
  })
})
