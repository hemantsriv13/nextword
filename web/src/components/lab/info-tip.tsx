// The Info icon beside a control, and the help it opens. This is the only way contextual help opens:
// hovering the control itself never does.
// - Hover the icon (500 ms) or focus it from the keyboard: a compact help box anchored to the icon.
//   The pointer can move into the box; it stays open.
// - Click or tap the icon: the box is pinned until Escape, an outside click or another icon.
// - "More details" expands the same box with the worked picture and the longer explanation.
// Only one box is open at a time. Opening help never runs the control, changes a setting or draws
// a random number: it only reads the inventory in content/help.ts.
import { useId, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { Popover } from "@base-ui/react/popover"
import { InfoCircleIcon, NavArrowDownIcon, XmarkIcon } from "@/components/icons"
import { EFFECT_LABEL, helpFor } from "@/content/help"
import { useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Term } from "./glossary"
import { HelpVisual } from "./help-visuals"

// ----------------------------------------------------------------------------- which box is open

let openId: string | null = null
let expandOnOpen = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Open the help box beside a control's Info icon (closing any other). */
export function openInfo(id: string, opts: { expanded?: boolean } = {}) {
  openId = id
  expandOnOpen = !!opts.expanded
  emit()
}
export function closeInfo() {
  if (openId === null) return
  openId = null
  emit()
}
// Focus opens a box only when it came from the keyboard, not from a click or tap.
let keyboard = false
if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboard = true }, true)
  document.addEventListener("pointerdown", () => { keyboard = false }, true)
}

/** Is there an Info icon on the page for this control? */
export const infoIconFor = (id: string) => document.querySelector<HTMLElement>(`[data-info-for="${CSS.escape(id)}"]`)

// ----------------------------------------------------------------------------- the icon

// The first mounted icon for an id owns it; others for the same id render nothing.
const owners = new Map<string, string>()
function useOwnsIcon(id: string) {
  const me = useId()
  const owner = useSyncExternalStore(subscribe, () => owners.get(id) ?? null, () => null)
  useLayoutEffect(() => {
    if (!owners.has(id)) { owners.set(id, me); emit() }
    return () => { if (owners.get(id) === me) { owners.delete(id); emit() } }
  }, [id, me])
  return owner === null || owner === me
}

export function InfoTip({ id, disabled = false, className }: { id: string; disabled?: boolean; className?: string }) {
  const owns = useOwnsIcon(id)
  const showIcons = useLab((s) => s.prefs.infoIcons ?? true)
  const entry = helpFor(id)
  if (!entry || entry.region || !owns) return null
  const unavailable = disabled && !!entry.disabled
  // Turning the icons off hides them, except where they explain why a control is unavailable.
  if (!showIcons && !unavailable) return null

  return (
    <HelpPopover
      openKey={id}
      popupId={id}
      ariaLabel={unavailable ? `Why is ${entry.label} unavailable?` : `About ${entry.label}`}
      triggerProps={{ "data-info-for": id }}
      iconClassName={unavailable ? "text-src-sim-ink" : undefined}
      className={className}
    >
      {(open) => <InfoBody id={id} unavailable={unavailable} key={String(open)} />}
    </HelpPopover>
  )
}

/** The anchored help box shared by control help (InfoTip) and term help (TermHelp): the icon, the
 *  hover delay, pinning, Escape and outside click, and one-box-at-a-time all live here. */
