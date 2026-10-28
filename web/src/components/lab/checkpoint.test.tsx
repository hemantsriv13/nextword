// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { Journey as JourneyData } from "@/lib/api"
import example from "@/test/journey-example.json"

const EX = example as unknown as JourneyData
const journey = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, journey: (b: unknown) => journey(b), source: () => new Promise(() => {}) } }
})
vi.mock("@/lib/corpora", () => ({ useCorpora: () => ({ corpora: [{ id: "example", name: "Example passage", chars: 69 }], error: undefined, loading: false, refresh: () => {} }) }))

const { default: Journey } = await import("@/workspaces/Journey")
const { CheckpointProvider } = await import("./checkpoint")
const { GlossaryProvider } = await import("./glossary")
const { actions, getState } = await import("@/lib/store")
const { CHECKPOINT_BY_ID, questionFor } = await import("@/lib/checkpoints")

const ctx = { run: { config: { corpus: "example", prompt: "a cat sat on th", length: 10, seed: 2 }, result: EX }, pair: { a: "h", b: "a" }, sel: 0 }
const expected = (id: string, variant = 0) => questionFor(CHECKPOINT_BY_ID.get(id)!, ctx, variant)!

const dialog = () => screen.queryByTestId("checkpoint-dialog")
const position = () => screen.getByTestId("stage-position").textContent
const press = async (name: RegExp, root: HTMLElement = document.body) => { await act(async () => { fireEvent.click(within(root).getAllByRole("button", { name })[0]) }) }
const answer = async (value: string) => {
  await act(async () => { fireEvent.change(within(dialog()!).getByLabelText("Your answer"), { target: { value } }) })
  await press(/^submit answer$/i, dialog()!)
}

async function openAtCountPairs() {
  journey.mockResolvedValue(EX)
  render(<GlossaryProvider><CheckpointProvider><Journey /></CheckpointProvider></GlossaryProvider>)
  await screen.findByTestId("stage-canvas")
  await press(/^next: count pairs/i) // Training text has no checkpoint
  expect(position()).toBe("Step 2 of 6")
  await press(/^next: read the context/i)
}

beforeEach(() => { actions.reset(); journey.mockReset() })
afterEach(() => cleanup())

