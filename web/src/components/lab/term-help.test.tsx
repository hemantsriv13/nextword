// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"

const calls = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  // Any request at all would show up here: opening help must never make one.
  const spy = new Proxy(real.api, { get: (t, k) => (...a: unknown[]) => { calls(k, a); return (t as Record<string, (...x: unknown[]) => unknown>)[k as string]?.(...a) } })
  return { ...real, api: spy }
})

const { MathHelp, TermHelp } = await import("./term-help")
const { InfoTip, closeInfo } = await import("./info-tip")
const { GlossaryProvider } = await import("./glossary")
const { HelpProvider } = await import("./help")
const { actions } = await import("@/lib/store")

beforeEach(() => { actions.reset(); calls.mockReset(); closeInfo() })
afterEach(() => cleanup())

function Page() {
  return (
    <main>
      <p data-testid="para">Mean <TermHelp id="nll" here="Scored on held-out text." example={<>p = 0.2500, so NLL = 1.386 nats.</>}>negative log-likelihood</TermHelp> per character.</p>
      <p>Perplexity = <MathHelp id="exp">exp</MathHelp>(mean <MathHelp id="nll">NLL</MathHelp>)</p>
      <span><input aria-label="Seed field" data-help-id="playground.seed" /><InfoTip id="playground.seed" /></span>
    </main>
  )
}
const renderPage = () => render(<GlossaryProvider><HelpProvider><Page /></HelpProvider></GlossaryProvider>)
const popup = () => screen.queryByTestId("info-popup")
const icon = (name: string) => screen.getAllByRole("button", { name })[0]
const hover = (el: Element) => { fireEvent.pointerEnter(el, { pointerType: "mouse" }); fireEvent.mouseEnter(el); fireEvent.mouseMove(el) }
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe("term help", () => {
  it("puts one icon right after the term, outside the text, named for the term", () => {
    renderPage()
    const info = icon("What is NLL?")
    expect(info.getAttribute("type")).toBe("button")
    expect(info.previousSibling?.textContent).toBe("negative log-likelihood")
    expect(info.closest("p")).toBe(screen.getByTestId("para"))
    // The equation's symbols are explainable too.
    expect(screen.getByRole("button", { name: "What is exp?" })).toBeTruthy()
  })

  it("hovering the paragraph opens nothing; hovering the icon opens it after a delay, anchored to the icon", async () => {
    renderPage()
    hover(screen.getByTestId("para"))
    await wait(700)
    expect(popup()).toBeNull()
    hover(icon("What is NLL?"))
    await wait(200)
    expect(popup()).toBeNull()
    await wait(500)
    expect(popup()!.getAttribute("data-info-popup")).toBe("term:nll")
    expect(icon("What is NLL?").getAttribute("aria-expanded")).toBe("true")
  })

  it("shows the full name, the plain meaning, its role here, this result's example and a misunderstanding", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("What is NLL?")) })
    const box = popup()!
    expect(box.textContent).toContain("Short for Negative log-likelihood")
    expect(box.textContent).toContain("How much the model is penalized for assigning a low probability to the correct next token")
    expect(box.textContent).toContain("What it means hereScored on held-out text.")
    expect(within(box).getByTestId("term-example").textContent).toContain("p = 0.2500, so NLL = 1.386 nats.")
    expect(box.textContent).toContain("A common misunderstanding")
    expect(within(box).queryByTestId("term-deeper")).toBeNull()
    await act(async () => { fireEvent.click(within(box).getByRole("button", { name: /go deeper/i })) })
    expect(within(box).getByTestId("term-deeper").textContent).toContain("NLL = −ln p(actual next token | context)")
  })

  it("without a result, the example is labelled illustrative", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("What is exp?")) })
    expect(popup()!.textContent).toContain("Illustrative example")
    expect(popup()!.textContent).toContain("Read it as “exponential”")
  })

  it("prerequisites open in the same box, and Back returns", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("What is NLL?")) })
    await act(async () => { fireEvent.click(within(popup()!).getByRole("button", { name: "ln" })) })
    expect(screen.getByTestId("term-body").getAttribute("data-term")).toBe("ln")
    expect(popup()!.textContent).toContain("the code uses base e")
    await act(async () => { fireEvent.click(within(popup()!).getByRole("button", { name: /back to nll/i })) })
    expect(screen.getByTestId("term-body").getAttribute("data-term")).toBe("nll")
  })

  it("a click pins it; Escape closes it and returns focus; an outside click closes it", async () => {
    renderPage()
    const info = icon("What is NLL?")
    await act(async () => { info.focus(); fireEvent.click(info) })
    await wait(700)
    expect(popup()).toBeTruthy()
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }) })
    await wait(50)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(info)
    await act(async () => { fireEvent.click(info) })
    const para = screen.getByTestId("para")
    await act(async () => { fireEvent.pointerDown(para); fireEvent.mouseDown(para); fireEvent.click(para) })
    await wait(50)
    expect(popup()).toBeNull()
  })

  it("keyboard focus opens it, and only one help box (term or control) is open at a time", async () => {
    renderPage()
    await act(async () => { fireEvent.keyDown(document.body, { key: "Tab" }); icon("What is exp?").focus() })
    expect(popup()!.getAttribute("data-info-popup")).toBe("term:exp")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "About Seed" })) })
    await wait(50)
    expect(screen.getAllByTestId("info-popup")).toHaveLength(1)
    expect(popup()!.getAttribute("data-info-popup")).toBe("playground.seed")
  })

  it("the same term in an equation is a separate icon with its own box", async () => {
    renderPage()
    const both = screen.getAllByRole("button", { name: "What is NLL?" })
    expect(both).toHaveLength(2)
    await act(async () => { fireEvent.click(both[1]) })
    expect(both[1].getAttribute("aria-expanded")).toBe("true")
    expect(both[0].getAttribute("aria-expanded")).toBe("false")
  })

  it("the glossary link closes the box and opens the full entry; nothing is requested", async () => {
    renderPage()
    await act(async () => { fireEvent.click(icon("What is NLL?")) })
    await act(async () => { fireEvent.click(within(popup()!).getByRole("button", { name: /open the glossary entry for nll/i })) })
    await wait(50)
    expect(popup()).toBeNull()
    expect(screen.getByRole("dialog").textContent).toContain("NLL: Negative log-likelihood")
    expect(calls).not.toHaveBeenCalled()
  })

  it("switching the Info icons off hides term icons and leaves the text", async () => {
    renderPage()
    await act(async () => { actions.setPref("infoIcons", false) })
    expect(screen.queryByRole("button", { name: "What is NLL?" })).toBeNull()
    expect(screen.getByTestId("para").textContent).toContain("negative log-likelihood")
  })
})
