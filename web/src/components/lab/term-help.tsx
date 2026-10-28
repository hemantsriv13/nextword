// Help for a technical term where it is used: a small Info icon beside the term's first meaningful
// occurrence in a panel, opening the same anchored box as control help (hover or keyboard focus to
// peek, click or tap to pin, Escape or an outside click to close, one box at a time).
// Definitions come from the glossary (content/glossary.ts) and are never repeated per page. A page
// adds only what is specific to it: what the term means here and, when a result is on screen, an
// example built from that displayed result. Those are plain values passed in by the page, so opening
// help never recomputes an experiment, changes a setting or draws a random number.
import { useId, useState, type ReactNode } from "react"
import { Popover } from "@base-ui/react/popover"
import { NavArrowDownIcon, NavArrowLeftIcon } from "@/components/icons"
import { findTerm, type GlossaryEntry } from "@/content/glossary"
import { useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useGlossary, WorkedTable } from "./glossary"
import { closeInfo, HelpPopover, HelpTitle } from "./info-tip"

interface TermHelpProps {
  /** Glossary id. */
  id: string
  /** The visible term, kept on the same line as its icon. */
  children?: ReactNode
  /** Its role in this experiment, in a sentence. */
  here?: ReactNode
  /** An example from the result on screen. Without one, the glossary's illustrative example shows. */
  example?: ReactNode
  className?: string
}

/** A term in running text, a heading or a label, with its Info icon. */
export function TermHelp({ id, children, here, example, className }: TermHelpProps) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {children}
      <TermIcon id={id} here={here} example={example} />
    </span>
  )
}

/** A function or symbol inside an equation, such as exp, ln or NLL, with its Info icon. */
export function MathHelp(props: TermHelpProps) {
  return <TermHelp {...props} />
}

function TermIcon({ id, here, example }: Omit<TermHelpProps, "children" | "className">) {
  const uid = useId()
  const showIcons = useLab((s) => s.prefs.infoIcons ?? true)
  const entry = findTerm(id)
  if (!entry || !showIcons) return null
  return (
    <HelpPopover
      openKey={`term:${id}:${uid}`}
      popupId={`term:${id}`}
      ariaLabel={`What is ${entry.abbr ?? entry.term}?`}
      triggerProps={{ "data-term-for": id }}
      size="sm"
      className="ml-0.5"
    >
      {(open) => <TermBody id={id} here={here} example={example} key={String(open)} />}
    </HelpPopover>
  )
}

function TermBody({ id, here, example }: { id: string; here?: ReactNode; example?: ReactNode }) {
  // A prerequisite opens in the same box; Back returns to the term you asked about.
  const [trail, setTrail] = useState<string[]>([id])
  const [deeper, setDeeper] = useState(false)
  const shown = findTerm(trail.at(-1)!)!
  const isOrigin = trail.length === 1
  const glossary = useGlossary()
  const go = (next: string[]) => { setTrail(next); setDeeper(false) }
  return (
    <>
      <HelpTitle>{shown.abbr ?? shown.term}</HelpTitle>
      <div className="flex flex-col gap-2.5 overflow-y-auto px-4 pb-3 pt-1 text-sm" data-testid="term-body" data-term={shown.id}>
        {!isOrigin && (
          <button type="button" onClick={() => go(trail.slice(0, -1))} className="-ml-1 inline-flex items-center gap-1 self-start rounded-md px-1 text-label font-medium text-data hover:underline focus-visible:outline-2 focus-visible:outline-data">
            <NavArrowLeftIcon className="size-3.5" aria-hidden="true" /> Back to {nameOf(findTerm(trail.at(-2)!)!)}
          </button>
        )}
        {(shown.abbr || shown.say) && (
          <p className="-mt-1.5 text-label text-muted-foreground">
            {shown.abbr && shown.abbr !== shown.term && <>Short for {shown.term}. </>}
            {shown.say && <>Read it as “{shown.say}”.</>}
          </p>
        )}
        {shown.needs && shown.needs.length > 0 && (
          <p className="text-label text-muted-foreground">
            Builds on{" "}
            {shown.needs.map((n, i) => {
              const need = findTerm(n)
              if (!need) return null
              return (
                <span key={n}>
                  {i > 0 && (i === shown.needs!.length - 1 ? " and " : ", ")}
                  <button type="button" onClick={() => go([...trail, n])} className="font-medium text-data underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-data">
                    {nameOf(need)}
                  </button>
                </span>
              )
            })}
            .
          </p>
        )}
        <Popover.Description>{shown.plain}</Popover.Description>
        {isOrigin && here && <Section title="What it means here">{here}</Section>}
        {isOrigin && example
          ? <Section title="From the result on screen" testId="term-example">{example}</Section>
          : <Section title="Illustrative example">{shown.worked ? <WorkedTable w={shown.worked} /> : shown.example}</Section>}
        {deeper ? (
          <div className="flex flex-col gap-2.5 border-t border-companion-edge pt-2.5" data-testid="term-deeper">
            <Section title="Precisely">{shown.technical}</Section>
            {isOrigin && example && shown.worked && <Section title="Illustrative example"><WorkedTable w={shown.worked} /></Section>}
          </div>
        ) : (
          <button type="button" onClick={() => setDeeper(true)} aria-expanded={false} className="inline-flex items-center gap-1 self-start font-medium text-data underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-data">
            Go deeper <NavArrowDownIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
        <Section title="A common misunderstanding">{shown.misconception}</Section>
        <button
          type="button"
          className="self-start underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-data"
          onClick={() => { closeInfo(); glossary.open(shown.id) }}
        >
          Open the glossary entry for {nameOf(shown)}
        </button>
      </div>
    </>
  )
}

const nameOf = (e: GlossaryEntry) => e.abbr ?? e.term

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <p className="text-label font-medium text-muted-foreground">{title}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
