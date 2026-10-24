import { describe, expect, it } from "vitest"
import { backward, batchGradient, buildDataset, cloneParams, forward, initParams, meanLoss, scalarDescent, sgdStep, train, zerosLike, type Params } from "./neural"

const config = { vocabSize: 5, context: 2, embed: 2, hidden: 3 }
const ex = { context: [1, 3], target: 4 }

function get(p: Params, key: keyof Params, i: number, j?: number) {
  const v = p[key] as number[] | number[][]
  return j === undefined ? (v as number[])[i] : (v as number[][])[i][j]
}
function set(p: Params, key: keyof Params, i: number, j: number | undefined, value: number) {
  if (j === undefined) (p[key] as number[])[i] = value
  else (p[key] as number[][])[i][j] = value
}

describe("forward pass", () => {
  it("produces a valid distribution and the cross-entropy of the target", () => {
    const p = initParams(config, 1)
    const f = forward(p, ex)
    expect(f.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(f.loss).toBeCloseTo(-Math.log(f.probs[ex.target]), 12)
    expect(f.x).toHaveLength(config.context * config.embed)
  })
})

describe("backpropagation", () => {
  it("matches finite differences for every parameter group", () => {
    const p = initParams(config, 3)
    const g = zerosLike(p)
    backward(p, ex, forward(p, ex), g)
    const h = 1e-6
    const probes: [keyof Params, number, number | undefined][] = [["E", 1, 0], ["E", 3, 1], ["W1", 2, 1], ["b1", 0, undefined], ["W2", 1, 4], ["b2", 2, undefined]]
    for (const [key, i, j] of probes) {
      const plus = cloneParams(p); set(plus, key, i, j, get(p, key, i, j) + h)
      const minus = cloneParams(p); set(minus, key, i, j, get(p, key, i, j) - h)
      const numeric = (forward(plus, ex).loss - forward(minus, ex).loss) / (2 * h)
      expect(get(g, key, i, j)).toBeCloseTo(numeric, 6)
    }
  })
  it("an unused embedding row gets zero gradient", () => {
    const p = initParams(config, 3)
    const g = zerosLike(p)
    backward(p, ex, forward(p, ex), g)
    expect(g.E[0]).toEqual([0, 0])
  })
  it("a small step against the gradient lowers the loss", () => {
    const p = initParams(config, 5)
    const { loss, grad } = batchGradient(p, [ex])
    expect(forward(sgdStep(p, grad, 0.1), ex).loss).toBeLessThan(loss)
  })
  it("the update moves each parameter by −lr × gradient", () => {
    const p = initParams(config, 5)
    const { grad } = batchGradient(p, [ex])
    const q = sgdStep(p, grad, 0.5)
    expect(q.W2[1][2]).toBeCloseTo(p.W2[1][2] - 0.5 * grad.W2[1][2], 12)
  })
})

describe("data and training", () => {
  it("splits before windowing so no window crosses the boundary", () => {
    const text = "abcdefghij".repeat(4)
    const data = buildDataset(text, 3, 0.75)
    expect(data.trainText + data.valText).toBe(text)
    expect(data.train.length).toBe(data.trainText.length - 3)
    expect(data.val.length).toBe(data.valText.length - 3)
  })
  it("is reproducible with the same seed", () => {
    const data = buildDataset("the cat sat on the mat. the dog sat on the log. ", 2, 0.7)
    const s = { config: { vocabSize: data.vocab.length, context: 2, embed: 4, hidden: 8 }, lr: 0.5, steps: 40, batchSize: 8, seed: 9, evalEvery: 10 }
    expect(train(data, s).curve).toEqual(train(data, s).curve)
  })
  it("training lowers the training loss", () => {
    const data = buildDataset("abab abab abab abab abab abab abab abab ", 2, 0.75)
    const s = { config: { vocabSize: data.vocab.length, context: 2, embed: 4, hidden: 8 }, lr: 0.5, steps: 200, batchSize: 64, seed: 2, evalEvery: 50 }
    const { params, curve } = train(data, s)
    expect(meanLoss(params, data.train)).toBeLessThan(curve[0].train / 2)
  })
})

describe("scalar gradient descent", () => {
  it("converges for a small learning rate and diverges above 1", () => {
    expect(Math.abs(scalarDescent(0, 3, 0.1, 100).at(-1)!.w - 3)).toBeLessThan(1e-6)
    const bad = scalarDescent(0, 3, 1.1, 50)
    expect(Math.abs(bad.at(-1)!.w - 3)).toBeGreaterThan(3)
  })
})

describe("the Neural lab's overfitting experiment", () => {
  it("small training text overfits; the larger one, on the same validation text, does not", async () => {
    const { TRAIN_LARGE, TRAIN_SMALL, VALIDATION } = await import("../content/neuralTexts")
    const { buildDatasetFromParts } = await import("./neural")
    const vocab = TRAIN_LARGE + VALIDATION
    const run = (text: string) => {
      const data = buildDatasetFromParts(text, VALIDATION, 3, vocab)
      return train(data, { config: { vocabSize: data.vocab.length, context: 3, embed: 8, hidden: 16 }, lr: 0.1, steps: 1000, batchSize: 1000, seed: 1, evalEvery: 20 }).curve
    }
    const small = run(TRAIN_SMALL)
    const minSmall = Math.min(...small.map((p) => p.val))
    expect(small.at(-1)!.val).toBeGreaterThan(minSmall + 0.4) // validation loss rose after its minimum
    expect(small.at(-1)!.train).toBeLessThan(0.5) // while training loss kept falling
    const large = run(TRAIN_LARGE)
    expect(large.at(-1)!.val).toBeLessThan(small.at(-1)!.val)
  }, 60000)
})
