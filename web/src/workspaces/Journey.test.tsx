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

const btn = (name: RegExp, root: HTMLElement = document.body) => within(root).getAllByRole("button", { name })[0]
const press = async (name: RegExp, root?: HTMLElement) => { await act(async () => { fireEvent.click(btn(name, root)) }) }
const stageNav = () => screen.getByRole("navigation", { name: "Lesson stages" })
const position = () => screen.getByTestId("stage-position").textContent
const canvasStage = () => screen.getByTestId("stage-canvas").getAttribute("data-stage")
const explanation = () => screen.getByTestId("explanation-body")
const mode = async (name: "Guided lesson" | "Explore all") => { await act(async () => { fireEvent.click(screen.getByRole("radio", { name })) }) }
const goTo = async (label: RegExp) => press(label, stageNav())

async function open(data: JourneyData = EX) {
  journey.mockResolvedValue(data)
  render(<Journey />)
  await screen.findByTestId("stage-canvas")
}

beforeEach(() => { actions.reset(); journey.mockReset() })
afterEach(() => cleanup())

describe("the lesson header", () => {
  it("runs the example once, and summarizes the run with the provenance in a disclosure", async () => {
    await open()
    expect(journey).toHaveBeenCalledTimes(1)
    expect(journey).toHaveBeenCalledWith({ corpus: "example", prompt: "a cat sat on th", length: 10, seed: 2 })
    const summary = screen.getByTestId("run-summary")
    expect(summary.textContent).toContain("Your model")
    expect(summary.textContent).toContain("Example passage")
    expect(summary.textContent).toContain("seed 2")
    const details = screen.getByTestId("run-details")
    expect(details.textContent).toContain(EX.corpus.fingerprint)
    expect(details.textContent).toContain("count_bigrams")
    expect(details.hasAttribute("open")).toBe(false)
  })

  it("shows a stale warning in both views when the inputs change, and keeps explaining the earlier run", async () => {
    await open()
    await press(/change the inputs/i)
    fireEvent.change(document.getElementById("j-seed")!, { target: { value: "9" } })
    expect(screen.getByText(/you changed the seed/i)).toBeTruthy()
    expect(screen.getByText(/these words describe the earlier run/i)).toBeTruthy()
    expect(screen.getByTestId("run-summary").textContent).toContain("seed 2")
    await mode("Explore all")
    expect(screen.getByText(/you changed the seed/i)).toBeTruthy()
    expect(journey).toHaveBeenCalledTimes(1) // nothing recomputed until asked
  })
})

describe("stage navigation", () => {
  it("starts at step 1 and moves with Next and Back, naming the next stage", async () => {
    await open()
    expect(position()).toBe("Step 1 of 6")
    expect(canvasStage()).toBe("text")
    await press(/^next: count pairs/i)
    expect(position()).toBe("Step 2 of 6")
    await press(/^next: read the context/i)
    expect(canvasStage()).toBe("context")
    await press(/^back$/i)
    expect(canvasStage()).toBe("count")
    expect(within(stageNav()).getByRole("button", { name: /count pairs/i }).getAttribute("aria-current")).toBe("step")
  })

  it("jumps to any stage from the navigator and from the compact chooser, and focuses its heading", async () => {
    await open()
    await goTo(/calculate probabilities/i)
    expect(position()).toBe("Step 4 of 6")
    expect(document.activeElement?.textContent).toBe("Calculate probabilities")
    fireEvent.change(screen.getByLabelText(/step 4 of 6/i, { selector: "select" }), { target: { value: "5" } })
    expect(canvasStage()).toBe("repeat")
  })

  it("the process diagram is keyboard operable and marks the nodes of the current stage", async () => {
    await open()
    const node = (n: string) => document.querySelector(`[data-node=${n}]`)!
    expect(node("text").getAttribute("aria-pressed")).toBe("true")
    expect(node("draw").getAttribute("aria-pressed")).toBe("false")
    await act(async () => { fireEvent.keyDown(node("draw"), { key: "Enter" }) })
    expect(canvasStage()).toBe("sample")
    expect(node("draw").getAttribute("aria-pressed")).toBe("true")
    expect(node("chosen").getAttribute("aria-pressed")).toBe("true")
    // Its meaning is also available as text.
    expect(screen.getByText(/becomes the next context \(the dashed loop\)/i)).toBeTruthy()
  })
})

