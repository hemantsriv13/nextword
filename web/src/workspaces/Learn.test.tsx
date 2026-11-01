// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { AssistEvent } from "@/lib/assist"
import type { LessonResult } from "@/lib/lessons"

// The backend's lesson results are mocked at the client, with the shapes nextword/lab/lessons.py returns.
const RESULT = (lesson: string, example: number): LessonResult => ({
  lesson, example, examples: 3, engine: "bigram",
  text: example === 0 ? "the cat" : "hello", tokens: example === 0 ? ["t", "h", "e", "␣", "c", "a", "t"] : ["h", "e", "l", "l", "o"],
  count: example === 0 ? 7 : 5, distinct: ["t"],
  pairs: [["b", "a"]],
  prediction: { prompt: example === 0 ? "How many characters does “the cat” have?" : "How many characters does “hello” have?", kind: "choice",
    options: example === 0 ? ["6", "7", "2"] : ["4", "5", "1"], answer: example === 0 ? "7" : "5" },
  facts: [example === 0 ? "“the cat” has 7 characters." : "“hello” has 5 characters."],
})
const result = vi.fn((lesson: string, example: number) => Promise.resolve(RESULT(lesson, example)))
vi.mock("@/lib/lessons", async (orig) => ({ ...(await orig<typeof import("@/lib/lessons")>()), lessonResult: (l: string, e: number) => result(l, e) }))
const calls: { body: Record<string, unknown>; emit: (e: AssistEvent) => void; finish: () => void }[] = []
vi.mock("@/lib/assist", async (orig) => ({
  ...(await orig<typeof import("@/lib/assist")>()),
  assistStatus: () => Promise.resolve({ url: "", model: "qwen3-4b-instruct-2507-q4km", available: true, modelServed: true, served: [], contextTokens: 2048, typicalSeconds: 4 }),
  streamAssist: (body: Record<string, unknown>, emit: (e: AssistEvent) => void, signal: AbortSignal) => new Promise<void>((finish, fail) => {
    signal.addEventListener("abort", () => fail(Object.assign(new Error("aborted"), { name: "AbortError" })))
    calls.push({ body, emit, finish })
  }),
}))

const { default: Learn } = await import("./Learn")
const { CheckpointProvider } = await import("@/components/lab/checkpoint")
const { GlossaryProvider } = await import("@/components/lab/glossary")
const { actions, getState } = await import("@/lib/store")

const press = async (name: RegExp, root: HTMLElement = document.body) => { await act(async () => { fireEvent.click(within(root).getAllByRole("button", { name })[0]) }) }
const step = () => screen.getByTestId("lesson-step").dataset.step
/** The step's main button (its label also names the next step, like the stepper's buttons). */
const next = async (label: RegExp) => {
  const b = screen.getByTestId("lesson-primary")
  expect(b.textContent).toMatch(label)
  await act(async () => { fireEvent.click(b) })
}
async function mount() {
  render(<GlossaryProvider><CheckpointProvider><Learn /></CheckpointProvider></GlossaryProvider>)
  await act(async () => { await Promise.resolve() })
}
async function startLesson() {
  await mount()
  await press(/Start with lesson 1/)
  await screen.findByTestId("lesson-example")
}

beforeEach(() => { actions.reset(); result.mockClear(); calls.length = 0 })
afterEach(() => cleanup())

