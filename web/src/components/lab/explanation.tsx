// The teaching companion: the panel beside an experiment that explains it. One tinted sheet with a
// teal top edge, its own header, and the explanation inside. Shared by the Bigram journey and by every
// workspace's explanation column, so the two read as the same kind of thing.
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { LightBulbIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

const HEADER_OFFSET = 80 // the app bar plus breathing room, in px

/**
 * Sticky only while the whole panel fits on screen. A taller panel scrolls with the page instead,
 * so its end is always reachable without a second scrollbar inside it.
 */
function useFitsViewport() {
  const ref = useRef<HTMLElement | null>(null)
  const [fits, setFits] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setFits(el.offsetHeight <= window.innerHeight - HEADER_OFFSET)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    window.addEventListener("resize", check)
    return () => { ro.disconnect(); window.removeEventListener("resize", check) }
  }, [])
  return { ref, fits }
}

export function ExplanationPanel({ label = "Step explained", title, children, sticky = true, className, testid }: {
  /** The small line above the title. */
  label?: string
  /** What is being explained: the lesson step, or the workspace. */
  title: ReactNode
  children: ReactNode
  sticky?: boolean
  className?: string
  testid?: string
}) {
  const headingId = useId()
  const { ref, fits } = useFitsViewport()
  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      data-testid={testid}
      data-help-id="layout.explanation"
      data-sticky={sticky && fits ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-[15px] border border-companion-edge border-t-[3px] border-t-data bg-companion p-5 shadow-companion sm:p-6",
        sticky && fits && "lg:sticky lg:top-16 lg:self-start",
        className,
      )}
    >
      <header className="flex flex-col gap-0.5">
        <p className="text-label font-medium text-data">{label}</p>
        <h2 id={headingId} className="text-section font-semibold">{title}</h2>
      </header>
      {children}
    </section>
  )
}

/** The one next action in an explanation: a stronger tint and a labelled icon. */
export function TryThis({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-companion-callout p-4" data-testid="try-this">
      <LightBulbIcon className="mt-0.5 size-5 flex-none text-data" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-semibold">Try this</h3>
        <div>{children}</div>
      </div>
    </div>
  )
}
