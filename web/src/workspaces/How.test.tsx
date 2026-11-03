// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"

const stream = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, health: () => Promise.reject(new Error("offline")), engines: () => Promise.reject(new Error("offline")) } }
})
vi.mock("@/lib/assist", async (orig) => ({
  ...(await orig<typeof import("@/lib/assist")>()),
  assistStatus: () => Promise.resolve({ url: "", model: "auto", available: false, modelServed: false, served: [], contextTokens: null,
    limits: { contextTokens: 2048, maxTurns: 4, maxTokens: { explain: 220, detail: 420, followup: 220 }, maxQuestionChars: 300, temperature: 0, readTimeoutSeconds: 60, totalTimeoutSeconds: 120 } }),
  streamAssist: (...a: unknown[]) => stream(...a),
}))
vi.mock("@/lib/mlp", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlp")>()),
  mlpApi: { status: () => Promise.resolve({ available: true, error: null, torch: "2.15.0+cpu", threads: 2, training: null, saved: [],
    defaults: { context: 3, embed: 8, hidden: 64, steps: 2000, batch: 32, lr: 0.1, seed: 1 },
    limits: { context: [1, 8], embed: [2, 32], hidden: [4, 256], steps: [1, 20000], batch: [1, 512], lr: [0.001, 2], seed: [0, 2147483647] } }) },
}))
vi.mock("@/lib/corpora", () => ({ useCorpora: () => ({ corpora: [
  { id: "ds-tiny-cat", name: "cat and dog sentences (tiny)", origin: "dataset", level: "tiny", chars: 216, parts: { train: 133, val: 41, test: 42 } },
], loading: false, refresh: () => {} }) }))

const { default: How } = await import("./How")
const { GlossaryProvider } = await import("@/components/lab/glossary")

beforeEach(() => stream.mockReset())
afterEach(() => cleanup())

describe("How NextWord Works", () => {
  it("shows live defaults and limits from the backend, labelled as defaults, and never asks the model to write", async () => {
    render(<GlossaryProvider><How /></GlossaryProvider>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const table = screen.getByTestId("mlp-defaults")
    expect(table.textContent).toContain("Hidden size64")
    expect(screen.getByTestId("how-mlp").textContent).toMatch(/not the settings of any run you trained/)
    expect(screen.getByTestId("how-tutor").textContent).toMatch(/2,048-token context and holds at most 4 answers/)
    expect(screen.getByTestId("how-data").textContent).toMatch(/Not prepared on this computer: the medium and large level/)
    expect(screen.getByTestId("how-measured").textContent).toMatch(/Not a reading of this computer/)
    expect(stream).not.toHaveBeenCalled()
  })

  it("separates the roadmap, and only available items link anywhere", async () => {
    render(<GlossaryProvider><How /></GlossaryProvider>)
    await act(async () => { await Promise.resolve() })
    const road = screen.getByTestId("how-roadmap-columns")
    for (const later of road.querySelectorAll('[data-roadmap="later"], [data-roadmap="doing"]')) expect(later.querySelector("a")).toBeNull()
    expect(within(road).getByText("Character MLP (PyTorch)").closest("a")?.getAttribute("href")).toBe("#/mlp")
    expect(screen.getByTestId("flow-train").textContent).toMatch(/Changes the MLP's weights/)
    expect(screen.getByTestId("flow-tutor").textContent).toMatch(/Inference only: no weights change/)
  })
})
