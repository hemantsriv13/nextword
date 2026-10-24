// Runs a Neural lab training run off the main thread, so the page stays responsive.
// The page cancels a run by terminating this worker.
import { buildDatasetFromParts, countParams, train, type CurvePoint, type TrainSettings } from "./neural"

export interface TrainRequest {
  trainText: string
  valText: string
  vocabFrom: string
  settings: Omit<TrainSettings, "config"> & { context: number; embed: number; hidden: number }
}

export type TrainMessage =
  | { type: "start"; vocabSize: number; trainPairs: number; valPairs: number; params: number }
  | { type: "point"; point: CurvePoint }
  | { type: "done"; ms: number }
  | { type: "error"; message: string }

self.onmessage = (e: MessageEvent<TrainRequest>) => {
  const post = (m: TrainMessage) => (self as unknown as Worker).postMessage(m)
  try {
    const { trainText, valText, vocabFrom, settings } = e.data
    const data = buildDatasetFromParts(trainText, valText, settings.context, vocabFrom)
    if (data.train.length === 0 || data.val.length === 0) throw new Error("the texts are too short for this context size")
    const config = { vocabSize: data.vocab.length, context: settings.context, embed: settings.embed, hidden: settings.hidden }
    post({ type: "start", vocabSize: config.vocabSize, trainPairs: data.train.length, valPairs: data.val.length, params: countParams(config) })
    const t0 = performance.now()
    train(data, { ...settings, config }, (point) => { post({ type: "point", point }) })
    post({ type: "done", ms: performance.now() - t0 })
  } catch (err) {
    post({ type: "error", message: (err as Error).message })
  }
}
