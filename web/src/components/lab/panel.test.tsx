// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { AssistEvent } from "@/lib/assist"

// The explanation panel's layout behaviour: tabs, Expand, the phone view, and following streamed text.
// The model is mocked at the client, as in the page tests.
const calls: { body: Record<string, unknown>; emit: (e: AssistEvent) => void; finish: () => void }[] = []
const status = vi.fn()
vi.mock("@/lib/assist", async (orig) => ({
  ...(await orig<typeof import("@/lib/assist")>()),
  assistStatus: () => status(),
  streamAssist: (body: Record<string, unknown>, emit: (e: AssistEvent) => void, signal: AbortSignal) => new Promise<void>((finish, fail) => {
    signal.addEventListener("abort", () => fail(Object.assign(new Error("aborted"), { name: "AbortError" })))
    calls.push({ body, emit, finish })
  }),
}))

const { ExplanationPanel } = await import("./explanation")
const { AssistProvider } = await import("./ask-ai")
const { CheckpointProvider, useCheckpoints } = await import("./checkpoint")
const { GlossaryProvider } = await import("./glossary")

const READY = { url: "", model: "qwen3-4b-instruct-2507-q4km", available: true, modelServed: true, served: [], contextTokens: 2048, typicalSeconds: 4 }
const TARGET = { request: { lesson: { id: "pairs", step: "result" as const, example: 0 } }, key: "lesson|pairs|0|result", stage: "lesson-pairs", stageLabel: "Pairs: What happened", describe: "lesson 2" }

let wideScreen = true
function setScreen(wide: boolean) {
  wideScreen = wide
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? wideScreen : false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function QuizButton() {
  const c = useCheckpoints()
  return <button type="button" onClick={() => c?.retake("learn.pairs", {})}>Open a quiz</button>
}

async function mount() {
  render(
    <GlossaryProvider><CheckpointProvider><AssistProvider>
      <QuizButton />
      <ExplanationPanel title="Pairs" testid="panel" tutor={{ target: TARGET }}>
        <p data-testid="written">The written lesson text.</p>
      </ExplanationPanel>
    </AssistProvider></CheckpointProvider></GlossaryProvider>,
  )
  await act(async () => { await Promise.resolve() })
}
const press = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el) }) }
const tab = (name: RegExp) => within(screen.getByTestId("panel")).getByRole("tab", { name })
const scroller = () => screen.getByTestId("panel-scroll")

/** jsdom has no layout: give the scrolling area a size, and let tests move it. */
function fakeScroll(height: { value: number }) {
  const el = scroller()
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 300 })
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => height.value })
  el.scrollTo = vi.fn(({ top }: ScrollToOptions) => { el.scrollTop = top ?? 0 }) as unknown as typeof el.scrollTo
  return el
}
async function stream(text: string, more = true) {
  const c = calls.at(-1)!
  await act(async () => {
    c.emit({ type: "delta", text })
    if (!more) { c.emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 10, total: 20 }, turns: 1, maxTurns: 4, empty: false }); c.finish() }
  })
}
async function startAnswer() {
  await press(tab(/ask your tutor/i))
  await screen.findByTestId("ai-model")
  await press(within(screen.getByTestId("panel-composer")).getByRole("button", { name: /^explain this step$/i }))
  await act(async () => { calls.at(-1)!.emit({ type: "start", conversation: "a1", key: TARGET.key, action: "explain", turn: 1, maxTurns: 4, model: READY.model, url: "", maxTokens: 220, facts: {}, calculations: ["‘b’ → ‘a’"] }) })
}

beforeEach(() => { calls.length = 0; status.mockReset(); status.mockResolvedValue(READY); setScreen(true) })
afterEach(() => cleanup())

