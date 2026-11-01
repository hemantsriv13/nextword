// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import { ApiError, type Journey as JourneyData } from "@/lib/api"
import type { AssistEvent } from "@/lib/assist"
import example from "@/test/journey-example.json"

const EX = example as unknown as JourneyData

// The backend is mocked at the page's own client functions: each call to streamAssist is recorded
// with its request body, its event callback and its abort signal, so a test can play the stream.
interface Call { body: Record<string, unknown>; emit: (e: AssistEvent) => void; signal: AbortSignal; finish: () => void; fail: (err: Error) => void }
const calls: Call[] = []
const status = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, journey: () => Promise.resolve(EX), source: () => new Promise(() => {}) } }
})
vi.mock("@/lib/corpora", () => ({ useCorpora: () => ({ corpora: [{ id: "example", name: "Example passage", chars: 69 }], error: undefined, loading: false, refresh: () => {} }) }))
vi.mock("@/lib/assist", async (orig) => {
  const real = await orig<typeof import("@/lib/assist")>()
  return {
    ...real,
    assistStatus: () => status(),
    streamAssist: (body: Record<string, unknown>, onEvent: (e: AssistEvent) => void, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
        calls.push({ body, emit: onEvent, signal, finish: resolve, fail: reject })
      }),
  }
})

const { default: Journey } = await import("@/workspaces/Journey")
const { CheckpointProvider } = await import("./checkpoint")
const { GlossaryProvider } = await import("./glossary")
const { actions } = await import("@/lib/store")

const READY = { url: "http://127.0.0.1:8000/v1", model: "qwen3-4b-instruct-2507-q4km", available: true, modelServed: true, served: ["qwen3-4b-instruct-2507-q4km"], contextTokens: 2048 }
const FACTS = { lessonStep: { name: "Training text", selectedPair: { first: "h", next: "e", count: 4 } } }
const CALCS = ["'h' followed by 'e' occurs 4 times in the training text.", "'h' starts 5 pairs in all.", "P(e | h) = 4 ÷ 5 = 0.8"]

const press = async (name: RegExp, root: HTMLElement = document.body) => { await act(async () => { fireEvent.click(within(root).getAllByRole("button", { name })[0]) }) }
const panel = () => screen.getByTestId("stage-explanation")

async function openPage() {
  render(<GlossaryProvider><CheckpointProvider><Journey /></CheckpointProvider></GlossaryProvider>)
  await screen.findByTestId("stage-canvas")
}
/** On a narrow screen (as in these tests) the learning panel opens full screen, here on its tutor tab. */
async function openPanel() {
  await press(/^ask your tutor$/i)
  await screen.findByTestId("ai-model")
}
/** Ask for an explanation and stream a whole answer. */
async function explain(text = "4 of the 5 pairs after h are he.") {
  await press(/^explain this step$/i, panel())
  const call = calls.at(-1)!
  await act(async () => {
    call.emit({ type: "start", conversation: "a1", key: "k", action: "explain", turn: 1, maxTurns: 4, model: READY.model, url: READY.url, maxTokens: 300, facts: FACTS, calculations: CALCS })
    call.emit({ type: "delta", text: text.slice(0, 10) })
    call.emit({ type: "delta", text: text.slice(10) })
    call.emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 630, total: 4360 }, turns: 1, maxTurns: 4, empty: false })
    call.finish()
  })
  return call
}

beforeEach(() => { actions.reset(); calls.length = 0; status.mockReset(); status.mockResolvedValue(READY) })
afterEach(() => cleanup())