export function HelpPopover({ openKey, popupId, ariaLabel, triggerProps, iconClassName, className, size = "md", children }: {
  openKey: string
  popupId: string
  ariaLabel: string
  triggerProps?: Record<string, string>
  iconClassName?: string
  className?: string
  size?: "md" | "sm"
  children: (open: boolean) => ReactNode
}) {
  const current = useSyncExternalStore(subscribe, () => openId, () => null)
  const open = current === openKey
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) openInfo(openKey)
        else if (openId === openKey) closeInfo()
      }}
    >
      <Popover.Trigger
        openOnHover
        delay={500}
        closeDelay={200}
        type="button"
        aria-label={ariaLabel}
        {...triggerProps}
        // Keyboard focus opens the box too; a mouse click is handled by the trigger itself.
        onFocus={() => { if (keyboard && openId !== openKey) openInfo(openKey) }}
        className={cn(
          "relative inline-flex flex-none items-center justify-center rounded-full align-middle outline-none transition-colors",
          size === "md" ? "size-6" : "-my-1 size-5",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-data",
          iconClassName ?? "text-muted-foreground hover:text-data data-[popup-open]:text-data",
          className,
        )}
      >
        <InfoCircleIcon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={8} collisionPadding={8} className="z-[60]">
          <Popover.Popup
            initialFocus={false}
            data-testid="info-popup"
            data-info-popup={popupId}
            className="flex max-h-[min(70vh,34rem)] w-[min(22rem,calc(100vw-16px))] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-xl border border-companion-edge border-t-[3px] border-t-data bg-companion text-left text-sm font-normal normal-case tracking-normal text-foreground shadow-lg outline-none transition-[opacity,scale] duration-150 data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Popover.Arrow className="data-[side=bottom]:top-[-7px] data-[side=top]:bottom-[-7px] data-[side=left]:right-[-7px] data-[side=right]:left-[-7px]">
              <svg width="14" height="7" viewBox="0 0 14 7" aria-hidden="true" className="block data-[side=bottom]:rotate-180">
                <path d="M0 0 L7 7 L14 0 Z" fill="var(--companion)" stroke="var(--companion-edge)" />
              </svg>
            </Popover.Arrow>
            {children(open)}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The title row of a help box, with its close button. */
export function HelpTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 pt-3">
      <Popover.Title className="text-sm font-semibold">{children}</Popover.Title>
      <Popover.Close aria-label="Close help" className="-mr-1.5 -mt-1 inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-data">
        <XmarkIcon className="size-4" />
      </Popover.Close>
    </div>
  )
}

function InfoBody({ id, unavailable }: { id: string; unavailable: boolean }) {
  const entry = helpFor(id)!
  const [more, setMore] = useState(expandOnOpen)
  const L = entry.learn
  const explanation = document.querySelector<HTMLElement>('[data-help-id="layout.explanation"]')
  return (
    <>
      <HelpTitle>{entry.label}</HelpTitle>
      <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-3 pt-1 text-sm" data-testid="info-body">
        {unavailable && <p className="rounded-md bg-src-sim px-2.5 py-1.5 text-src-sim-ink"><span className="font-medium">Unavailable now. </span>{entry.disabled}</p>}
        <Popover.Description>{entry.does}</Popover.Description>
        <p className="w-fit rounded-md bg-companion-callout px-2 py-0.5 text-label font-medium">{EFFECT_LABEL[entry.effect]}</p>
        {more && (
          <div className="flex flex-col gap-2 border-t border-companion-edge pt-2" data-testid="info-more">
            <p><span className="font-medium">Use it when: </span>{entry.when}</p>
            {L?.purpose && <p>{L.purpose}</p>}
            {L?.visual && <HelpVisual id={L.visual} />}
            {L && (
              <dl className="flex flex-col gap-1.5">
                <div><dt className="text-label font-medium text-muted-foreground">What it uses</dt><dd>{L.input}</dd></div>
                <div><dt className="text-label font-medium text-muted-foreground">What changes</dt><dd>{L.changes}</dd></div>
                <div><dt className="text-label font-medium text-muted-foreground">What to look for afterwards</dt><dd>{L.lookFor}</dd></div>
                {L.misconception && <div><dt className="text-label font-medium text-muted-foreground">A common misunderstanding</dt><dd>{L.misconception}</dd></div>}
              </dl>
            )}
            {entry.term && <p>Definition: <Term id={entry.term} className="font-medium" /></p>}
            {explanation && (
              <button type="button" className="self-start underline underline-offset-2" onClick={() => {
                closeInfo()
                explanation.scrollIntoView({ block: "start" })
                const h = explanation.querySelector<HTMLElement>("h2")
                h?.setAttribute("tabindex", "-1")
                h?.focus({ preventScroll: true })
              }}>Read this page's explanation</button>
            )}
          </div>
        )}
        {!more && (
          <button type="button" className="inline-flex items-center gap-1 self-start font-medium text-data underline-offset-2 hover:underline" onClick={() => setMore(true)} aria-expanded={false}>
            More details <NavArrowDownIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  )
}
