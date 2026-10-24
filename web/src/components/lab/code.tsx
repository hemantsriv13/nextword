import { useMemo } from "react"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/hooks"
import { ErrorNote, LoadingRows } from "./layout"

/** The lines of one top-level function or class, found by name. */
export function extractSymbol(text: string, symbol: string): { start: number; lines: string[] } | null {
  const lines = text.split("\n")
  const name = symbol.split(".").pop()!
  const startIdx = lines.findIndex((l) =>
    new RegExp(`^\\s*(async\\s+)?(def|class|function|export function|export const|export class|export interface)\\s+${name}\\b`).test(l) ||
    new RegExp(`^export (async )?function ${name}\\b`).test(l),
  )
  if (startIdx < 0) return null
  const indent = lines[startIdx].match(/^\s*/)![0].length
  let end = startIdx + 1
  for (; end < lines.length; end++) {
    const l = lines[end]
    if (l.trim() === "") continue
    const ind = l.match(/^\s*/)![0].length
    if (ind <= indent && !/^\s*[)\]}]/.test(l)) break
  }
  while (end > startIdx + 1 && lines[end - 1].trim() === "") end--
  // Include a closing brace line for TypeScript blocks.
  if (end < lines.length && /^\s*}/.test(lines[end]) && lines[end].match(/^\s*/)![0].length === indent) end++
  let begin = startIdx
  while (begin > 0 && /^\s*(@|\/\/|#)/.test(lines[begin - 1])) begin--
  return { start: begin + 1, lines: lines.slice(begin, end) }
}

function CodeBlockView({ path, symbol, text }: { path: string; symbol: string; text: string }) {
  const found = useMemo(() => extractSymbol(text, symbol), [text, symbol])
  if (!found) return <p className="text-sm text-muted-foreground">Couldn't find {symbol} in {path}.</p>
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-[13px] text-muted-foreground">
        <code className="tok">{path}</code>, line {found.start}
      </figcaption>
      <pre className="max-h-96 overflow-auto rounded-md bg-raised p-3 text-[12.5px] leading-[1.55]">
        <code className="tok">
          {found.lines.map((l, i) => (
            <div key={i} className="flex">
              <span className="mr-3 inline-block w-7 flex-none select-none text-right text-muted-foreground">{found.start + i}</span>
              <span className="whitespace-pre">{l}</span>
            </div>
          ))}
        </code>
      </pre>
    </figure>
  )
}

/** Source of your engine or the Lab backend, read live from disk by the Python server. */
export function EngineCode({ path, symbol }: { path: string; symbol: string }) {
  const { data, error, loading, retry } = useLoad(() => api.source(path), path)
  if (loading) return <LoadingRows rows={6} label="Loading source" />
  if (error) return <ErrorNote error={error} onRetry={retry} />
  return <CodeBlockView path={path} symbol={symbol} text={data!.text} />
}

/** Source of a browser simulation, bundled with the page. */
export function SimCode({ path, symbol, text }: { path: string; symbol: string; text: string }) {
  return <CodeBlockView path={path} symbol={symbol} text={text} />
}
