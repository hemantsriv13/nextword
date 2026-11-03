// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { AssistEvent } from "@/lib/assist"
import type { Inspection, MlpRun, MlpStatus } from "@/lib/mlp"

// The MLP backend is mocked at the page's client; these values have the backend's shapes.
const RUN = (id: string, fp: string): MlpRun => ({
  id, state: "done", error: null, step: 300, config: { context: 2, embed: 4, hidden: 16, steps: 300, batch: 32, lr: 0.5, seed: 3 },
  corpus: { id: "sample", name: "Sample passage", fingerprint: "aaaa1111", chars: 600 }, created: 0,
  split: { train: 480, val: 60, test: 60, bounds: [480, 540] }, examples: { train: 480, val: 59, test: 59 },
  vocab: ["⟨start⟩", "⟨?⟩", "a", "b", "c"], vocabSize: 5, params: 200,
  curve: [{ step: 0, train: 1.61, val: 1.61 }, { step: 300, train: 0.02, val: 0.02 }], msPerStep: 0.5, trainSeconds: 0.2,
  fingerprints: { initial: "init00000000", trained: fp }, samples: { initial: "cbacc", trained: "abcab" },
  predictions: [{ window: ["a", "b"], target: "c", initial: { pTarget: 0.2, top: [] }, trained: { pTarget: 0.99, top: [] } }], engine: "PyTorch (CPU)",
})
const INS = (fp: string, index = 0): Inspection => ({
  run: "m1", checkpoint: "trained", fingerprint: fp, split: "train", index, examples: 480, window: ["a", "b"], target: "c",
  embeddings: [[0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]], joined: { values: [0.1, 0.2], size: 8, shown: 2 },
  hiddenBefore: { values: [0.5, -2], size: 16, shown: 2 }, hidden: { values: [0.46, -0.96], size: 16, shown: 2 }, hiddenStats: { size: 16, saturated: 1 },
  logits: { top: [{ token: "c", logit: 5 }], target: 5, size: 5 }, probs: { top: [{ token: "c", p: 0.9 }, { token: "a", p: 0.05 }], target: 0.9, sum: 1, uniform: 0.2 },
  loss: 0.10536, uniformLoss: 1.60944,
  update: { lr: 0.5, gradNorms: { "emb.weight": 0.01 }, embedding: { token: "a", before: [0.1, 0.2, 0.3, 0.4], grad: [0.02, -0.01, 0, 0.01], after: [0.09, 0.205, 0.3, 0.395] },
    outputRow: { token: "c", before: [0.1], grad: [-0.05], after: [0.125], size: 16 }, pTargetAfter: 0.91, lossAfter: 0.0943 },
  model: { context: 2, embed: 4, hidden: 16, vocab: 5, params: 200 },
})
const STATUS: MlpStatus = { available: true, error: null, torch: "2.15.0+cpu", threads: 2, limits: null, defaults: null, training: null, saved: [{ id: "m1", state: "done", step: 300, config: RUN("m1", "x").config, corpus: { name: "Sample passage" }, created: 0 }] }

const api = {
  status: vi.fn(), run: vi.fn(), start: vi.fn(), stop: vi.fn(), reset: vi.fn(), inspect: vi.fn(),
  examples: vi.fn(), generate: vi.fn(), compare: vi.fn(), resume: vi.fn(),
}
vi.mock("@/lib/mlp", async (orig) => ({ ...(await orig<typeof import("@/lib/mlp")>()), mlpApi: api }))
vi.mock("@/lib/corpora", () => ({ useCorpora: () => ({ corpora: [{ id: "sample", name: "Sample passage", chars: 600 }], error: undefined, loading: false, refresh: () => {} }) }))
const calls: { body: Record<string, unknown>; emit: (e: AssistEvent) => void; finish: () => void }[] = []
vi.mock("@/lib/assist", async (orig) => ({
  ...(await orig<typeof import("@/lib/assist")>()),
  assistStatus: () => Promise.resolve({ url: "", model: "qwen3.5-9b-q4km", available: true, modelServed: true, served: [], contextTokens: 2048, typicalSeconds: 45 }),
  streamAssist: (body: Record<string, unknown>, emit: (e: AssistEvent) => void, signal: AbortSignal) => new Promise<void>((finish, fail) => {
    signal.addEventListener("abort", () => fail(Object.assign(new Error("aborted"), { name: "AbortError" })))
    calls.push({ body, emit, finish })
  }),
}))

const { default: MlpJourney } = await import("./MlpJourney")
const { CheckpointProvider } = await import("@/components/lab/checkpoint")
const { GlossaryProvider } = await import("@/components/lab/glossary")
const { actions } = await import("@/lib/store")

