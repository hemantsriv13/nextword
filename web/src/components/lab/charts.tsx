// Small charts drawn to the Lab's rules: one data hue, faint grids, labelled scales, no decoration.
import { useId, useMemo, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { fmt } from "@/lib/hooks"

// ----------------------------------------------------------------------------- token chip

export function Tok({ children, className, tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "context" | "generated" | "chosen" }) {
  return (
    <span
      className={cn(
        "tok inline-flex min-w-[1.6em] items-center justify-center rounded px-1 text-[13px] leading-5",
        tone === "plain" && "bg-secondary",
        tone === "context" && "bg-context text-context-ink",
        tone === "generated" && "bg-data-soft text-foreground",
        tone === "chosen" && "bg-primary text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

// ----------------------------------------------------------------------------- probability bars

export interface BarItem {
  key: string
  label: ReactNode
  value: number
  detail?: ReactNode
  highlight?: boolean
  muted?: boolean
}

/** Horizontal bars for a distribution. When only the top items are shown, the rest is summed into "Other". */
export function ProbBars({ items, max, limit, total = 1, valueFormat = (v) => fmt.p(v), ariaLabel, remainderLabel = "tokens" }: {
  items: BarItem[]
  max?: number
  limit?: number
  total?: number
  valueFormat?: (v: number) => string
  ariaLabel: string
  remainderLabel?: string
}) {
  const shown = limit ? items.slice(0, limit) : items
  const rest = items.slice(shown.length)
  const restValue = rest.reduce((s, i) => s + i.value, 0)
  const scale = max ?? Math.max(...items.map((i) => i.value), 1e-12)
  return (
    <table className="w-full border-collapse text-sm" aria-label={ariaLabel}>
      <tbody>
        {shown.map((item) => (
          <tr key={item.key} className={cn(item.highlight && "font-medium")}>
            <th scope="row" className="w-14 py-1 pr-2 text-left font-normal">{item.label}</th>
            <td className="py-1">
              <div className="h-4 rounded-[3px] bg-secondary" aria-hidden="true">
                <div
                  className={cn("h-full rounded-[3px] transition-[width] duration-200", item.highlight ? "bg-primary" : item.muted ? "bg-chart-5" : "bg-data")}
                  style={{ width: `${Math.max(0, Math.min(1, item.value / scale)) * 100}%` }}
                />
              </div>
            </td>
            <td className="num w-16 py-1 pl-3 text-right">{valueFormat(item.value)}</td>
            {item.detail !== undefined && <td className="num w-20 py-1 pl-2 text-right text-muted-foreground">{item.detail}</td>}
          </tr>
        ))}
        {rest.length > 0 && (
          <tr className="text-muted-foreground">
            <th scope="row" className="py-1 pr-2 text-left font-normal" colSpan={1}>Other</th>
            <td className="py-1 text-[13px]">{rest.length} more {remainderLabel}</td>
            <td className="num py-1 pl-3 text-right">{valueFormat(restValue)}</td>
            {shown.some((s) => s.detail !== undefined) && <td />}
          </tr>
        )}
      </tbody>
      {total !== 1 ? null : (
        <tfoot className="sr-only">
          <tr><td colSpan={3}>Values add up to {valueFormat(items.reduce((s, i) => s + i.value, 0))}</td></tr>
        </tfoot>
      )}
    </table>
  )
}

// ----------------------------------------------------------------------------- line chart

export interface Series {
  name: string
  points: { x: number; y: number }[]
  tone: "data" | "ink" | "grey" | "data2"
  dashed?: boolean
}

function niceStep(range: number, target: number) {
  const raw = range / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow
}

export function ticks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min]
  const step = niceStep(max - min, target)
  const out: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(+v.toFixed(10))
  return out
}

const TONE: Record<Series["tone"], string> = { data: "var(--data)", ink: "var(--foreground)", grey: "var(--chart-5)", data2: "var(--chart-3)" }

export function LineChart({ series, height = 200, xLabel, yLabel, yMin, yMax, markers = [], ariaLabel, xFormat = (x) => String(x) }: {
  series: Series[]
  height?: number
  xLabel: string
  yLabel: string
  yMin?: number
  yMax?: number
  markers?: { x: number; label: string }[]
  ariaLabel: string
  xFormat?: (x: number) => string
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const pts = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y))
  const width = 640
  const pad = { l: 44, r: 12, t: 12, b: 34 }
  if (pts.length === 0) {
    return <div className="flex h-[120px] items-center rounded-md border border-dashed text-sm text-muted-foreground"><span className="px-4">No points yet. Run the experiment to draw this chart.</span></div>
  }
  const xs = pts.map((p) => p.x)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const lo = yMin ?? Math.min(0, ...pts.map((p) => p.y))
  const hiRaw = yMax ?? Math.max(...pts.map((p) => p.y))
  const yt = ticks(lo, hiRaw * 1.05)
  const hi = Math.max(yt[yt.length - 1], hiRaw)
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(x1 - x0, 1e-9)) * (width - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (Math.min(y, hi) - lo) / Math.max(hi - lo, 1e-9)) * (height - pad.t - pad.b)
  const xt = ticks(x0, x1, 5).filter((x) => x >= x0 && x <= x1)
  const nearest = (x: number) => {
    const all = [...new Set(xs)].sort((a, b) => a - b)
    return all.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), all[0])
  }
  return (
    <figure className="flex flex-col gap-2" aria-label={ariaLabel}>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden="true"><line x1="0" y1="4" x2="16" y2="4" stroke={TONE[s.tone]} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} /></svg>
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby={`${id}-desc`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = x0 + (((e.clientX - r.left) / r.width) * width - pad.l) / (width - pad.l - pad.r) * (x1 - x0)
          setHover(nearest(x))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <desc id={`${id}-desc`}>{ariaLabel}</desc>
        {yt.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth={t === lo ? 1.5 : 1} />
            <text x={pad.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted-foreground)" className="num">{+t.toFixed(4)}</text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={height - pad.b + 16} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)" className="num">{xFormat(t)}</text>
        ))}
        <text x={(pad.l + width - pad.r) / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{xLabel}</text>
        <text x={12} y={pad.t + (height - pad.t - pad.b) / 2} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)" transform={`rotate(-90 12 ${pad.t + (height - pad.t - pad.b) / 2})`}>{yLabel}</text>
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={pad.t} y2={height - pad.b} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <text x={sx(m.x) + 4} y={pad.t + 10} fontSize="11" fill="var(--foreground)">{m.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const good = s.points.filter((p) => Number.isFinite(p.y))
          if (good.length === 0) return null
          const d = good.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("")
          return <path key={s.name} d={d} fill="none" stroke={TONE[s.tone]} strokeWidth="2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
        })}
        {hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--border)" />
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hover)
              return p && Number.isFinite(p.y) ? <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={TONE[s.tone]} /> : null
            })}
          </g>
        )}
      </svg>
      <div className="num min-h-5 text-[13px] text-muted-foreground" aria-live="polite">
        {hover !== null
          ? `${xLabel} ${xFormat(hover)}: ` + series.map((s) => { const p = s.points.find((q) => q.x === hover); return `${s.name} ${p && Number.isFinite(p.y) ? p.y.toFixed(3) : "–"}` }).join(", ")
          : "Point at the chart to read values."}
      </div>
    </figure>
  )
}

