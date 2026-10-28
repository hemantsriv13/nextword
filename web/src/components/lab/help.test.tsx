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

const { HelpProvider, InfoIconsSwitch, place, useHelp, useHelpReveal } = await import("./help")
const { InfoTip, closeInfo } = await import("./info-tip")
const { Button } = await import("@/components/ui/button")
const { GlossaryProvider } = await import("./glossary")
const { actions } = await import("@/lib/store")

const seedClicked = vi.fn()

function Page() {
  const [tab, setTab] = useState("one")
  useHelpReveal((r) => { if (r.tab) setTab(r.tab) })
  const help = useHelp()!
  return (
    <main>
      <InfoIconsSwitch />
      <Button data-help-id="playground.seed" onClick={seedClicked}>Seed field</Button>
      <Button data-help-id="playground.length">Length field</Button>
      <Button data-help-id="playground.accept" disabled>Accept</Button>
      <span data-help-id="layout.source">Your model</span>
      <p>tab {tab}</p>
      {tab === "tokens" && <span><input aria-label="Merges" data-help-id="data.merges" /><InfoTip id="data.merges" /></span>}
      <button type="button" onClick={() => help.goTo("data.merges")}>Go to merges</button>
      <button type="button" onClick={() => help.goTo("evaluation.on")}>Go to evaluation</button>
    </main>
  )
}

beforeEach(() => {
  actions.reset()
  calls.mockReset()
  seedClicked.mockReset()
  closeInfo()
  window.location.hash = "#/playground"
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const renderPage = () => render(<GlossaryProvider><HelpProvider><Page /></HelpProvider></GlossaryProvider>)
const popup = () => screen.queryByTestId("info-popup")
const icon = (name: RegExp | string) => screen.getByRole("button", { name })
const hover = (el: Element) => { fireEvent.pointerEnter(el, { pointerType: "mouse" }); fireEvent.mouseEnter(el); fireEvent.mouseMove(el) }
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe("the Info icon", () => {
  it("sits beside its button, not inside it, and cannot submit a form", () => {
    renderPage()
    const seed = screen.getByRole("button", { name: "Seed field" })
    const info = icon("About Seed")
    expect(seed.contains(info)).toBe(false)
    expect(info.parentElement?.closest("button")).toBeNull()
    expect(seed.nextElementSibling).toBe(info)
    expect(info.getAttribute("type")).toBe("button")
  })

  it("hovering the control itself opens nothing", async () => {
    renderPage()
    hover(screen.getByRole("button", { name: "Seed field" }))
    await wait(900)
    expect(popup()).toBeNull()
  })

  it("hovering the icon opens the help after a short delay, anchored to that icon", async () => {
    renderPage()
    hover(icon("About Seed"))
    await wait(200)
    expect(popup()).toBeNull() // not at once
    await wait(500)
    const p = popup()!
    expect(p.getAttribute("data-info-popup")).toBe("playground.seed")
    expect(p.textContent).toContain("Changes a setting; nothing runs until you run it")
    expect(icon("About Seed").getAttribute("aria-expanded")).toBe("true")
  })

  it("leaving before the delay cancels it", async () => {
    renderPage()
    const info = icon("About Seed")
    hover(info)
    await wait(200)
    fireEvent.pointerLeave(info, { pointerType: "mouse" }); fireEvent.mouseLeave(info)
    await wait(700)
    expect(popup()).toBeNull()
  })

  it("a click pins it without running the control; Escape closes it and focus returns to the icon", async () => {
    renderPage()
    const info = icon("About Seed")
    await act(async () => { info.focus(); fireEvent.click(info) })
    expect(popup()).toBeTruthy()
    expect(seedClicked).not.toHaveBeenCalled()
    await wait(700)
    expect(popup()).toBeTruthy() // pinned: it does not time out
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }) })
    await wait(50)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(info)
    expect(calls).not.toHaveBeenCalled()
  })

  it("an outside click closes it", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("About Seed")) })
    expect(popup()).toBeTruthy()
    await act(async () => { fireEvent.pointerDown(screen.getByText("tab one")); fireEvent.mouseDown(screen.getByText("tab one")); fireEvent.click(screen.getByText("tab one")) })
    await wait(50)
    expect(popup()).toBeNull()
  })

  it("only one help box is open at a time", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("About Seed")) })
    await act(async () => { fireEvent.click(icon("About Length")) })
    await wait(50)
    expect(screen.getAllByTestId("info-popup")).toHaveLength(1)
    expect(popup()!.getAttribute("data-info-popup")).toBe("playground.length")
  })

  it("More details adds the longer explanation and the worked picture", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("About Seed")) })
    expect(screen.queryByTestId("info-more")).toBeNull()
    await act(async () => { fireEvent.click(within(popup()!).getByRole("button", { name: /more details/i })) })
    expect(screen.getByTestId("info-more").textContent).toContain("Illustrative numbers.")
  })

  it("regions get no icon; a disabled control's icon says why, even with the icons switched off", async () => {
    renderPage()
    expect(screen.queryByRole("button", { name: /about source label/i })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole("switch", { name: /info icons/i })) })
    expect(screen.queryByRole("button", { name: "About Seed" })).toBeNull()
    const why = icon("Why is Accept unavailable?")
    await act(async () => { fireEvent.click(why) })
    expect(popup()!.textContent).toMatch(/Unavailable now\. There is no current suggestion/)
  })

  it("keyboard focus on the icon opens it; Alt+H on a control opens its icon's help", async () => {
    renderPage()
    await act(async () => { fireEvent.keyDown(document.body, { key: "Tab" }); icon("About Length").focus() })
    expect(popup()?.getAttribute("data-info-popup")).toBe("playground.length")
    await act(async () => { closeInfo() })
    const seed = screen.getByRole("button", { name: "Seed field" })
    await act(async () => { seed.focus(); fireEvent.keyDown(seed, { key: "h", altKey: true }) })
    expect(popup()?.getAttribute("data-info-popup")).toBe("playground.seed")
  })
})