describe("Ask local AI", () => {
  it("never calls the model on its own: not on page load, not when the section opens", async () => {
    await openPage()
    expect(status).not.toHaveBeenCalled()
    // Opening the written explanation, and expanding views, doesn't ask the model anything.
    await press(/^understand this step$/i)
    expect(status).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(within(panel()).getByRole("tab", { name: /ask your tutor/i })) })
    await screen.findByTestId("ai-model")
    expect(status).toHaveBeenCalledTimes(1) // a listing of models, not a generation
    expect(calls).toHaveLength(0)
    expect(within(panel()).getByText(/experimental and can be wrong/i)).toBeTruthy()
  })

  it("sends the run and selection, not numbers, and labels the streamed answer as experimental AI", async () => {
    await openPage()
    await openPanel()
    const call = await explain()
    expect(call.body.run).toEqual({ corpus: "example", fingerprint: EX.corpus.fingerprint, prompt: "a cat sat on th", length: 10, seed: 2 })
    expect(call.body.focus).toEqual({ stage: "text", pair: [EX.generation.steps[0].context, EX.generation.steps[0].token] })
    expect(call.body.conversation).toBeUndefined()
    const turn = screen.getByTestId("ai-turn")
    expect(turn.dataset.state).toBe("done")
    expect(within(turn).getByText("Experimental AI explanation")).toBeTruthy()
    // The engine's own numbers sit apart from the AI text, labelled as the engine's, with the caveat.
    const engine = screen.getByTestId("ai-engine-numbers")
    expect(within(engine).getByText("Your model")).toBeTruthy()
    expect(engine.textContent).toContain("P(e | h) = 4 ÷ 5 = 0.8")
    expect(engine.textContent).toMatch(/may still misuse them/)
    expect(turn.contains(engine)).toBe(false)
    expect(within(panel()).getByText(/the written explanation in “understand this step” is the reference/i)).toBeTruthy()
    expect(screen.getByTestId("ai-text").textContent).toBe("4 of the 5 pairs after h are he.")
    expect(screen.getByTestId("ai-timing").textContent).toMatch(/0\.63 s.*4\.36 s/)
    expect(screen.getByTestId("ai-facts").textContent).toContain('"count": 4')
  })

  it("continues the same conversation for a follow-up on the same selection", async () => {
    await openPage()
    await openPanel()
    await explain()
    await press(/^explain it more simply$/i, panel())
    expect(calls.at(-1)!.body).toMatchObject({ action: "simpler", conversation: "a1" })
  })

  it("marks an answer as belonging to the earlier experiment when the selection changes, and starts anew only on request", async () => {
    await openPage()
    await openPanel()
    await explain()
    // Pick a different pair from the common pairs.
    const pairs = within(screen.getByTestId("stage-canvas")).getAllByRole("button", { pressed: false })
    await act(async () => { fireEvent.click(pairs[0]) })
    const conv = screen.getByTestId("ai-conversation")
    expect(conv.dataset.current).toBe("false")
    expect(screen.getByTestId("ai-stale").textContent).toMatch(/earlier experiment/i)
    expect(screen.getByTestId("ai-text").textContent).toBe("4 of the 5 pairs after h are he.") // kept, not relabelled
    expect(within(panel()).getByText(/new conversation about the step on screen/i)).toBeTruthy()
    await press(/^explain this step$/i, panel())
    expect(calls.at(-1)!.body.conversation).toBeUndefined()
  })

  it("shows a stopped model as a failure with a next step, and the written explanation stays", async () => {
    await openPage()
    await openPanel()
    await press(/^explain this step$/i, panel())
    await act(async () => { calls[0].fail(new ApiError("not reachable", "ai_unavailable", 503)) })
    const turn = screen.getByTestId("ai-turn")
    expect(turn.dataset.state).toBe("failed")
    expect(within(turn).getByRole("alert").textContent).toMatch(/isn't running.*start colibri/i)
    expect(within(turn).getByRole("button", { name: /try again/i })).toBeTruthy()
    expect(screen.getByTestId("ai-down")).toBeTruthy()
    expect(screen.getByTestId("explanation-body").textContent!.length).toBeGreaterThan(50)
  })

  it("an error in the middle of a stream keeps the text so far and says what happened", async () => {
    await openPage()
    await openPanel()
    await press(/^explain this step$/i, panel())
    await act(async () => {
      calls[0].emit({ type: "start", conversation: "a1", key: "k", action: "explain", turn: 1, maxTurns: 4, model: READY.model, url: READY.url, maxTokens: 300, facts: FACTS, calculations: CALCS })
      calls[0].emit({ type: "delta", text: "Half an ans" })
      calls[0].emit({ type: "error", code: "ai_timeout", message: "Colibri sent nothing for 60 s" })
      calls[0].finish()
    })
    expect(screen.getByTestId("ai-turn").dataset.state).toBe("failed")
    expect(screen.getByTestId("ai-text").textContent).toBe("Half an ans")
    expect(screen.getByRole("alert").textContent).toMatch(/took too long/i)
  })

  it("Stop cancels the request and keeps the partial answer, marked as stopped", async () => {
    await openPage()
    await openPanel()
    await press(/^explain this step$/i, panel())
    await act(async () => {
      calls[0].emit({ type: "start", conversation: "a1", key: "k", action: "explain", turn: 1, maxTurns: 4, model: READY.model, url: READY.url, maxTokens: 300, facts: FACTS, calculations: CALCS })
      calls[0].emit({ type: "delta", text: "The pair h" })
    })
    await press(/^stop$/i, panel())
    expect(calls[0].signal.aborted).toBe(true)
    const turn = screen.getByTestId("ai-turn")
    expect(turn.dataset.state).toBe("stopped")
    expect(screen.getByTestId("ai-text").textContent).toBe("The pair h")
    expect(within(turn).getByText(/stopped/i)).toBeTruthy()
    // Try again replaces the stopped answer instead of adding a second one.
    await press(/try again/i, turn)
    expect(calls).toHaveLength(2)
    expect(screen.getAllByTestId("ai-turn")).toHaveLength(1)
  })

  it("is off while a checkpoint question is open, stops a running answer, and comes back after", async () => {
    await openPage()
    await openPanel()
    await press(/^explain this step$/i, panel())
    expect(calls[0].signal.aborted).toBe(false)
    // Leaving step 2 opens its checkpoint question.
    await press(/^next: count pairs/i)
    await press(/^next: read the context/i)
    expect(screen.getByTestId("checkpoint-dialog")).toBeTruthy()
    expect(calls[0].signal.aborted).toBe(true)
    expect(screen.getByTestId("ai-locked").textContent).toMatch(/get a hint.*show the solution/i)
    expect(screen.queryByTestId("ai-actions")).toBeNull()
    expect(screen.queryByTestId("ai-turn")).toBeNull() // earlier answers are hidden too
    // Minimised to revisit the lesson: still a question in progress, still off.
    await press(/revisit this step/i, screen.getByTestId("checkpoint-dialog"))
    expect(screen.queryByTestId("checkpoint-dialog")).toBeNull()
    expect(screen.getByTestId("ai-locked")).toBeTruthy()
    expect(calls).toHaveLength(1)
    // Closing the checkpoint gives it back.
    await press(/close it/i)
    expect(screen.queryByTestId("ai-locked")).toBeNull()
    expect(screen.getByTestId("ai-actions")).toBeTruthy()
  })
})
