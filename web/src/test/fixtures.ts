// Shared test data shaped like the Lab backend's responses.
import type { Generation } from "@/lib/api"

/** A trace the way the backend sends it: each step reads the previous step's token. */
export function fakeGeneration(prompt: string, tokens: string[], extra: Partial<Generation> = {}): Generation {
  const promptLast = Array.from(prompt).at(-1)!
  const steps = tokens.map((token, i) => {
    const context = i === 0 ? promptLast : tokens[i - 1]
    return { context, contextLabel: context, draw: 0.5, token, tokenLabel: token, candidates: [{ token, label: token, p: 1 }], intervalOrder: [token] }
  })
  return {
    engine: "char-bigram", modelVersion: "char-bigram@test", corpus: { id: "sample", name: "Sample passage", chars: 1167, origin: "sample", file: "sample.txt", distinct: 39, fingerprint: "aaaa1111" } as Generation["corpus"],
    prompt, contextUsed: promptLast, contextUsedLabel: promptLast, seed: 1, length: tokens.length,
    suggestion: tokens.join(""), stopped: null, steps,
    timingsMs: { validate: 0, count: 0, countCacheHit: true, countOnlyMs: 0, generate: 0, format: 0, total: 0 },
    ...extra,
  }
}