describe("going to a control", () => {
  it("on the same page, opens its tab, points at it and opens its help, without running anything", async () => {
    window.location.hash = "#/data"
    renderPage()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Go to merges" })) })
    await wait(500)
    expect(screen.getByText("tab tokens")).toBeTruthy()
    expect(screen.getByLabelText("Merges").hasAttribute("data-help-spot")).toBe(true)
    expect(popup()!.getAttribute("data-info-popup")).toBe("data.merges")
    expect(screen.getByTestId("info-more")).toBeTruthy()
    expect(calls).not.toHaveBeenCalled()
  })

  it("on another page, opens that page with the control named in the link", async () => {
    renderPage()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Go to evaluation" })) })
    expect(window.location.hash.startsWith("#/evaluation")).toBe(true)
    expect(calls).not.toHaveBeenCalled()
  })
})

describe("placement of the tour card", () => {
  const view = { width: 800, height: 600 }
  const size = { width: 300, height: 200 }
  it("goes below the target when there is room, above it when there isn't", () => {
    expect(place({ top: 100, left: 100, width: 80, height: 30 }, size, view)).toMatchObject({ side: "below", top: 138 })
    expect(place({ top: 500, left: 100, width: 80, height: 30 }, size, view)).toMatchObject({ side: "above", top: 292 })
  })
  it("never leaves the screen, even at the edges", () => {
    expect(place({ top: 100, left: 780, width: 20, height: 20 }, size, view).left).toBe(800 - 300 - 8)
    expect(place({ top: 100, left: 0, width: 20, height: 20 }, size, view).left).toBe(8)
    expect(place({ top: 250, left: 300, width: 20, height: 20 }, { width: 300, height: 590 }, view).top).toBeGreaterThanOrEqual(8)
  })
})