describe("each stage shows the engine's own numbers", () => {
  it("count pairs: the count is the engine's, and choosing a common pair updates it", async () => {
    await goToStage(/count pairs/i)
    expect(screen.getByTestId("pair-count").textContent).toBe(String(EX.table.rows.h.a))
    await press(/t followed by h/i)
    expect(screen.getByTestId("pair-count").textContent).toBe(String(EX.table.rows.t.h))
    expect(document.querySelectorAll("[data-pair=start]").length).toBe(EX.table.rows.t.h)
  })

  it("read the context: only the prompt's last character is marked, beside its row", async () => {
    await goToStage(/read the context/i)
    expect(within(screen.getByTestId("journey-prompt")).getByText("h").tagName).toBe("MARK")
  })

  it("calculate probabilities: counts, the denominator and the division together", async () => {
    await goToStage(/calculate probabilities/i)
    const rows = within(screen.getByTestId("norm-table")).getAllByRole("row").map((r) => r.textContent)
    expect(rows.some((t) => /e4÷ 50\.800/.test(t!))).toBe(true)
    expect(rows.some((t) => /a1÷ 50\.200/.test(t!))).toBe(true)
  })

  it("sample: the strip, the draw and the chosen character of the same step", async () => {
    await goToStage(/sample a character/i)
    const table = screen.getByTestId("interval-table")
    expect(table.textContent).toContain("u lands here")
    expect(screen.getByText(EX.generation.steps[0].draw.toFixed(4))).toBeTruthy()
    expect(screen.getByText(/the most likely was ‘e’ \(p = 0\.800\), but the draw landed on ‘a’/i)).toBeTruthy()
  })

  it("append and repeat: an earlier character traces back to its own context, counts and draw", async () => {
    await goToStage(/append and repeat/i)
    await press(/^show all$/i)
    await press(/^step 3:/i)
    const g = EX.generation
    const trace = screen.getByTestId("trace-back")
    expect(trace.textContent).toContain("Tracing step 3")
    expect(trace.textContent).toContain(`draw u = ${g.steps[2].draw.toFixed(3)}`)
    expect(trace.textContent).toContain("Checked against the count table")
    const out = screen.getByTestId("journey-output")
    expect(out.querySelector("[data-role~=step-choice]")!.getAttribute("aria-label")).toMatch(/^Step 3:/)
    expect(out.querySelector("[data-role~=next-context]")!.getAttribute("aria-label")).toMatch(/^Step 10:/)
  })

  it("a run that stops early says why", async () => {
    journey.mockResolvedValue(STOPS)
    render(<Journey />)
    await screen.findByTestId("stage-canvas")
    await goTo(/append and repeat/i)
    await press(/^show all$/i)
    expect(screen.getByText(/the run stopped after 2 of 8 characters/i)).toBeTruthy()
    expect(screen.getByTestId("run-summary").textContent).toContain("stopped early")
  })
})

