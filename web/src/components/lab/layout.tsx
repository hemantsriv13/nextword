import { useState, type ReactNode } from "react"
import { InfoCircleIcon, NavArrowDownIcon, RefreshDoubleIcon, SidebarCollapseIcon, WarningTriangleIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { ApiError } from "@/lib/api"
import { useMediaQuery } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useFocusMode } from "./shell-state"

// ----------------------------------------------------------------------------- workspace frame

/** A workspace: the experiment on the left, its explanation beside it (below it on narrow screens). */
export function Workspace({ title, subtitle, actions: headerActions, explain, children }: {
  title: string
  subtitle: ReactNode
  actions?: ReactNode
  explain?: ReactNode
  children: ReactNode
}) {
  const wide = useMediaQuery("(min-width: 1100px)")
  const open = useLab((s) => s.prefs.explainOpen)
  const size = useLab((s) => s.prefs.explainSize)
  const { focus } = useFocusMode()
  const showExplain = !!explain && open && !focus

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl flex-[1_1_28rem]">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex max-w-full flex-none flex-wrap items-center gap-2">
        {headerActions}
        {explain && !focus && wide && (
          <Button variant="outline" size="sm" onClick={() => actions.setPref("explainOpen", !open)} aria-pressed={open}>
            <SidebarCollapseIcon className={cn("size-4", !open && "rotate-180")} />
            {open ? "Hide explanation" : "Show explanation"}
          </Button>
        )}
      </div>
    </header>
  )

  const main = (
    <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6">
      {header}
      {children}
    </div>
  )

  if (!wide) {
    return (
      <div className="flex flex-col">
        {main}
        {explain && !focus && (
          <aside aria-label="Explanation" className="border-t border-border bg-raised/40 p-4 sm:p-6">{explain}</aside>
        )}
      </div>
    )
  }
  if (!showExplain) return main
  return (
    <ResizablePanelGroup direction="horizontal" autoSaveId={undefined} className="min-h-full !overflow-visible" onLayout={(sizes) => sizes[1] && actions.setPref("explainSize", Math.round(sizes[1]))}>
      <ResizablePanel defaultSize={100 - size} minSize={45} className="min-w-0 !overflow-visible">
        {main}
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Resize the explanation panel" />
      <ResizablePanel defaultSize={size} minSize={24} maxSize={50} className="min-w-0 !overflow-visible">
        <aside aria-label="Explanation" className="sticky top-12 max-h-[calc(100dvh-56px)] overflow-y-auto p-6">{explain}</aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

// ----------------------------------------------------------------------------- panels

/** A section of the experiment area: a heading, an optional source label and right-side controls. */
export function Panel({ title, source, aside, children, className, id }: { title: string; source?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className={cn("min-w-0 rounded-lg border border-border bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={id ? `${id}-h` : undefined} className="text-base font-semibold">{title}</h2>
          {source}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

// ----------------------------------------------------------------------------- explanation panel

export function ExplainSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-3">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-medium hover:text-foreground">
        {title}
        <NavArrowDownIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 text-[14px] leading-relaxed">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** Plain words first; then the guided cycle; then optional depth. */
export function Explain({ plain, children }: { plain: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-1.5 text-base font-semibold">In plain words</h2>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed">{plain}</div>
      </div>
      {children}
    </div>
  )
}

// ----------------------------------------------------------------------------- states

export function LoadingRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 w-full rounded" style={{ width: `${92 - i * 9}%` }} />)}
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const err = error as ApiError | Error
  const offline = err instanceof ApiError && (err.offline || err.code === "timeout")
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-border bg-raised p-3 text-sm">
      <p className="flex items-start gap-2">
        <WarningTriangleIcon className="mt-0.5 size-4 flex-none text-negative" />
        <span>
          <span className="font-medium">{offline ? "The engine isn't reachable." : "That didn't work."}</span>{" "}
          {err.message}
        </span>
      </p>
      {offline && (
        <p className="text-muted-foreground">
          In a terminal in the project folder, run <code className="tok rounded bg-secondary px-1">.venv\Scripts\python -m nextword.lab</code>, then retry.
        </p>
      )}
      {onRetry && (
        <Button size="sm" variant="outline" className="self-start" onClick={onRetry}>
          <RefreshDoubleIcon className="size-4" />
          Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{children}</p>
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", tone === "info" ? "bg-raised" : "bg-src-sim text-src-sim-ink")}>
      {tone === "info" ? <InfoCircleIcon className="mt-0.5 size-4 flex-none text-muted-foreground" /> : <WarningTriangleIcon className="mt-0.5 size-4 flex-none" />}
      <span>{children}</span>
    </p>
  )
}

// ----------------------------------------------------------------------------- controls

/** A labelled slider with its value printed beside the label. */
export function SliderField({ label, value, min, max, step, onChange, format = (v) => String(v), hint, id }: {
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: ReactNode
  id: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label id={`${id}-label`} className="text-sm font-medium">{label}</label>
        <output htmlFor={id} className="num text-sm">{format(value)}</output>
      </div>
      <Slider
        id={id}
        aria-labelledby={`${id}-label`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? (v as number[])[0] : (v as number))}
      />
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function NumberField({ label, value, onChange, min, max, id, hint, width = "w-24" }: { label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; id: string; hint?: ReactNode; width?: string }) {
  const [text, setText] = useState(String(value))
  const [shownValue, setShownValue] = useState(value)
  if (shownValue !== value) {
    // The value changed from outside (a reset or a random seed): show it.
    setShownValue(value)
    setText(String(value))
  }
  const n = Number(text)
  const invalid = text.trim() === "" || !Number.isInteger(n) || n < min || n > max
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        inputMode="numeric"
        value={text}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isInteger(v) && v >= min && v <= max) onChange(v)
        }}
        className={cn("num h-9 rounded-md border border-input bg-card px-3 text-sm", width, invalid && "border-negative")}
      />
      {invalid ? <p id={`${id}-err`} className="text-[13px] text-negative">Whole number from {min} to {max}</p> : hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-md bg-secondary p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value)
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(options[(i + 1) % options.length].value) }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(options[(i - 1 + options.length) % options.length].value) }
          }}
          tabIndex={value === o.value ? 0 : -1}
          className={cn("h-8 rounded-[5px] px-3 text-sm transition-colors", value === o.value ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
