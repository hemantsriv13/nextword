// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@/test/setup-dom"
import type { Engine } from "@/lib/api"

// The backend is mocked at the page's clients, with the shapes the routes return.
const ENGINES = (mlp: Partial<Engine> = {}): Engine[] => [
  { id: "char-bigram", name: "Character bigram", source: "model", status: "available", version: "char-bigram@abc", file: "nextword/bigram.py", route: "journey", decoding: ["sample"] },
  { id: "char-mlp", name: "Character MLP", source: "model", status: "available", version: "PyTorch 2.15.0+cpu", file: "nextword/mlp.py", route: "mlp", savedRuns: 2, reason: null, nextAction: null, decoding: ["sample"], ...mlp },
  { id: "tiny-transformer", name: "Tiny transformer", source: "model", status: "planned", version: null, file: null, route: null, reason: "Not built.", decoding: [] },
]
const health = vi.fn(), engines = vi.fn(), status = vi.fn(), stream = vi.fn()
vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>()
  return { ...real, api: { ...real.api, health: () => health(), engines: () => engines() } }
})
vi.mock("@/lib/assist", async (orig) => ({ ...(await orig<typeof import("@/lib/assist")>()), assistStatus: () => status(), streamAssist: (...a: unknown[]) => stream(...a) }))

const { default: Home } = await import("./Home")
const { GlossaryProvider } = await import("@/components/lab/glossary")
const { WORKSPACE_BY_ROUTE } = await import("@/content/journey")
const { actions } = await import("@/lib/store")

const OFFLINE = { url: "", model: "auto", available: false, modelServed: false, served: [], contextTokens: null, message: "the local model isn't reachable" }
async function mount() {
  render(<GlossaryProvider><Home /></GlossaryProvider>)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
const row = (name: RegExp) => screen.getAllByTestId("system-row").find((r) => name.test(r.textContent ?? ""))!

beforeEach(() => {
  actions.reset()
  health.mockResolvedValue({ ok: true, modelVersion: "char-bigram@abc", time: 0 })
  engines.mockResolvedValue(ENGINES())
  status.mockResolvedValue(OFFLINE)
  stream.mockReset()
})
afterEach(() => cleanup())

describe("Home", () => {
  it("starts a new learner at lesson 1, with no invented progress", async () => {
    await mount()
    expect(screen.getByTestId("home-next-title").textContent).toBe("Start with the basics: Characters")
    expect(screen.getByTestId("home-next-action").getAttribute("href")).toBe("#/learn?lesson=characters")
    expect(screen.getByTestId("home-progress").textContent).toContain("None started yet")
    expect(document.body.textContent).not.toMatch(/\d+\s?%|minutes? left|\bmin\b/)
  })

  it("continues a returning learner where they stopped, and counts statuses apart", async () => {
    actions.setLessonPlace({ lesson: "pairs", step: 3, example: 0 })
    actions.setLessonPlace({ lesson: "characters", step: 5, example: 0 })
    actions.recordCheckpoint("learn.characters", 1, "q", "passed-with-hints")
    actions.setLessonPlace({ lesson: "pairs", step: 3, example: 0 })
    actions.skipLesson("counts")
    await mount()
    expect(screen.getByTestId("home-next-title").textContent).toBe("Continue: Pairs")
    expect(screen.getByTestId("home-next-action").getAttribute("href")).toBe("#/learn?lesson=pairs")
    const p = screen.getByTestId("home-progress")
    expect(within(p).getAllByTestId("lesson-status").map((b) => b.textContent)).toEqual(["Completed with help", "Skipped", "In progress", "Not started"])
  })

  it("stays useful with the tutor off, and never asks the model to write", async () => {
    await mount()
    expect(row(/AI tutor/).dataset.tone).toBe("off")
    expect(row(/AI tutor/).textContent).toMatch(/Optional\. Everything except “Ask your tutor” works without it/)
    expect(row(/Character MLP/).dataset.tone).toBe("ok")
    expect(status).toHaveBeenCalledTimes(1) // a model listing
    expect(stream).not.toHaveBeenCalled()   // never a generation
    expect(screen.getByTestId("home-next-action")).toBeTruthy()
  })

  it("shows why the MLP can't run, and what to do, when PyTorch is missing", async () => {
    engines.mockResolvedValue(ENGINES({ status: "unavailable", version: null, reason: "PyTorch could not be imported (No module named 'torch').", nextAction: "pip install … -r requirements-mlp.txt" }))
    await mount()
    expect(row(/Character MLP/).textContent).toMatch(/No module named 'torch'.*requirements-mlp\.txt/)
  })

  it("links every tool and path to a page that exists", async () => {
    await mount()
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#/"]')).map((a) => a.getAttribute("href")!)
    expect(links.length).toBeGreaterThan(15)
    for (const href of links) expect(WORKSPACE_BY_ROUTE.has(href.slice(2).split("?")[0] as never), href).toBe(true)
  })
})