const press = async (name: RegExp, root: HTMLElement = document.body) => { await act(async () => { fireEvent.click(within(root).getAllByRole("button", { name })[0]) }) }
async function open() {
  render(<GlossaryProvider><CheckpointProvider><MlpJourney /></CheckpointProvider></GlossaryProvider>)
  await screen.findByTestId("mlp-stage-canvas")
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  actions.reset()
  calls.length = 0
  for (const f of Object.values(api)) f.mockReset()
  api.status.mockResolvedValue(STATUS)
  api.run.mockResolvedValue(RUN("m1", "trained11111"))
  api.inspect.mockImplementation((b: { index: number }) => Promise.resolve(INS("trained11111", b.index)))
  api.examples.mockResolvedValue({ total: 480, start: 0, rows: [{ index: 0, window: ["⟨start⟩", "⟨start⟩"], target: "a" }] })
})
afterEach(() => cleanup())

describe("MLP journey", () => {
  it("opens the latest saved run and shows its real values, stage by stage", async () => {
    await open()
    expect(api.run).toHaveBeenCalledWith("m1")
    expect(screen.getByTestId("mlp-progress").textContent).toMatch(/Finished.*300 of 300 updates/)
    await press(/Embeddings/i, screen.getByRole("navigation", { name: "Lesson stages" }))
    expect(screen.getByTestId("mlp-stage-canvas").dataset.stage).toBe("embeddings")
    await press(/Loss/i, screen.getByRole("navigation", { name: "Lesson stages" }))
    expect(screen.getByTestId("mlp-stage-canvas").textContent).toContain("0.1054")
  })

  it("trains, stops and removes runs through the backend", async () => {
    api.start.mockResolvedValue({ ...RUN("m2", "trained22222"), state: "training", step: 0 })
    api.stop.mockResolvedValue({ id: "m2", stopping: true })
    api.reset.mockResolvedValue({ removed: "m2" })
    await open()
    api.run.mockResolvedValue({ ...RUN("m2", "trained22222"), state: "training", step: 10 })
    await press(/^train$/i)
    expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ corpus: "sample", context: 3 }))
    expect(await screen.findByRole("button", { name: /training…/i })).toBeTruthy()
    await press(/^stop$/i)
    expect(api.stop).toHaveBeenCalledWith("m2")
    api.run.mockResolvedValue(RUN("m2", "trained22222"))
    await act(async () => { await new Promise((r) => setTimeout(r, 500)) })
    await press(/remove this run/i)
    expect(api.reset).toHaveBeenCalledWith("m2")
  })

  it("asks a quiz between stages, and the local AI is off while it is open, even minimised", async () => {
    await open()
    await press(/^ask your tutor$/i)
    await press(/Training examples/i, screen.getByRole("navigation", { name: "Lesson stages" }))
    await press(/^next: embeddings/i)
    const dialog = screen.getByTestId("checkpoint-dialog")
    expect(within(dialog).getByRole("heading", { name: "Check your understanding" })).toBeTruthy()
    expect(screen.getByTestId("ai-locked")).toBeTruthy()
    await press(/revisit this step/i, dialog)
    expect(screen.queryByTestId("checkpoint-dialog")).toBeNull()
    expect(screen.getByTestId("ai-locked")).toBeTruthy()
  })

  it("binds AI answers to the weights they were about, and marks them earlier after retraining", async () => {
    await open()
    const panel = screen.getByTestId("mlp-explanation")
    await press(/^ask your tutor$/i)
    await screen.findByTestId("ai-model")
    await press(/^explain this step$/i, panel)
    expect(calls[0].body).toMatchObject({ mlp: { run: "m1", checkpoint: "trained", fingerprint: "trained11111" }, focus: { stage: "text", split: "train", index: 0 } })
    await act(async () => {
      calls[0].emit({ type: "start", conversation: "a1", key: "k", action: "explain", turn: 1, maxTurns: 4, model: "qwen3.5-9b-q4km", url: "", maxTokens: 300, facts: {}, calculations: ["The training part has 480 characters."] })
      calls[0].emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 1, total: 2 }, turns: 1, maxTurns: 4, empty: false })
      calls[0].finish()
    })
    expect(screen.getByTestId("ai-conversation").dataset.current).toBe("true")
    // Retrain: a new run with new weights. The old answer stays, marked as earlier.
    api.start.mockResolvedValue(RUN("m3", "trained33333"))
    api.run.mockResolvedValue(RUN("m3", "trained33333"))
    api.inspect.mockImplementation((b: { index: number }) => Promise.resolve({ ...INS("trained33333", b.index), run: "m3" }))
    await press(/^train$/i)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getByTestId("ai-conversation").dataset.current).toBe("false")
    expect(screen.getByTestId("ai-stale").textContent).toMatch(/earlier experiment.*run m1/)
  })

  it("labels an interrupted run as incomplete and resumes it through the backend", async () => {
    api.run.mockResolvedValue({ ...RUN("m1", "trained11111"), state: "interrupted", step: 120, resumable: true, complete: false })
    api.resume.mockResolvedValue({ ...RUN("m1", "trained11111"), state: "training", step: 120 })
    await open()
    const box = screen.getByTestId("mlp-incomplete")
    expect(box.textContent).toMatch(/Incomplete run: 120 of 300 updates.*Lab closed during training.*continues exactly/)
    expect(screen.getByTestId("mlp-progress").textContent).toMatch(/Interrupted \(incomplete\)/)
    await press(/resume to 300 updates/i, box)
    expect(api.resume).toHaveBeenCalledWith("m1")
  })

  it("offers only a restart when a stopped run can't be resumed exactly", async () => {
    api.run.mockResolvedValue({ ...RUN("m1", "trained11111"), state: "stopped", step: 50, resumable: false })
    api.start.mockResolvedValue(RUN("m4", "trained44444"))
    await open()
    expect(screen.queryByTestId("mlp-resume")).toBeNull()
    await press(/train again from the start/i, screen.getByTestId("mlp-incomplete"))
    expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ corpus: "sample", context: 2, steps: 300, seed: 3 }))
  })

  it("never shows an inspection computed from other weights than the selected checkpoint's", async () => {
    api.inspect.mockImplementation((b: { index: number }) => Promise.resolve(INS("someOtherWts", b.index)))
    await open()
    expect(screen.getByTestId("mlp-stage-canvas").textContent).not.toContain("Sample passage: 600")
    expect(screen.getByLabelText("Asking your MLP")).toBeTruthy()
  })

  it("shows the validation-selected checkpoint and the stated fairness rules in the bigram comparison", async () => {
    api.compare.mockResolvedValue({
      run: "m1", split: "fixed", rule: "same targets", uniform: 1.609, note: "Test numbers are shown once.", best: { step: 150, val: 0.01 },
      policy: { vocabulary: "training characters only", unknown: "one unknown outcome", smoothing: "add-1 for the bigram", selection: "validation only", targets: "same targets" },
      rows: [{ part: "test", targets: 59, unknownTargets: 2, mlp_initial: 1.6, mlp_trained: 0.03, mlp_best: 0.02, bigram: null, bigram_add1: 0.4, bigram_unseen: 2, bigram_targets: 59 }],
    })
    await open()
    await press(/Generation/i, screen.getByRole("navigation", { name: "Lesson stages" }))
    await press(/compare with the bigram/i)
    const table = screen.getByTestId("mlp-compare")
    expect(table.textContent).toMatch(/MLP, selected\(update 150\)/)
    expect(table.textContent).toMatch(/59, 2 unseen/)
    expect(table.textContent).toContain("0.020")
    expect(screen.getByTestId("mlp-compare-policy").textContent).toMatch(/doesn’t have to win/)
  })

  it("lists the eight stages with what each covers, and every stage says what you should see", async () => {
    await open()
    expect(screen.getByTestId("mlp-overview").querySelectorAll("li")).toHaveLength(8)
    for (const name of ["Text", "Training examples", "Embeddings", "Hidden layer", "Predictions", "Loss", "Weight update", "Generation"]) {
      await press(new RegExp(`^\\d?\\s*${name}$`), screen.getByRole("navigation", { name: "Lesson stages" }))
      expect(screen.getByTestId("mlp-expect").textContent!.length).toBeGreaterThan(30)
    }
  })

  it("warns when a tutor answer contains numbers that aren't in the engine's facts", async () => {
    await open()
    const panel = screen.getByTestId("mlp-explanation")
    await press(/^ask your tutor$/i)
    await screen.findByTestId("ai-model")
    await press(/^explain this step$/i, panel)
    await act(async () => {
      calls[0].emit({ type: "start", conversation: "a1", key: "k", action: "explain", turn: 1, maxTurns: 4, model: "m", url: "", maxTokens: 300, facts: {}, calculations: [] })
      calls[0].emit({ type: "delta", text: "The loss is 0.73." })
      calls[0].emit({ type: "done", finish: "stop", timingsMs: { queue: 0, firstText: 1, total: 2 }, turns: 1, maxTurns: 4, empty: false, unverified: ["0.73"] })
      calls[0].finish()
    })
    expect(screen.getByTestId("ai-unverified").textContent).toMatch(/mentions 0\.73, a number not found/)
  })

  it("says when the lesson is complete", async () => {
    await open()
    await press(/Generation/i, screen.getByRole("navigation", { name: "Lesson stages" }))
    await press(/finish the lesson/i)
    expect(screen.getByTestId("mlp-complete").textContent).toMatch(/Lesson complete/)
  })
})
