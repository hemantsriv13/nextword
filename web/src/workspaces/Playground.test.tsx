// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import { fakeGeneration } from "@/test/fixtures"

const generate = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, generate: (b: unknown) => generate(b), source: () => new Promise(() => {}) } }
})
vi.mock("@/lib/corpora", () => ({
  useCorpora: () => ({ corpora: [{ id: "sample", name: "Sample passage", chars: 1167 }], error: undefined, loading: false, refresh: () => {} }),
}))

const { default: Playground } = await import("./Playground")
const { actions } = await import("@/lib/store")

/** Answer the next generate request with these tokens, echoing its own settings like the backend does. */
const answerWith = (prompt: string, tokens: string[]) =>
  generate.mockImplementationOnce((b: { prompt: string; seed: number; length: number }) => Promise.resolve(fakeGeneration(prompt, tokens, { seed: b.seed, length: b.length })))

const line = () => screen.getByTestId("prompt-and-suggestion")
/** The line as a sighted reader sees it: without the screen-reader-only role notes. */
const seen = () => { const c = line().cloneNode(true) as HTMLElement; c.querySelectorAll(".sr-only").forEach((n) => n.remove()); return c.textContent }
/** The visible character carrying each role, in page order (spaces shown as ␣). */
const marks = () => [...line().querySelectorAll("mark")].map((m) => `${m.dataset.role}=${m.firstChild!.textContent}`)
const editor = () => screen.getByLabelText("Your text", { selector: "textarea" }) as HTMLTextAreaElement
const typeInto = (value: string) => fireEvent.change(editor(), { target: { value } })
const click = (name: RegExp) => act(async () => { fireEvent.click(screen.getAllByRole("button", { name })[0]) })

beforeEach(() => { actions.reset(); generate.mockReset() })
afterEach(() => cleanup())

describe("Playground context highlight follows the trace", () => {
  it("before generating, the prompt's last character is the next prediction's context", () => {
    render(<Playground />)
    expect(marks()).toEqual(["next-context=n"])
  })

  it("after a full suggestion, the step context and the next prediction's context are different characters", async () => {
    answerWith("ab", ["c", "d", "e"])
    render(<Playground />)
    typeInto("ab")
    await click(/^suggest$/i)
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: "ab" }))
    expect(seen()).toBe("abcde")
    // Latest step (3) read "d" and chose "e"; the next prediction reads "e", not the prompt's "b".
    expect(marks()).toEqual(["step-context=d", "step-choice next-context=e"])
    expect(screen.getByText(/context step 3 read/i, { ignore: ".sr-only" })).toBeTruthy() // the legend
  })

  it("choosing an earlier step in the trace moves the step highlight but not the next-prediction one", async () => {
    answerWith("ab", ["c", "d", "e"])
    render(<Playground />)
    typeInto("ab")
    await click(/^suggest$/i)
    await click(/show step 1/i)
    expect(marks()).toEqual(["step-context=b", "step-choice=c", "next-context=e"])
    expect(screen.getByRole("heading", { name: /step 1: after/i }).textContent).toContain("b")
  })

  it("stepping reveals one trace token at a time and keeps the highlight on the latest step", async () => {
    answerWith("ab", ["c", "d", "e"])
    render(<Playground />)
    typeInto("ab")
    await click(/^step$/i)
    expect(marks()).toEqual(["step-context=b", "step-choice next-context=c"])
    await click(/^step$/i)
    expect(marks()).toEqual(["step-context=c", "step-choice next-context=d"])
    expect(generate).toHaveBeenCalledTimes(1) // stepping replays the same trace
  })

  it("editing the prompt makes the trace stale: it is hidden and the highlight returns to the new last character", async () => {
    answerWith("ab", ["c", "d", "e"])
    render(<Playground />)
    typeInto("ab")
    await click(/^suggest$/i)
    typeInto("abz")
    expect(marks()).toEqual(["next-context=z"])
    expect(seen()).toBe("abz")
    expect(screen.getByText(/trace hidden: it came from earlier settings/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /show step 1/i })).toBeNull()
    expect((screen.getByRole("button", { name: /^accept/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("Playground keeps emoji whole", () => {
  it("highlights an emoji context, reveals emoji tokens, and Accept appends them intact", async () => {
    answerWith("rain 🌧", ["🌈", " ", "😀"])
    render(<Playground />)
    typeInto("rain 🌧")
    expect(marks()).toEqual(["next-context=🌧"])
    await click(/^step$/i)
    expect(marks()).toEqual(["step-context=🌧", "step-choice next-context=🌈"])
    await click(/^accept$/i)
    expect(editor().value).toBe("rain 🌧🌈")
  })
})

describe("comparison results keep the mode and settings that produced them", () => {
  it("switching Prompt differs → Seed differs without rerunning does not relabel the old results", async () => {
    generate.mockImplementation((b: { prompt: string; seed: number; length: number }) =>
      Promise.resolve(fakeGeneration(b.prompt, ["x", "y"], { seed: b.seed, length: b.length })))
    render(<Playground />)
    await click(/^run both$/i)
    const settings = () => screen.getByTestId("compare-settings").textContent
    expect(settings()).toMatch(/different-prompt, same-seed/)
    expect(screen.getByText(/A ends in/)).toBeTruthy() // the observation for this run

    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /seed differs/i })) })
    // Still described as what it was; marked stale; no same-prompt/different-seed reading of it.
    expect(settings()).toMatch(/different-prompt, same-seed/)
    expect(settings()).toContain("“The rain”")
    expect(settings()).toContain("“Spain”")
    expect(screen.getByText(/settings changed since this comparison \(what differs\)/i)).toBeTruthy()
    expect(screen.queryByText(/Same prompt, seeds/)).toBeNull()
    expect(screen.queryByText(/A ends in/)).toBeNull()
    expect(generate).toHaveBeenCalledTimes(2)

    await click(/^run both$/i)
    expect(settings()).toMatch(/same-prompt, different-seed/)
    expect(screen.queryByText(/settings changed since this comparison/i)).toBeNull()
    expect(screen.getByText(/Same prompt, seeds 1 and 2/)).toBeTruthy()
  })
})
