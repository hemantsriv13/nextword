// @vitest-environment jsdom
import { useState } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import "@/test/setup-dom"
import { actions } from "@/lib/store"
import { Panel } from "./layout"
import { Teach, WorkspaceGuide, type Guide } from "./teach"

const GUIDE: Guide = {
  question: "A test question",
  scope: "A test scope",
  sources: ["simulation"],
  nodes: [
    { id: "a", label: "First box", kind: "input", target: "pa", carries: "numbers", goesIn: "in A", happens: "does A", why: "because A", comesOut: "out A", next: "to B" },
    { id: "b", label: "Second box", kind: "output", target: "pb", tab: "two", goesIn: "in B", happens: "does B", why: "because B", comesOut: "out B", next: "nowhere" },
  ],
  tour: [
    { target: "pa", tab: "one", title: "Step on A", plain: <p>Plain words for A</p> },
    { target: "pb", tab: "two", title: "Step on B", plain: <p>Plain words for B</p> },
    { target: "pc", title: "Step on C", missing: "C appears after a run.", plain: <p>Plain words for C</p> },
  ],
}

function Harness() {
  const [tab, setTab] = useState("one")
  const [n, setN] = useState(0)
  return (
    <Teach guide={GUIDE} onStep={(w) => w.tab && setTab(w.tab)}>
      <WorkspaceGuide />
      <p>tab {tab}</p>
      <button type="button" onClick={() => setN(n + 1)}>Change something</button>
      <span data-testid="n">{n}</span>
      {tab === "one" && <Panel id="pa" title="Panel A" teach={{ calc: <p>A calc 2 + 2 = 4</p> }}>A body</Panel>}
      {tab === "two" && <Panel id="pb" title="Panel B" teach={{ code: <p>B code</p> }}>B body</Panel>}
    </Teach>
  )
}

const card = () => screen.getByTestId("tour-card")
const click = async (name: RegExp, root: HTMLElement = document.body) => { await act(async () => { fireEvent.click(within(root).getAllByRole("button", { name })[0]) }) }
const frame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))) })

beforeEach(() => actions.reset())
afterEach(() => cleanup())

describe("the shared walkthrough", () => {
  it("shows the card inside the panel it explains, with the three levels", async () => {
    render(<Harness />)
    await click(/^read and watch$/i)
    expect(card().closest("[data-teach]")!.getAttribute("data-teach")).toBe("pa")
    expect(within(card()).getByText("Plain words for A")).toBeTruthy()
    expect(within(card()).getByText("1 of 3")).toBeTruthy()
    await act(async () => { fireEvent.click(within(card()).getByRole("radio", { name: /show the calculation/i })) })
    expect(within(card()).getByText("A calc 2 + 2 = 4")).toBeTruthy()
    await act(async () => { fireEvent.click(within(card()).getByRole("radio", { name: /show the code/i })) })
    expect(within(card()).getByText(/no code of its own/i)).toBeTruthy()
  })

  it("opens the tab a step needs, keeps the chosen level, and Back returns", async () => {
    render(<Harness />)
    await click(/^read and watch$/i)
    await act(async () => { fireEvent.click(within(card()).getByRole("radio", { name: /show the code/i })) })
    await click(/^next/i, card())
    expect(screen.getByText("tab two")).toBeTruthy()
    expect(card().closest("[data-teach]")!.getAttribute("data-teach")).toBe("pb")
    expect(within(card()).getByText("B code")).toBeTruthy()
    await click(/^back$/i, card())
    expect(card().closest("[data-teach]")!.getAttribute("data-teach")).toBe("pa")
    expect(within(card()).getByRole("radio", { name: /show the code/i }).getAttribute("aria-checked")).toBe("true")
  })

  it("explains a step whose panel isn't on the page yet, in the guide, saying how to get it", async () => {
    render(<Harness />)
    await click(/^read and watch$/i)
    await click(/^next/i, card())
    await click(/^next/i, card())
    await frame()
    expect(within(card()).getByText("C appears after a run.")).toBeTruthy()
    expect(within(card()).getByText("Plain words for C")).toBeTruthy()
    expect(within(card()).getByRole("button", { name: /^finish the walkthrough$/i })).toBeTruthy()
  })

  it("exits with Esc or Exit and leaves the page's own state alone", async () => {
    render(<Harness />)
    await click(/change something/i)
    await click(/^read and watch$/i)
    await act(async () => { fireEvent.keyDown(card(), { key: "Escape" }) })
    expect(screen.queryByTestId("tour-card")).toBeNull()
    expect(screen.getByTestId("n").textContent).toBe("1")
    await click(/^read and watch$/i)
    await click(/^exit$/i, card())
    expect(screen.queryByTestId("tour-card")).toBeNull()
  })

  it("moves focus to each step's heading", async () => {
    render(<Harness />)
    await click(/^read and watch$/i)
    expect(document.activeElement?.textContent).toBe("Step on A")
    await click(/^next/i, card())
    expect(document.activeElement?.textContent).toBe("Step on B")
  })

  it("the level switch works with arrow keys", async () => {
    render(<Harness />)
    await click(/^read and watch$/i)
    const walk = within(card()).getByRole("radio", { name: /walk me through it/i })
    await act(async () => { fireEvent.keyDown(walk, { key: "ArrowRight" }) })
    expect(within(card()).getByRole("radio", { name: /show the calculation/i }).getAttribute("aria-checked")).toBe("true")
  })
})

describe("the flow diagram", () => {
  it("labels each arrow with what it carries and explains the selected box", async () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: "Input: First box, passes on numbers" })).toBeTruthy()
    expect(screen.getByText("because A")).toBeTruthy()
    await click(/output: second box/i)
    expect(screen.getByText("because B")).toBeTruthy()
    expect(screen.queryByText("because A")).toBeNull()
  })

  it("highlights the selected box's panel, and Show it opens that panel's tab", async () => {
    render(<Harness />)
    expect(document.querySelector("[data-teach=pa]")!.getAttribute("data-highlighted")).toBe("true")
    await click(/output: second box/i)
    expect(document.querySelector("[data-teach=pa]")!.getAttribute("data-highlighted")).toBeNull()
    await click(/show it in the workspace/i)
    expect(screen.getByText("tab two")).toBeTruthy()
    expect(document.querySelector("[data-teach=pb]")!.getAttribute("data-highlighted")).toBe("true")
  })

  it("can be hidden and shown again", async () => {
    render(<Harness />)
    await click(/hide the flow/i)
    expect(screen.queryByText("A test question")).toBeNull()
    await click(/show the flow/i)
    expect(screen.getByText("A test question")).toBeTruthy()
  })
})
