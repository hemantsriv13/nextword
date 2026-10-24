import { CodeIcon, CpuIcon, OpenBookIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

export type SourceKind = "model" | "simulation" | "example"

const SOURCES: Record<SourceKind, { label: string; title: string; Icon: typeof CpuIcon; cls: string }> = {
  model: { label: "Your model", title: "Computed by your Python engine (nextword/bigram.py) through the local backend", Icon: CpuIcon, cls: "bg-src-model text-src-model-ink" },
  simulation: { label: "Interactive simulation", title: "Computed in the browser by a simplified educational model, not by your engine", Icon: CodeIcon, cls: "bg-src-sim text-src-sim-ink ring-1 ring-inset ring-src-sim-edge" },
  example: { label: "Worked example", title: "An illustrative calculation with explicitly stated values", Icon: OpenBookIcon, cls: "bg-src-example text-src-example-ink" },
}

/** The label that sits next to every result, saying where the numbers came from. */
export function Source({ kind, detail, className }: { kind: SourceKind; detail?: string; className?: string }) {
  const s = SOURCES[kind]
  return (
    <span className={cn("inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 rounded-md px-2 py-0.5 text-xs font-medium leading-5", s.cls, className)} title={s.title}>
      <s.Icon className="size-3.5 flex-none" />
      <span className="flex-none whitespace-nowrap">{s.label}</span>
      {detail && <span className="min-w-0 font-normal opacity-80">{detail}</span>}
    </span>
  )
}
