// Retrieval demonstration: chunking plus lexical search (BM25). BM25 ranks passages by shared
// words; it is not an embedding model and does not understand meaning or synonyms.

export interface Doc {
  id: string
  title: string
  text: string
}

export interface Chunk {
  id: string
  docId: string
  title: string
  index: number
  startWord: number
  endWord: number // exclusive
  text: string
}

export function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Fixed-size chunks of `size` words; consecutive chunks share `overlap` words. */
export function chunkDoc(doc: Doc, size: number, overlap: number): Chunk[] {
  if (size < 1) throw new Error("chunk size must be at least 1 word")
  if (overlap < 0 || overlap >= size) throw new Error("overlap must be at least 0 and smaller than the chunk size")
  const w = words(doc.text)
  const chunks: Chunk[] = []
  const step = size - overlap
  for (let start = 0; start < w.length; start += step) {
    const end = Math.min(start + size, w.length)
    chunks.push({ id: `${doc.id}#${chunks.length + 1}`, docId: doc.id, title: doc.title, index: chunks.length + 1, startWord: start, endWord: end, text: w.slice(start, end).join(" ") })
    if (end === w.length) break
  }
  return chunks
}

const STOPWORDS = new Set("a an and are as at be by for from has have in is it its of on or that the this to was were will with".split(" "))

export function terms(text: string, dropStopwords = true): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !dropStopwords || !STOPWORDS.has(t))
}

export interface Ranked {
  chunk: Chunk
  score: number
  matched: string[]
}

/** Okapi BM25 with the usual defaults k1 = 1.5, b = 0.75. */
export function bm25(chunks: Chunk[], query: string, k1 = 1.5, b = 0.75): Ranked[] {
  const q = [...new Set(terms(query))]
  const docs = chunks.map((c) => terms(c.text))
  const n = docs.length
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(n, 1)
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  return chunks
    .map((chunk, i) => {
      const d = docs[i]
      let score = 0
      const matched: string[] = []
      for (const t of q) {
        const tf = d.filter((x) => x === t).length
        if (tf === 0) continue
        matched.push(t)
        const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg)))
      }
      return { chunk, score, matched }
    })
    .sort((a, b2) => b2.score - a.score || a.chunk.id.localeCompare(b2.chunk.id))
}

export function assemblePrompt(question: string, passages: Ranked[]): string {
  const sources = passages.map((r) => `[${r.chunk.id}] (${r.chunk.title})\n${r.chunk.text}`).join("\n\n")
  return [
    "Answer the question using only the sources below. Cite the source id in brackets for each claim.",
    'If the sources do not contain the answer, say "The sources do not say."',
    "",
    "Sources:",
    sources || "(no passages retrieved)",
    "",
    `Question: ${question}`,
  ].join("\n")
}