// ----------------------------------------------------------------------------- sampling intervals

/** The probabilities laid end to end on [0, 1), with the random draw marked. */
export function IntervalStrip({ segments, draw, chosen, ariaLabel }: { segments: { key: string; label: string; p: number }[]; draw?: number; chosen?: string; ariaLabel: string }) {
  const spans = segments.map((s, i) => ({ ...s, start: segments.slice(0, i).reduce((sum, x) => sum + x.p, 0) }))
  return (
    <figure aria-label={ariaLabel} className="flex flex-col gap-1">
      <div className="relative h-10 w-full overflow-hidden rounded-md bg-secondary">
        {spans.map((s, i) => (
          <div
            key={s.key}
            className={cn("tok absolute inset-y-0 flex items-center justify-center overflow-hidden border-r-2 border-card text-[12px]", s.key === chosen ? "bg-primary text-primary-foreground" : i % 2 ? "bg-data-soft" : "bg-[color-mix(in_oklab,var(--data)_28%,var(--card))]")}
            style={{ left: `${s.start * 100}%`, width: `${s.p * 100}%` }}
            title={`${s.label}: [${s.start.toFixed(3)}, ${(s.start + s.p).toFixed(3)})`}
          >
            {s.p > 0.045 ? s.label : ""}
          </div>
        ))}
        {draw !== undefined && (
          <div className="absolute inset-y-0 w-0.5 bg-negative" style={{ left: `calc(${draw * 100}% - 1px)` }} aria-hidden="true" />
        )}
      </div>
      <div className="num flex justify-between text-[11px] text-muted-foreground" aria-hidden="true"><span>0</span><span>0.5</span><span>1</span></div>
      {draw !== undefined && (
        <figcaption className="text-sm">
          Draw <span className="num font-medium">u = {draw.toFixed(4)}</span>
          {chosen !== undefined && <> lands in the interval of <Tok tone="chosen">{segments.find((s) => s.key === chosen)?.label}</Tok></>}
          <span className="ml-1 text-muted-foreground">(red line)</span>
        </figcaption>
      )}
    </figure>
  )
}

