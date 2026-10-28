import { useEffect, useId, useMemo, useRef, useState } from "react"
import { CollapseIcon, ExpandIcon } from "@/components/icons"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { usePanelExpand } from "./explanation"
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
  const id = useId()
  const panel = usePanelExpand()
  const [ownExpanded, setOwnExpanded] = useState(false)
  const expanded = panel ? panel.expanded === id : ownExpanded
  const pre = useRef<HTMLPreElement>(null)
  const figure = useRef<HTMLElement>(null)
  const [overflows, setOverflows] = useState(false)

  // Offer Expand only when the code doesn't already fit.
  useEffect(() => {
    const el = pre.current
    if (!el || expanded) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [expanded, found])

  // A block that goes away (another tab, another level) gives the panel back its width.
  const latest = useRef(panel)
  useEffect(() => { latest.current = panel })
  useEffect(() => () => { if (latest.current?.expanded === id) latest.current.setExpanded(null) }, [id])

  const toggle = () => {
    const next = !expanded
    if (panel) panel.setExpanded(next ? id : null)
    else setOwnExpanded(next)
    // Keep the start of the code in view as the panel changes size.
    requestAnimationFrame(() => figure.current?.scrollIntoView({ block: "nearest" }))
  }

  if (!found) return <p className="text-sm text-muted-foreground">Couldn't find {symbol} in {path}.</p>
  const lines = found.lines.length
  return (
    <figure ref={figure} className="flex flex-col gap-1.5" data-testid="code-block" data-expanded={expanded || undefined}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label text-muted-foreground">
        <span><code className="tok">{path}</code>, line {found.start}{expanded && `, ${lines} lines`}</span>
        {(overflows || expanded) && (
          <button type="button" onClick={toggle} aria-expanded={expanded} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-data hover:bg-companion-callout focus-visible:outline-2 focus-visible:outline-data">
            {expanded ? <CollapseIcon className="size-3.5" aria-hidden="true" /> : <ExpandIcon className="size-3.5" aria-hidden="true" />}
            {expanded ? "Collapse code" : "Expand code"}
          </button>
        )}
      </figcaption>
      <pre ref={pre} className={cn("overflow-auto rounded-md bg-raised p-3 text-[12.5px] leading-[1.55]", !expanded && "max-h-96")}>
        <code className="tok">
          {found.lines.map((l, i) => (
            <div key={i} className="flex">
              <span className="mr-3 inline-block w-7 flex-none select-none text-right text-muted-foreground">{found.start + i}</span>
              <span className="whitespace-pre">{l}</span>
            </div>
          ))}
        </code>
      </pre>
      {expanded && <p className="text-label text-muted-foreground">Showing all {lines} lines. Esc or Collapse code returns to the short view.</p>}
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
