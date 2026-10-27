// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { Journey as JourneyData } from "@/lib/api"
import example from "@/test/journey-example.json"
import stops from "@/test/journey-stops.json"

// Real responses from the Python engine (see journey.test.ts); the page must explain exactly these.
const EX = example as unknown as JourneyData
const STOPS = stops as unknown as JourneyData

const journey = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, journey: (b: unknown) => journey(b), source: () => new Promise(() => {}) } }
})
vi.mock("@/lib/corpora", () => ({
  useCorpora: () => ({ corpora: [{ id: "example", name: "Example passage", chars: 69 }, { id: "sample", name: "Sample passage", chars: 1167 }], error: undefined, loading: false, refresh: () => {} }),
}))

const { default: Journey } = await import("./Journey")
const { actions } = await import("@/lib/store")

const button = (name: RegExp, root: HTMLElement = document.body) => within(root).getAllByRole("button", { name })[0]
const card = () => screen.getByTestId("tour-card")
const cardPanel = () => card().closest("[data-teach]")!.getAttribute("data-teach")
const press = async (name: RegExp, root?: HTMLElement) => { await act(async () => { fireEvent.click(button(name, root)) }) }

async function open(data: JourneyData = EX) {
  journey.mockResolvedValue(data)
  render(<Journey />)
  await screen.findByTestId("journey-output")
}

beforeEach(() => { actions.reset(); journey.mockReset() })
afterEach(() => cleanup())

describe("the bigram journey explains one real engine snapshot", () => {
  it("runs the example once on opening, with the default inputs", async () => {
    await open()
    expect(journey).toHaveBeenCalledTimes(1)
    expect(journey).toHaveBeenCalledWith({ corpus: "example", prompt: "a cat sat on th", length: 10, seed: 2 })
  })

  it("the highlighted pair count is the engine's count for that pair", async () => {
    await open()
    // Default pair: the first step's context and choice, h → a.
    expect(screen.getByTestId("pair-count").textContent).toBe(String(EX.table.rows.h.a))
    expect(document.querySelectorAll("[data-pair=start]").length).toBe(EX.table.rows.h.a)
    await press(/t followed by h/i)
    expect(screen.getByTestId("pair-count").textContent).toBe(String(EX.table.rows.t.h))
    expect(document.querySelectorAll("[data-pair=start]").length).toBe(EX.table.rows.t.h)
  })

  it("the normalization table divides the engine's counts by the row total", async () => {
    await open()
    const rows = within(screen.getByTestId("norm-table")).getAllByRole("row")
    const text = rows.map((r) => r.textContent)
    expect(text.some((t) => /e4÷ 50\.800/.test(t!))).toBe(true)
    expect(text.some((t) => /a1÷ 50\.200/.test(t!))).toBe(true)
  })

  it("the prompt stage marks only the last character", async () => {
    await open()
    const prompt = screen.getByTestId("journey-prompt")
    expect(within(prompt).getByText("h").tagName).toBe("MARK")
  })

  it("selecting an earlier generated character traces it to its own context, counts and draw", async () => {
    await open()
    await press(/^show all$/i)
    const g = EX.generation
    await press(/^step 3:/i)
    const trace = screen.getByTestId("trace-back")
    expect(trace.textContent).toContain(`Tracing step 3`)
    expect(trace.textContent).toContain(`draw u = ${g.steps[2].draw.toFixed(3)}`)
    expect(trace.textContent).toContain("Checked against the count table")
    const out = screen.getByTestId("journey-output")
    // Step 3 read the character chosen at step 2, and chose its own; the next prediction reads the last one.
    expect(out.querySelector("[data-role~=step-context]")!.textContent).toBe(g.steps[1].token === " " ? "␣" : g.steps[1].token)
    expect(out.querySelector("[data-role~=step-choice]")!.getAttribute("aria-label")).toMatch(/^Step 3:/)
    expect(out.querySelector("[data-role~=next-context]")!.getAttribute("aria-label")).toMatch(/^Step 10:/)
    // The sampling stage explains the same selected step.
    expect(screen.getByText(/^Step 3: after/)).toBeTruthy()
  })

  it("Next step appends one character and moves the context forward", async () => {
    await open()
    expect(screen.getByText(/Showing 1 of 10 steps/)).toBeTruthy()
    await press(/^next step$/i)
    expect(screen.getByText(/Showing 2 of 10 steps/)).toBeTruthy()
    const out = screen.getByTestId("journey-output")
    expect(out.querySelector("[data-role~=step-choice]")!.getAttribute("aria-label")).toMatch(/^Step 2:/)
  })

  it("changing an input marks the explanation stale and keeps describing the earlier run", async () => {
    await open()
    fireEvent.change(document.getElementById("j-seed")!, { target: { value: "9" } })
    expect(screen.getByText(/you changed the seed/i)).toBeTruthy()
    for (const line of screen.getAllByTestId("snapshot-line")) expect(line.textContent).toContain("seed 2")
    expect(journey).toHaveBeenCalledTimes(1) // nothing recomputed until asked
  })

  it("a run that stops early says why", async () => {
    await open(STOPS)
    await press(/^show all$/i)
    expect(screen.getByText(/the run stopped after 2 of 8 characters/i)).toBeTruthy()
  })
})

