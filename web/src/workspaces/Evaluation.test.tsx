// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { deferred } from "@/test/setup-dom"
import type { Evaluation as EvalResult } from "@/lib/api"

const evaluate = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, evaluate: (b: unknown) => evaluate(b) } }
})
vi.mock("@/lib/corpora", () => ({
  useCorpora: () => ({ corpora: [{ id: "sample", name: "Sample passage", chars: 1167 }, { id: "upload-c1", name: "My notes", chars: 500 }], error: undefined, loading: false, refresh: () => {} }),
}))

const { default: Evaluation } = await import("./Evaluation")
const { actions, getState } = await import("@/lib/store")
const { useSnapshotRun } = await import("@/lib/evaluation")
const result_ = (k: number, nll: number | null) => result(k, nll)

function result(k: number, nll: number | null, fingerprint = "aaaa1111"): EvalResult {
  return { split: { train: 933, val: 117, test: 117, bounds: [933, 1050] }, on: "val", k, targets: 116, unseenContext: 2, unseenPair: 9, meanNll: nll, meanNllCovered: 2.1, covered: 105, perplexity: nll === null ? null : Math.exp(nll), uniformBaselineNll: 3.66, vocabularyWithUnknown: 39, examples: [], truncated: false, modelVersion: "char-bigram@test", corpusFingerprint: fingerprint }
}

const sliders = () => [...document.querySelectorAll<HTMLInputElement>("input[type=range]")]
// Order on the page: training share, validation share, smoothing k (then the sweep has none).
const setSlider = (i: number, value: number) => fireEvent.change(sliders()[i], { target: { value: String(value) } })
const clickButton = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }))

beforeEach(() => { actions.reset(); evaluate.mockReset() })
afterEach(() => cleanup())

describe("Evaluation bench keeps results with the settings that produced them", () => {
  it("saving after changing k (without measuring again) saves k = 0, and marks the result stale", async () => {
    evaluate.mockResolvedValueOnce(result(0, null))
    render(<Evaluation />)
    await act(async () => clickButton(/measure on validation/i))
    expect(screen.getByTestId("result-settings").textContent).toContain("k 0")

    setSlider(2, 1)
    expect(screen.getByText(/settings changed since this run \(smoothing k\)/i)).toBeTruthy()
    expect(screen.getByTestId("result-settings").textContent).toContain("k 0")

    clickButton(/^save run$/i)
    const saved = getState().experiments[0]
    expect(saved.config.k).toBe(0)
    expect(saved.result.meanNll).toBeNull()
  })

  it("a request in flight keeps its own settings when the controls change before it returns", async () => {
    const pending = deferred<EvalResult>()
    evaluate.mockReturnValueOnce(pending.promise)
    render(<Evaluation />)
    await act(async () => clickButton(/measure on validation/i))
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ k: 0, train: 0.8, val: 0.1, on: "val" }))

    setSlider(2, 1.5) // smoothing
    setSlider(0, 0.7) // split
    await act(async () => pending.resolve(result(0, 2.6)))

    const label = screen.getByTestId("result-settings").textContent!
    expect(label).toContain("k 0")
    expect(label).toContain("80% / 10% / 10%")
    expect(screen.getByText(/settings changed since this run \(split, smoothing k\)/i)).toBeTruthy()
    clickButton(/^save run$/i)
    expect(getState().experiments[0].config).toEqual({ corpus: "sample", train: 0.8, val: 0.1, on: "val", k: 0 })
  })

  it("a slower, older request can't overwrite a newer result, even when it resolves last", async () => {
    // The button is disabled while measuring, so two requests can only overlap through the hook
    // itself; test it there with two requests in flight at once.
    const older = deferred<EvalResult>()
    const newer = deferred<EvalResult>()
    const request = vi.fn<(c: { corpus: string; train: number; val: number; on: "val" | "test"; k: number }) => Promise<EvalResult>>().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { result } = renderHook(() => useSnapshotRun(request))
    let a: Promise<unknown>, b: Promise<unknown>
    act(() => { a = result.current.start({ corpus: "sample", train: 0.8, val: 0.1, on: "val", k: 0 }) })
    act(() => { b = result.current.start({ corpus: "sample", train: 0.8, val: 0.1, on: "val", k: 1 }) })
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => { newer.resolve(result_(1, 2.68)); await b })
    expect(result.current.run?.config.k).toBe(1)
    await act(async () => { older.resolve(result_(0, null)); await a })
    expect(result.current.run?.config.k).toBe(1)
    expect(result.current.run?.result.meanNll).toBe(2.68)
    expect(result.current.pending).toBeNull()
  })

  it("changing the training text after measuring is reported, and the save keeps the measured text", async () => {
    evaluate.mockResolvedValueOnce(result(0, null))
    render(<Evaluation />)
    await act(async () => clickButton(/measure on validation/i))
    // Pick "My notes" in the training-text select.
    const user = userEvent.setup()
    await user.click(screen.getAllByRole("combobox")[0])
    await user.click(await screen.findByRole("option", { name: "My notes" }))
    expect(screen.getByText(/settings changed since this run \(training text\)/i)).toBeTruthy()
    clickButton(/^save run$/i)
    expect(getState().experiments[0].config.corpus).toBe("sample")
  })
})

describe("the smoothing sweep tunes on validation only", () => {
  it("with Measure on = Test, every sweep request still uses validation", async () => {
    evaluate.mockImplementation((b: { k: number }) => Promise.resolve(result(b.k, b.k === 0 ? null : 2.5 + b.k / 10)))
    render(<Evaluation />)
    fireEvent.click(screen.getByRole("radio", { name: /test \(final check\)/i }))
    expect(screen.getByText(/the sweep still uses validation/i)).toBeTruthy()
    await act(async () => clickButton(/run the k sweep on validation/i))
    expect(evaluate).toHaveBeenCalledTimes(8)
    for (const [body] of evaluate.mock.calls) expect(body.on).toBe("val")
    expect(screen.getByTestId("sweep-conclusion").textContent).toMatch(/lowest validation loss at k = 0\.01/i)
  })

  it("its labels keep describing the sweep's own settings after the controls change", async () => {
    evaluate.mockImplementation((b: { k: number }) => Promise.resolve(result(b.k, b.k === 0 ? null : 2.5 + b.k / 10)))
    render(<Evaluation />)
    await act(async () => clickButton(/run the k sweep on validation/i))
    const before = screen.getByTestId("sweep-settings").textContent
    setSlider(0, 0.6)
    expect(screen.getByTestId("sweep-settings").textContent).toBe(before)
    expect(before).toContain("80% / 10% / 10%")
    const panel = screen.getByTestId("sweep-settings").closest("section")!
    expect(within(panel).getByText(/controls have changed since this sweep/i)).toBeTruthy()
  })

  it("an invalid split blocks the sweep before any request", async () => {
    render(<Evaluation />)
    setSlider(0, 0.9)
    setSlider(1, 0.1)
    expect(screen.getAllByText(/leave at least 1% of the text for the test split/i).length).toBeGreaterThan(0)
    expect((screen.getByRole("button", { name: /run the k sweep on validation/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(evaluate).not.toHaveBeenCalled()
  })
})