describe("a checkpoint between sections", () => {
  it("opens on Next, hides the answer, and keeps the lesson in place until it is answered", async () => {
    await openAtCountPairs()
    const d = dialog()!
    expect(within(d).getByRole("heading", { name: "Check your understanding" })).toBeTruthy()
    expect(position()).toBe("Step 2 of 6")
    expect(screen.queryByTestId("checkpoint-solution")).toBeNull()
    expect((within(d).getByRole("button", { name: /^submit answer$/i }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { await new Promise((r) => setTimeout(r, 120)) })
    expect(document.activeElement).toBe(within(d).getByLabelText("Your answer")) // focus starts at the answer
  })

  it("a wrong answer gives specific feedback, does not advance, and reveals nothing", async () => {
    await openAtCountPairs()
    const q = expected("journey.count")
    await answer(String((q.answer as number) + 3))
    expect(screen.getByTestId("checkpoint-feedback").textContent).toMatch(/^Not quite yet\. Revisit the highlighted places/)
    expect(screen.getByRole("status").textContent).toMatch(/Not quite yet/) // announced
    expect(dialog()!.textContent).not.toContain(q.solution.working)
    expect(position()).toBe("Step 2 of 6")
    expect(getState().checkpoints["journey.count"].attempts.at(-1)!.outcome).toBe("wrong")
  })

  it("hints come one at a time, on request, and never include the solution", async () => {
    await openAtCountPairs()
    const q = expected("journey.count")
    await press(/^get a hint$/i, dialog()!)
    expect(within(dialog()!).getByText(/Hint 1 of 3\./)).toBeTruthy()
    expect(within(dialog()!).queryByText(/Hint 2 of 3\./)).toBeNull()
    await press(/^another hint$/i, dialog()!)
    await press(/^another hint$/i, dialog()!)
    expect(within(dialog()!).getByText(/Hint 3 of 3\./)).toBeTruthy()
    expect(within(dialog()!).queryByRole("button", { name: /another hint/i })).toBeNull()
    expect(screen.queryByTestId("checkpoint-solution")).toBeNull()
    await answer(String(q.answer))
    expect(within(dialog()!).getByRole("heading", { name: "Passed with hints" })).toBeTruthy()
    expect(getState().checkpoints["journey.count"].passedWithHints).toBe(true)
  })

  it("Revisit keeps the place and the hints; Return to checkpoint brings it back", async () => {
    await openAtCountPairs()
    await press(/^get a hint$/i, dialog()!)
    await press(/^revisit this step$/i, dialog()!)
    expect(dialog()).toBeNull()
    expect(screen.getByTestId("checkpoint-waiting").textContent).toMatch(/Checkpoint waiting: Count pairs/)
    expect(position()).toBe("Step 2 of 6")
    await press(/^return to checkpoint$/i)
    expect(within(dialog()!).getByText(/Hint 1 of 3\./)).toBeTruthy()
  })

  it("the solution shows only when asked; answering it then is not a pass, and a fresh question can be", async () => {
    await openAtCountPairs()
    const q = expected("journey.count")
    await press(/^show the solution$/i, dialog()!)
    const sol = screen.getByTestId("checkpoint-solution")
    expect(sol.textContent).toContain(`Answer: ${q.answer}`)
    expect(sol.textContent).toContain(q.solution.working)
    expect(getState().checkpoints["journey.count"].solutionViewed).toBeTruthy()
    await press(/^try a new question$/i, dialog()!)
    const fresh = expected("journey.count", q.variant + 1)
    expect(dialog()!.textContent).toContain(fresh.prompt)
    await answer(String(fresh.answer))
    expect(within(dialog()!).getByRole("heading", { name: "Checkpoint passed" })).toBeTruthy()
    expect(screen.getByTestId("checkpoint-passed").textContent).toContain(fresh.passed)
    expect(screen.getByRole("img", { name: /pixel-art character cheering/i })).toBeTruthy()
    expect(position()).toBe("Step 2 of 6") // the success message waits to be read
    await press(/^continue to read the context/i, dialog()!)
    expect(position()).toBe("Step 3 of 6")
  })

  it("Stay here keeps the stage; a passed checkpoint no longer stops Next; Retake asks again", async () => {
    await openAtCountPairs()
    await answer(String(expected("journey.count").answer))
    await press(/^stay here$/i, dialog()!)
    expect(dialog()).toBeNull()
    expect(position()).toBe("Step 2 of 6")
    expect(screen.getByTestId("checkpoint-status").textContent).toMatch(/Checkpoint for this section: Passed/)
    await press(/^next: read the context/i)
    expect(position()).toBe("Step 3 of 6") // no second checkpoint for a passed section
    await press(/^back$/i)
    await press(/^retake checkpoint$/i)
    expect(within(dialog()!).getByText(/retake/)).toBeTruthy()
  })

  it("Continue without checking advances but is recorded as a skip, and asks again next time", async () => {
    await openAtCountPairs()
    await press(/^continue without checking/i, dialog()!)
    expect(position()).toBe("Step 3 of 6")
    expect(getState().checkpoints["journey.count"].skipped).toBeTruthy()
    expect(getState().checkpoints["journey.count"].passed).toBeUndefined()
    await press(/^back$/i)
    await press(/^next: read the context/i)
    expect(dialog()).toBeTruthy()
  })

  it("Escape returns to the lesson without advancing or recording a pass", async () => {
    await openAtCountPairs()
    await act(async () => { fireEvent.keyDown(dialog()!, { key: "Escape" }) })
    expect(dialog()).toBeNull()
    expect(position()).toBe("Step 2 of 6")
    expect(getState().checkpoints["journey.count"]?.passed).toBeUndefined()
  })

  it("Enter submits from the keyboard, and a choice question works with radio buttons", async () => {
    await openAtCountPairs()
    await act(async () => { fireEvent.change(within(dialog()!).getByLabelText("Your answer"), { target: { value: String(expected("journey.count").answer) } }) })
    await act(async () => { fireEvent.submit(within(dialog()!).getByLabelText("Your answer").closest("form")!) })
    await press(/^continue to read the context/i, dialog()!)
    await press(/^next: calculate probabilities/i)
    const q = expected("journey.context")
    const right = q.choices!.find((c) => c.id === q.answer)!
    await act(async () => { fireEvent.click(within(dialog()!).getByRole("radio", { name: right.label })) })
    await press(/^submit answer$/i, dialog()!)
    expect(screen.getByTestId("checkpoint-passed").textContent).toContain("You identified the context used for the next prediction.")
  })

  it("progress is in the exported data and can be reset on its own", async () => {
    await openAtCountPairs()
    await answer(String(expected("journey.count").answer))
    const exported = JSON.parse(actions.exportJson())
    expect(exported.checkpoints["journey.count"].passed).toBeTruthy()
    expect(exported.checkpoints["journey.count"].attempts[0].question).toMatch(/^journey\.count@1#/)
    const notes = getState().notes.length
    actions.resetCheckpoints()
    expect(getState().checkpoints).toEqual({})
    expect(getState().notes.length).toBe(notes)
    actions.importJson(JSON.stringify(exported))
    expect(getState().checkpoints["journey.count"].passed).toBeTruthy()
    expect(journey).toHaveBeenCalledTimes(1) // the checkpoint asked the engine for nothing
  })
})

describe("a checkpoint inside a workspace walkthrough", () => {
  it("stops Next on its step, labels the worked example, and continues the walkthrough after a pass", async () => {
    const { Teach, WorkspaceGuide } = await import("./teach")
    const { Panel } = await import("./layout")
    const guide = {
      question: "q", scope: "s", sources: ["simulation" as const], nodes: [],
      tour: [
        { target: "pa", title: "Scores", checkpoint: "attention.mask", plain: <p>Scores step</p> },
        { target: "pb", title: "Output", plain: <p>Output step</p> },
      ],
    }
    render(<GlossaryProvider><CheckpointProvider><Teach guide={guide}><WorkspaceGuide /><Panel id="pa" title="A">a</Panel><Panel id="pb" title="B">b</Panel></Teach></CheckpointProvider></GlossaryProvider>)
    await press(/^read and watch$/i)
    await press(/^next: output/i, screen.getByTestId("tour-card"))
    const d = dialog()!
    expect(d.textContent).toMatch(/Worked example/)
    expect(d.textContent).toMatch(/causal mask on/)
    await act(async () => { fireEvent.click(within(d).getByRole("radio", { name: "Exactly 0" })) })
    await press(/^submit answer$/i, d)
    await press(/^continue to output/i, dialog()!)
    expect(screen.getByTestId("tour-card").textContent).toContain("Output step")
  })
})