describe("Read and watch", () => {
  it("walks the stages with Next and Back, shows the run's own numbers, and Exit returns focus", async () => {
    await open()
    await press(/^read and watch$/i)
    expect(cardPanel()).toBe("j-setup")
    const order: string[] = []
    for (let i = 0; i < 6; i++) { await press(/^next/i, card()); order.push(cardPanel()!) }
    expect(order).toEqual(["j-text", "j-count", "j-norm", "j-prompt", "j-sample", "j-repeat"])
    await press(/^back$/i, card())
    expect(cardPanel()).toBe("j-sample")
    await act(async () => { fireEvent.click(within(card()).getByRole("radio", { name: /show the calculation/i })) })
    expect(screen.getByTestId("tour-body").textContent).toContain(EX.generation.steps[0].draw.toFixed(4))
    await press(/^exit$/i, card())
    expect(screen.queryByTestId("tour-card")).toBeNull()
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
    expect(document.activeElement?.textContent).toMatch(/read and watch/i)
  })

  it("Replay restarts at the first step without asking the engine again", async () => {
    await open()
    await press(/^next step$/i)
    await press(/^next step$/i)
    expect(screen.getByText(/Showing 3 of 10 steps/)).toBeTruthy()
    await press(/^read and watch$/i)
    await press(/^next/i, card())
    await press(/^replay$/i, card())
    expect(cardPanel()).toBe("j-setup")
    expect(screen.getByText(/Showing 1 of 10 steps/)).toBeTruthy()
    expect(journey).toHaveBeenCalledTimes(1) // same seeded run, no new draws
  })

  it("Escape exits the walkthrough and leaves the settings as they were", async () => {
    await open()
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "hello" } })
    await press(/^read and watch$/i)
    await act(async () => { fireEvent.keyDown(card(), { key: "Escape" }) })
    expect(screen.queryByTestId("tour-card")).toBeNull()
    expect((screen.getByLabelText("Prompt") as HTMLInputElement).value).toBe("hello")
  })

  it("never advances by itself", async () => {
    vi.useFakeTimers()
    try {
      journey.mockResolvedValue(EX)
      render(<Journey />)
      await act(async () => { await vi.runOnlyPendingTimersAsync() })
      await act(async () => { fireEvent.click(button(/^read and watch$/i)) })
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(cardPanel()).toBe("j-setup")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("the flow diagram", () => {
  it("selecting a box highlights its view and explains what goes in and comes out", async () => {
    await open()
    await press(/operation: counts to probabilities/i)
    expect(document.querySelector("[data-teach=j-norm]")!.getAttribute("data-highlighted")).toBe("true")
    expect(document.querySelector("[data-teach=j-text]")!.getAttribute("data-highlighted")).toBeNull()
    expect(screen.getByRole("heading", { name: /operation: counts to probabilities/i })).toBeTruthy()
    expect(screen.getByText(/each count is divided by the row's total/i)).toBeTruthy()
  })
})
