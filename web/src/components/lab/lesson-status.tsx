// A lesson's status, styled the same everywhere it appears (the lessons, Home, Learning paths).
// The words come from lib/lessons.ts: only a lesson's check decides "completed", and help is told apart.
import { CheckIcon } from "@/components/icons"
import { STATUS_TONE, type LessonStatus } from "@/lib/lessons"
import { cn } from "@/lib/utils"

export function StatusBadge({ status, className }: { status: LessonStatus; className?: string }) {
  const tone = STATUS_TONE[status]
  return (
    <span data-testid="lesson-status" className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium leading-5",
      tone === "done" && "bg-success text-positive", tone === "help" && "bg-data-soft text-foreground", tone === "skip" && "bg-src-sim text-src-sim-ink",
      tone === "open" && "bg-raised text-foreground ring-1 ring-inset ring-border", tone === "none" && "text-muted-foreground", className)}>
      {tone === "done" && <CheckIcon className="size-3.5" aria-hidden="true" />}{status}
    </span>
  )
}