// ----------------------------------------------------------------------------- matrices

export function shapeOf(m: number[][] | number[]): string {
  return Array.isArray(m[0]) ? `${m.length} × ${(m as number[][])[0].length}` : `${m.length}`
}

/** A small matrix with its shape. `before` marks changed cells; `highlightRow` picks out a row. */
export function MatrixView({ name, m, rowLabels, colLabels, digits = 2, before, highlightRows, highlightCols, mask, caption }: {
  name: string
  m: number[][]
  rowLabels?: ReactNode[]
  colLabels?: ReactNode[]
  digits?: number
  before?: number[][]
  highlightRows?: number[]
  highlightCols?: number[]
  mask?: boolean[][]
  caption?: ReactNode
}) {
  const scale = useMemo(() => Math.max(1e-9, ...m.flat().filter(Number.isFinite).map(Math.abs)), [m])
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="flex items-baseline gap-2 text-sm">
        <span className="font-medium">{name}</span>
        <span className="num text-muted-foreground">shape {shapeOf(m)}</span>
      </figcaption>
      <div className="max-w-full overflow-x-auto">
        <table className="num border-separate border-spacing-0.5 text-[12px]">
          {colLabels && (
            <thead>
              <tr>
                {rowLabels && <th />}
                {colLabels.map((c, j) => <th key={j} scope="col" className="px-1 pb-0.5 text-center font-normal text-muted-foreground">{c}</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {m.map((row, i) => (
              <tr key={i}>
                {rowLabels && <th scope="row" className="pr-1.5 text-right font-normal text-muted-foreground">{rowLabels[i]}</th>}
                {row.map((v, j) => {
                  const changed = before && Math.abs(before[i][j] - v) > 5 * Math.pow(10, -digits - 1)
                  const masked = mask?.[i]?.[j]
                  const hl = highlightRows?.includes(i) || highlightCols?.includes(j)
                  const strength = Number.isFinite(v) ? Math.abs(v) / scale : 0
                  return (
                    <td
                      key={j}
                      className={cn("min-w-[3.4em] rounded-[3px] px-1.5 py-0.5 text-right", masked ? "bg-secondary text-muted-foreground" : "", hl && "outline outline-1 outline-foreground", changed && "font-semibold")}
                      style={masked ? undefined : { background: `color-mix(in oklab, ${v < 0 ? "var(--chart-3)" : "var(--data)"} ${Math.round(strength * 32)}%, var(--card))` }}
                      title={before ? `before ${before[i][j].toFixed(4)}, after ${v.toFixed(4)}` : v.toFixed(6)}
                    >
                      {v === -Infinity ? "−∞" : fmt.num(v, digits)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && <p className="text-[13px] text-muted-foreground">{caption}</p>}
    </figure>
  )
}

export function VectorView(props: { name: string; v: number[]; labels?: ReactNode[]; digits?: number; before?: number[]; caption?: ReactNode; highlight?: number[] }) {
  return <MatrixView name={props.name} m={[props.v]} colLabels={props.labels} digits={props.digits} before={props.before ? [props.before] : undefined} caption={props.caption} highlightCols={props.highlight} />
}