describe("modes, details and replay keep the same run", () => {
  it("switching Guided ↔ Explore keeps the chosen pair, the revealed steps and the stage", async () => {
    await open()
    await press(/t followed by h/i)
    await goTo(/append and repeat/i)
    await press(/^next step$/i)
    await press(/^next step$/i)
    expect(screen.getByText("Showing 3 of 10 steps")).toBeTruthy()
    await mode("Explore all")
    const explore = screen.getByTestId("explore-view")
    expect(within(explore).getAllByTestId("pair-count")[0].textContent).toBe(String(EX.table.rows.t.h))
    expect(within(explore).getByText("Showing 3 of 10 steps")).toBeTruthy()
    expect([...explore.querySelectorAll("section[id^=stage-] > h2")].map((h) => h.textContent)).toEqual([
      "1Training text", "2Count pairs", "3Read the context", "4Calculate probabilities", "5Sample a character", "6Append and repeat",
    ])
    await mode("Guided lesson")
    expect(position()).toBe("Step 6 of 6")
    expect(screen.getByText("Showing 3 of 10 steps")).toBeTruthy()
    expect(journey).toHaveBeenCalledTimes(1)
  })

  it("the detail levels show plain words, this run's calculation and the code", async () => {
    await goToStage(/sample a character/i)
    expect(within(explanation()).getByText("What is happening")).toBeTruthy()
    expect(within(explanation()).getByText("Try this")).toBeTruthy()
    expect(explanation().textContent).toMatch(/the first probability distribution is unchanged/i)
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /show the calculation/i })) })
    expect(explanation().textContent).toContain(EX.generation.steps[0].draw.toFixed(4))
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /show the code/i })) })
    expect(within(explanation()).getByRole("status", { name: /loading source/i })).toBeTruthy()
    // The level stays when the stage changes.
    await press(/^next: append and repeat/i)
    expect(screen.getByRole("radio", { name: /show the code/i }).getAttribute("aria-checked")).toBe("true")
  })

  it("the words used in a stage are in a disclosure, closed until opened, at every detail level", async () => {
    await open()
    const panel = () => screen.getByTestId("stage-explanation")
    expect(within(panel()).getByText(/words used here \(2\)/i).closest("details")!.hasAttribute("open")).toBe(false)
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /show the calculation/i })) })
    expect(within(panel()).getByText(/words used here \(2\)/i)).toBeTruthy()
  })

  it("the explanation is one labelled panel: header with the lesson name, levels, content, Try this", async () => {
    await open()
    const panel = screen.getByTestId("stage-explanation")
    expect(within(panel).getByText("Step explained")).toBeTruthy()
    expect(within(panel).getByRole("heading", { level: 2, name: "Training text" })).toBeTruthy()
    expect(within(panel).getByRole("radiogroup", { name: /how much detail/i })).toBeTruthy()
    expect(within(panel).getByTestId("try-this").textContent).toMatch(/^Try this/)
    await press(/^next: count pairs/i)
    expect(within(screen.getByTestId("stage-explanation")).getByRole("heading", { level: 2, name: "Count pairs" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: /in plain words/i }).getAttribute("aria-checked")).toBe("true")
  })

  it("Replay restarts the stage from the same run, without asking the engine again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await open()
      await goTo(/append and repeat/i)
      await press(/^next step$/i)
      await press(/^next step$/i)
      const before = screen.getByTestId("journey-output").textContent
      await press(/^replay this step$/i)
      expect(screen.getByText("Showing 1 of 10 steps")).toBeTruthy()
      for (let k = 0; k < 12; k++) await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
      expect(screen.getByText("Showing 10 of 10 steps")).toBeTruthy()
      expect(screen.getByTestId("journey-output").textContent!.startsWith(before!.replace("▏", ""))).toBe(true)
      expect(journey).toHaveBeenCalledTimes(1) // same seeded run, no new draws
    } finally {
      vi.useRealTimers()
    }
  })

  it("Replay on the counting stage counts the same places again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await open()
      await goTo(/count pairs/i)
      await press(/t followed by h/i)
      await press(/^replay this step$/i)
      expect(screen.getByTestId("pair-count").textContent).toBe("0")
      for (let k = 0; k < 8; k++) await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(screen.getByTestId("pair-count").textContent).toBe(String(EX.table.rows.t.h))
      expect(journey).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("never advances the lesson by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await open()
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(position()).toBe("Step 1 of 6")
    } finally {
      vi.useRealTimers()
    }
  })
})

async function goToStage(label: RegExp) {
  await open()
  await goTo(label)
}