describe("Beginner lessons", () => {
  it("asks for a prediction before showing the real result, and saves the place", async () => {
    await startLesson()
    expect(screen.getByTestId("lesson-question").textContent).toBe("What does a language model actually read?")
    expect(screen.queryByTestId("lesson-facts")).toBeNull()
    await next(/Make a prediction/)
    expect(step()).toBe("predict")
    expect((screen.getByTestId("lesson-primary") as HTMLButtonElement).disabled).toBe(true) // a guess first
    await act(async () => { fireEvent.click(screen.getByLabelText("6")) })
    await next(/Show what happened/)
    expect(step()).toBe("result")
    const outcome = screen.getByTestId("lesson-outcome").textContent!
    expect(outcome).toContain("Your prediction: 6")
    expect(outcome).toContain("What the model did: 7")
    expect(outcome).toContain("Not what you predicted")
    expect(screen.getByTestId("lesson-facts").textContent).toContain("“the cat” has 7 characters.")
    expect(getState().lessons.place).toEqual({ lesson: "characters", step: 2, example: 0 })
    // Coming back later (a reload) returns to the same step, with the same prediction.
    cleanup()
    await mount()
    await screen.findByTestId("lesson-outcome")
    expect(step()).toBe("result")
    expect(screen.getByTestId("lesson-outcome").textContent).toContain("Your prediction: 6")
  })

  it("offers simpler wording, what to look at, why it matters, another example and going back", async () => {
    await startLesson()
    await press(/Explain more simply/)
    expect(screen.getByTestId("lesson-help-simpler").textContent).toContain("The model reads one letter at a time.")
    expect(getState().lessons.records.characters.helpUsed).toEqual(["simpler"])
    await press(/What should I look at/)
    expect(screen.getByTestId("lesson-help-look").textContent).toContain("First read the question")
    await press(/Why does this matter/)
    expect(screen.getByTestId("lesson-help-matters").textContent).toContain("Everything later")
    await next(/Make a prediction/)
    await act(async () => { fireEvent.click(screen.getByLabelText("7")) })
    await next(/Show what happened/)
    expect(screen.getByTestId("lesson-outcome").textContent).toContain("Your prediction matched.")
    // A new example after the result goes back to predicting.
    await press(/Show another example/)
    await act(async () => { await Promise.resolve() })
    expect(result).toHaveBeenLastCalledWith("characters", 1)
    expect(step()).toBe("predict")
    expect(screen.getByTestId("lesson-predict").textContent).toContain("“hello”")
    await press(/Go back one step/)
    expect(step()).toBe("question")
  })

  it("opens the tutor only after the prediction, and marks its answer as earlier when the step changes", async () => {
    await startLesson()
    expect(screen.getByTestId("tutor-off").textContent).toContain("opens after you've made your prediction")
    expect(screen.queryByTestId("ask-ai")).toBeNull()
    await next(/Make a prediction/)
    expect(screen.queryByTestId("ask-ai")).toBeNull()
    await act(async () => { fireEvent.click(screen.getByLabelText("7")) })
    await next(/Show what happened/)
    await press(/^ask your tutor$/i)
    await act(async () => { await Promise.resolve() })
    await press(/Explain this step/)
    expect(calls[0].body).toMatchObject({ lesson: { id: "characters", step: "result", example: 0 }, action: "explain" })
    await act(async () => {
      calls[0].emit({ type: "start", conversation: "a1", key: "lesson|characters|0|result", action: "explain", turn: 1, maxTurns: 4, model: "qwen3-4b-instruct-2507-q4km", url: "", maxTokens: 300, facts: {}, calculations: [] })
      calls[0].emit({ type: "delta", text: "Each box is one character." })
      calls[0].emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 300, total: 900 }, turns: 1, maxTurns: 4, empty: false })
      calls[0].finish()
    })
    expect(getState().lessons.records.characters.helpUsed).toContain("tutor")
    await next(/Why did that happen/)
    expect(screen.getByTestId("ai-conversation").dataset.current).toBe("false")
    expect(screen.getByTestId("ai-stale")).toBeTruthy()
  })

  it("names the term after the idea, turns the tutor off for the check, and grades it in the app", async () => {
    await startLesson()
    await next(/Make a prediction/)
    await act(async () => { fireEvent.click(screen.getByLabelText("7")) })
    await next(/Show what happened/)
    await next(/Why did that happen/)
    expect(screen.queryByTestId("lesson-terms")).toBeNull()
    await next(/The word for it/)
    expect(screen.getByTestId("lesson-terms").textContent).toContain("character (token)")
    await next(/Check your understanding/)
    expect(screen.getByTestId("tutor-off")).toBeTruthy()
    expect(screen.queryByTestId("ask-ai")).toBeNull()
    await next(/Start the check/)
    const dialog = await screen.findByTestId("checkpoint-dialog")
    expect(dialog.textContent).toContain("“a dog”") // a different example from the lesson's
    await press(/Get a hint/, dialog)
    await act(async () => { fireEvent.change(within(dialog).getByLabelText("Your answer"), { target: { value: "5" } }) })
    await press(/Submit answer/, dialog)
    expect(screen.getByTestId("checkpoint-dialog").dataset.phase).toBe("passed")
    await press(/Continue to lesson 2/)
    expect(getState().lessons.place).toMatchObject({ lesson: "pairs", step: 0 })
    await press(/All lessons/)
    expect(within(screen.getByTestId("lesson-row-characters")).getByTestId("lesson-status").textContent).toBe("Completed with help")
  })

  it("lets you skip a lesson or its check, and shows each status apart", async () => {
    await mount()
    await press(/Skip: Pairs/)
    expect(within(screen.getByTestId("lesson-row-pairs")).getByTestId("lesson-status").textContent).toBe("Skipped")
    await press(/Open: Characters/)
    await screen.findByTestId("lesson-example")
    await next(/Make a prediction/)
    await act(async () => { fireEvent.click(screen.getByLabelText("7")) })
    for (const b of [/Show what happened/, /Why did that happen/, /The word for it/, /Check your understanding/, /Start the check/]) await next(b)
    await press(/Continue without checking/, await screen.findByTestId("checkpoint-dialog"))
    await press(/All lessons/)
    expect(within(screen.getByTestId("lesson-row-characters")).getByTestId("lesson-status").textContent).toBe("Check skipped")
    expect(within(screen.getByTestId("lesson-row-pairs")).getByTestId("lesson-status").textContent).toBe("Skipped")
  })
})