describe("explanation panel", () => {
  it("has two labelled tabs; switching keeps the conversation and never asks the model", async () => {
    await mount()
    expect(screen.getByTestId("panel").dataset.panelMode).toBe("sidebar")
    expect(tab(/understand this step/i).getAttribute("aria-selected")).toBe("true")
    expect(status).not.toHaveBeenCalled() // the written tab shows first, and needs no model
    await startAnswer()
    await stream("Each arrow is one pair.", false)
    const asked = calls.length
    await press(tab(/understand this step/i))
    expect(screen.getByTestId("written")).toBeTruthy()
    expect(screen.queryByTestId("panel-composer")).toBeNull() // the question box belongs to the tutor tab
    await press(tab(/ask your tutor/i))
    expect(screen.getByTestId("ai-text").textContent).toBe("Each arrow is one pair.")
    expect(calls.length).toBe(asked)
    expect(status).toHaveBeenCalledTimes(1) // one listing of models, when the tab was first shown
  })

  it("arrow keys move between the tabs", async () => {
    await mount()
    await act(async () => { fireEvent.keyDown(tab(/understand this step/i), { key: "ArrowRight" }) })
    expect(tab(/ask your tutor/i).getAttribute("aria-selected")).toBe("true")
  })

  it("Expand shows the same panel wider, keeps a streaming answer, and Escape returns focus to Expand", async () => {
    await mount()
    await startAnswer()
    await stream("Half an ")
    const before = calls.length
    await press(screen.getByTestId("panel-expand"))
    const panel = screen.getByTestId("panel")
    expect(panel.dataset.panelMode).toBe("expanded")
    expect(panel.getAttribute("role")).toBe("dialog")
    await stream("answer.", false)
    expect(screen.getByTestId("ai-text").textContent).toBe("Half an answer.") // the same stream, still arriving
    expect(calls.length).toBe(before) // expanding asked nothing
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); await new Promise((r) => requestAnimationFrame(r)) })
    expect(screen.getByTestId("panel").dataset.panelMode).toBe("sidebar")
    expect(document.activeElement).toBe(screen.getByTestId("panel-expand"))
  })

  it("follows new text at the bottom, keeps your place after you scroll up, and offers Jump to latest", async () => {
    await mount()
    await startAnswer()
    const height = { value: 1000 }
    const el = fakeScroll(height)
    // At the end: new text is followed.
    el.scrollTop = 700
    await act(async () => { fireEvent.scroll(el) })
    height.value = 1200
    await stream("More text. ")
    expect(el.scrollTop).toBe(1200)
    expect(screen.queryByTestId("ai-jump")).toBeNull()
    // Scrolled up to read: the place is kept and a jump is offered.
    el.scrollTop = 100
    await act(async () => { fireEvent.scroll(el) })
    height.value = 1500
    await stream("Even more. ")
    expect(el.scrollTop).toBe(100)
    await press(screen.getByTestId("ai-jump"))
    expect(el.scrollTo).toHaveBeenCalled()
    expect(el.scrollTop).toBe(1500)
    expect(screen.queryByTestId("ai-jump")).toBeNull()
  })

  it("on a narrow screen opens full screen from a labelled button, and closing returns to it", async () => {
    setScreen(false)
    await mount()
    expect(screen.getByTestId("panel").hidden).toBe(true)
    const open = within(screen.getByTestId("panel-launcher")).getByRole("button", { name: /ask your tutor/i })
    await press(open)
    const panel = screen.getByTestId("panel")
    expect(panel.hidden).toBe(false)
    expect(panel.dataset.panelMode).toBe("fullscreen")
    expect(tab(/ask your tutor/i).getAttribute("aria-selected")).toBe("true")
    await act(async () => { fireEvent.click(screen.getByTestId("panel-close")); await new Promise((r) => requestAnimationFrame(r)) })
    expect(screen.getByTestId("panel").hidden).toBe(true)
    expect(document.activeElement).toBe(open)
    // Escape closes it too, and reopening finds the same tab and content.
    await press(open)
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); await new Promise((r) => requestAnimationFrame(r)) })
    expect(screen.getByTestId("panel").hidden).toBe(true)
    expect(document.activeElement).toBe(open)
  })

  it("says a conversation is full before you ask, when the backend reports no room left", async () => {
    await mount()
    await startAnswer()
    await act(async () => {
      calls.at(-1)!.emit({ type: "delta", text: "A short answer." })
      calls.at(-1)!.emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 1, total: 2 }, turns: 1, maxTurns: 4, empty: false, room: { followup: false, detail: false, simpler: false, example: false, explain: false } })
      calls.at(-1)!.finish()
    })
    const composer = screen.getByTestId("panel-composer")
    expect(within(composer).getByTestId("ai-full")).toBeTruthy()
    expect((within(composer).getByRole("button", { name: /start a new conversation/i }) as HTMLButtonElement).disabled).toBe(false)
    // A detailed answer no longer fits here: it starts a new conversation, and the answer so far stays above it.
    const detail = within(composer).getByRole("button", { name: /explain in more detail \(new conversation\)/i })
    await press(detail)
    expect(calls.at(-1)!.body).toMatchObject({ action: "detail" })
    expect(calls.at(-1)!.body.conversation).toBeUndefined()
    expect(screen.getAllByTestId("ai-turn")).toHaveLength(2)
    expect(screen.getByTestId("ai-new-conversation")).toBeTruthy()
  })

  it("keeps the quiz protection in every view: the tutor is off while a quiz is open", async () => {
    await mount()
    await startAnswer()
    await press(screen.getByTestId("panel-expand"))
    await press(screen.getByRole("button", { name: "Open a quiz" }))
    expect(screen.getByTestId("ai-locked")).toBeTruthy()
    expect(screen.queryByTestId("ai-actions")).toBeNull()
  })
})
