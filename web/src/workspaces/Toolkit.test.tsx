// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"

const calls = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  const spy = new Proxy(real.api, { get: (_t, k) => (...a: unknown[]) => { calls(k, a); return new Promise(() => {}) } })
  return { ...real, api: spy }
})

const { default: Toolkit } = await import("./Toolkit")
const { HelpProvider } = await import("@/components/lab/help")
const { ToolkitTourProvider } = await import("@/components/lab/toolkit-tour")
const { GlossaryProvider } = await import("@/components/lab/glossary")
const { actions, getState } = await import("@/lib/store")
const { WORKSPACE_HELP } = await import("@/content/help")

const renderGuide = () => render(<GlossaryProvider><HelpProvider><ToolkitTourProvider><Toolkit /></ToolkitTourProvider></HelpProvider></GlossaryProvider>)
const frames = (n = 3) => act(async () => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null))) })
const view = (name: RegExp) => act(async () => { fireEvent.click(screen.getByRole("radio", { name })) })
const card = () => screen.queryByTestId("toolkit-tour")

beforeEach(() => { actions.reset(); calls.mockReset(); window.location.hash = "#/toolkit" })
afterEach(() => cleanup())

describe("find the right workspace", () => {
  it("lists every page, and each entry answers the eight questions with a way to open it", async () => {
    renderGuide()
    const list = screen.getByTestId("tk-pages")
    expect(within(list).getAllByRole("button", { expanded: false })).toHaveLength(WORKSPACE_HELP.length)
    fireEvent.change(screen.getByLabelText("Search the workspaces"), { target: { value: "tokens" } })
    await act(async () => { fireEvent.click(within(list).getByRole("button", { name: /data and tokens/i })) })
    for (const k of ["What it is for", "The question it answers", "When to use it", "Understand first", "What you can do here", "What to expect", "Where the numbers come from", "Where to go next"]) expect(within(list).getByText(k)).toBeTruthy()
    expect(within(list).getByText("See how your text becomes tokens.")).toBeTruthy()
    expect(within(list).getByRole("link", { name: /open data and tokens/i }).getAttribute("href")).toBe("#/data")
    expect(calls).not.toHaveBeenCalled()
  })
})

describe("find a control or concept", () => {
  it("answers a plain question and links to the controls involved", async () => {
    renderGuide()
    await view(/find a control or concept/i)
    fireEvent.change(screen.getByLabelText("Search controls and concepts"), { target: { value: "why did I get different text" } })
    const concepts = screen.getByTestId("tk-concepts")
    expect(within(concepts).getByText("Why did I get different text?")).toBeTruthy()
    expect(within(concepts).getByText(/usually, but not always/)).toBeTruthy()
    await act(async () => { fireEvent.click(within(concepts).getAllByRole("button", { name: /show me where: seed, writing playground/i })[0]) })
    expect(window.location.hash.startsWith("#/playground")).toBe(true)
    expect(calls).not.toHaveBeenCalled() // following a help link runs nothing
  })

  it("finds controls by their technical name too, and says what they change", async () => {
    renderGuide()
    await view(/find a control or concept/i)
    fireEvent.change(screen.getByLabelText("Search controls and concepts"), { target: { value: "temperature" } })
    const controls = screen.getByTestId("tk-controls")
    expect(within(controls).getByText("Temperature")).toBeTruthy()
    expect(within(controls).getAllByText("Runs a browser simulation, not your engine").length).toBeGreaterThan(0)
  })

  it("opens straight into a search from a link", () => {
    window.location.hash = "#/toolkit?view=find&q=validation"
    renderGuide()
    expect((screen.getByLabelText("Search controls and concepts") as HTMLInputElement).value).toBe("validation")
    expect(within(screen.getByTestId("tk-controls")).getByText(/Measure on: validation or test/)).toBeTruthy()
  })
})

describe("toolkit tours", () => {
  it("start, move, save their place, skip, resume and restart", async () => {
    const evidenceBefore = JSON.stringify(getState().evidence)
    renderGuide()
    await view(/guided tours/i)
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /start the tour/i })[0]) })
    expect(window.location.hash).toBe("#/home")
    expect(within(card()!).getByTestId("tour-progress").textContent).toBe("Find your way around · 1 of 8")
    expect(document.activeElement?.id).toBe("toolkit-tour-title")
    await act(async () => { fireEvent.click(within(card()!).getByRole("button", { name: /^next/i })) })
    expect(within(card()!).getByTestId("tour-progress").textContent).toBe("Find your way around · 2 of 8")
    expect(getState().prefs.tourPositions.around).toBe(1)
    await act(async () => { fireEvent.click(within(card()!).getByRole("button", { name: /^skip tour$/i })) })
    expect(card()).toBeNull()
    expect(screen.getByRole("button", { name: /resume at step 2/i })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /resume at step 2/i })) })
    expect(within(card()!).getByTestId("tour-progress").textContent).toContain("2 of 8")
    await act(async () => { fireEvent.keyDown(card()!, { key: "Escape" }) })
    expect(card()).toBeNull()
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /start over/i })[0]) })
    expect(within(card()!).getByTestId("tour-progress").textContent).toContain("1 of 8")
    expect(calls).not.toHaveBeenCalled()
    expect(JSON.stringify(getState().evidence)).toBe(evidenceBefore) // a tour records nothing about understanding
  })

  it("explains a step whose target isn't on screen, and Explain more keeps the position", async () => {
    renderGuide()
    await view(/guided tours/i)
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /start the tour/i })[0]) })
    await frames(170)
    expect(within(card()!).getByRole("status").textContent).toMatch(/isn't on the screen right now/)
    await act(async () => { fireEvent.click(within(card()!).getByRole("button", { name: /explain more/i })) })
    expect(card()!.textContent).toMatch(/learning order/)
    expect(within(card()!).getByTestId("tour-progress").textContent).toContain("1 of 8")
  })
})
