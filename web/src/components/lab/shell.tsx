import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import {
  BookIcon, CollapseIcon, DatabaseIcon, DiceThreeIcon, EditPencilIcon, ExpandIcon, EyeIcon, GitForkIcon, GraphUpIcon,
  HalfMoonIcon, HomeIcon, PathArrowIcon, JournalIcon, MenuIcon, NetworkIcon, SearchIcon, ServerIcon, SidebarCollapseIcon, SidebarExpandIcon, SunLightIcon, TableIcon, WarningTriangleIcon,
} from "@/components/icons"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GLOSSARY, type Route } from "@/content/glossary"
import { WORKSPACES, WORKSPACE_BY_ROUTE } from "@/content/journey"
import { api } from "@/lib/api"
import { navigate, useMediaQuery, useRoute } from "@/lib/hooks"
import { actions, useLab } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useGlossary } from "./glossary"
import { useFocusMode } from "./shell-state"

type IconType = ComponentType<SVGProps<SVGSVGElement>>

const ICONS: Record<Route, IconType> = {
  home: HomeIcon, journey: PathArrowIcon, playground: EditPencilIcon, data: DatabaseIcon, counts: TableIcon, neural: NetworkIcon, attention: EyeIcon,
  decoding: DiceThreeIcon, evaluation: GraphUpIcon, serving: ServerIcon, adapt: GitForkIcon, glossary: BookIcon, notebook: JournalIcon,
}

const GROUPS: { id: string; label: string; routes: Route[] }[] = [
  { id: "write", label: "Write", routes: ["home", "journey", "playground"] },
  { id: "engine", label: "Text and counts", routes: ["data", "counts"] },
  { id: "neural", label: "Neural models", routes: ["neural", "attention", "decoding"] },
  { id: "measure", label: "Measure and apply", routes: ["evaluation", "serving", "adapt"] },
  { id: "keep", label: "Reference", routes: ["glossary", "notebook"] },
]

/** The product mark: a typed letter followed by its suggested next character. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="3" width="13" height="18" rx="3" fill="var(--foreground)" />
      <path d="M4.6 16.5V7.5l5.8 9V7.5" fill="none" stroke="var(--card)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="3" width="7" height="18" rx="2.5" fill="var(--data)" />
    </svg>
  )
}

// ----------------------------------------------------------------------------- engine status

function useEngineStatus() {
  const [status, setStatus] = useState<{ ok: boolean; version?: string; checked: boolean }>({ ok: false, checked: false })
  useEffect(() => {
    let alive = true
    const check = () => api.health().then((h) => alive && setStatus({ ok: h.ok, version: h.modelVersion, checked: true }), () => alive && setStatus({ ok: false, checked: true }))
    check()
    const t = setInterval(check, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return status
}

function EngineStatus({ compact = false }: { compact?: boolean }) {
  const s = useEngineStatus()
  const label = !s.checked ? "Checking engine" : s.ok ? "Engine connected" : "Engine offline"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground" aria-label={`${label}${s.version ? `, ${s.version}` : ""}`}>
            {s.checked && !s.ok ? <WarningTriangleIcon className="size-4 text-negative" aria-hidden="true" /> : <span className={cn("size-2 rounded-full", !s.checked ? "bg-chart-5" : "bg-positive")} aria-hidden="true" />}
            {!compact && <span>{label}</span>}
          </span>
        }
      />
      <TooltipContent className="max-w-xs">
        {s.ok ? <>Python engine running locally: <span className="tok">{s.version}</span></> : <>Start it in the project folder: <span className="tok">.venv\Scripts\python -m nextword.lab</span>. Simulations keep working without it.</>}
      </TooltipContent>
    </Tooltip>
  )
}

// ----------------------------------------------------------------------------- search

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const glossary = useGlossary()
  const notes = useLab((s) => s.notes)
  const go = (fn: () => void) => { onOpenChange(false); fn() }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search workspaces, terms, experiments and notes" aria-label="Search" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing matches. Try a term like “softmax” or “leakage”.</CommandEmpty>
        <CommandGroup heading="Workspaces">
          {WORKSPACES.map((w) => {
            const Icon = ICONS[w.route]
            return (
              <CommandItem key={w.route} value={`workspace ${w.title} ${w.description}`} onSelect={() => go(() => navigate(w.route))}>
                <Icon className="mr-2 size-4 text-muted-foreground" />
                <span>{w.title}</span>
                <span className="ml-2 truncate text-muted-foreground">{w.description}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="Terms">
          {GLOSSARY.map((g) => (
            <CommandItem key={g.id} value={`term ${g.term} ${(g.aliases ?? []).join(" ")} ${g.plain}`} onSelect={() => go(() => glossary.open(g.id))}>
              <BookIcon className="mr-2 size-4 text-muted-foreground" />
              <span>{g.term}</span>
              <span className="ml-2 truncate text-muted-foreground">{g.plain}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Experiments">
          {GLOSSARY.map((g) => (
            <CommandItem key={`x-${g.id}`} value={`experiment ${g.experiment.label} ${g.term}`} onSelect={() => go(() => navigate(g.experiment.route))}>
              <span>{g.experiment.label}</span>
              <span className="ml-2 truncate text-muted-foreground">{WORKSPACE_BY_ROUTE.get(g.experiment.route)?.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {notes.length > 0 && (
          <CommandGroup heading="Your notes">
            {notes.slice(0, 40).map((n) => (
              <CommandItem key={n.id} value={`note ${n.kind} ${n.text}`} onSelect={() => go(() => navigate("notebook"))}>
                <JournalIcon className="mr-2 size-4 text-muted-foreground" />
                <span className="truncate">{n.text}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// ----------------------------------------------------------------------------- navigation

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { route } = useRoute()
  return (
    <nav aria-label="Workspaces" className="flex flex-col gap-4">
      {GROUPS.map((g) => (
        <SidebarGroup key={g.id}>
          {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
          {g.routes.map((r) => {
            const w = WORKSPACE_BY_ROUTE.get(r)!
            const Icon = ICONS[r]
            const item = (
              <SidebarItem
                key={r}
                icon={<Icon />}
                label={w.short}
                active={route === r}
                collapsed={collapsed}
                aria-current={route === r ? "page" : undefined}
                aria-label={collapsed ? w.title : undefined}
                onClick={() => { navigate(r); onNavigate?.() }}
                className={cn("h-8 py-0", route === r && "bg-active font-medium text-foreground")}
              />
            )
            return collapsed ? (
              <Tooltip key={r}>
                <TooltipTrigger render={item} />
                <TooltipContent side="right">{w.title}</TooltipContent>
              </Tooltip>
            ) : item
          })}
        </SidebarGroup>
      ))}
    </nav>
  )
}

function ThemeButton() {
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <SunLightIcon className="size-[18px]" /> : <HalfMoonIcon className="size-[18px]" />}
          </Button>
        }
      />
      <TooltipContent>{dark ? "Light theme" : "Dark theme"} <Kbd className="ml-1">D</Kbd></TooltipContent>
    </Tooltip>
  )
}

// ----------------------------------------------------------------------------- shell

export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useLab((s) => s.prefs.sidebarCollapsed)
  const { focus, setFocus } = useFocusMode()
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const desktop = useMediaQuery("(min-width: 900px)")
  const { route } = useRoute()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editable = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable='true']")
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !editable)) { e.preventDefault(); setSearchOpen(true) }
      if (e.key === "Escape" && focus) setFocus(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus, setFocus])

  useEffect(() => {
    actions.visit(route)
    document.title = `${WORKSPACE_BY_ROUTE.get(route)?.title ?? "Home"} · NextWord Lab`
  }, [route])

  const focusButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={focus ? "Leave focus mode" : "Focus mode: hide navigation and explanations"} aria-pressed={focus} onClick={() => setFocus(!focus)}>
            {focus ? <CollapseIcon className="size-[18px]" /> : <ExpandIcon className="size-[18px]" />}
          </Button>
        }
      />
      <TooltipContent>{focus ? "Leave focus mode (Esc)" : "Focus mode"}</TooltipContent>
    </Tooltip>
  )

  const searchButton = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="flex h-8 w-full max-w-[548px] items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground hover:border-foreground/30"
    >
      <SearchIcon className="size-4" />
      <span className="truncate">Search terms and experiments</span>
      <span className="ml-auto hidden items-center gap-1 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
    </button>
  )

  if (focus) {
    return (
      <div className="min-h-dvh bg-card">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <div className="fixed right-3 top-3 z-40 flex items-center gap-1 rounded-md border border-border bg-card p-0.5">{focusButton}</div>
        <main id="main" className="mx-auto max-w-[1400px]">{children}</main>
        <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {desktop && (
        <Sidebar collapsed={collapsed} className={cn("sticky top-0 h-dvh flex-none border-r-0 bg-background", collapsed ? "w-16" : "w-[240px]")}>
          <SidebarHeader className={cn("h-12 gap-2.5 border-b-0", collapsed ? "justify-center px-0" : "px-4")}>
            <Mark className="size-6 flex-none" />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">NextWord Lab</p>
                <p className="truncate text-xs text-muted-foreground">Local, nextword folder</p>
              </div>
            )}
          </SidebarHeader>
          <SidebarContent className="pt-3">
            <NavItems collapsed={collapsed} />
          </SidebarContent>
          <SidebarFooter className="border-t-0">
            <SidebarItem
              icon={collapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
              label="Collapse sidebar"
              collapsed={collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => actions.setPref("sidebarCollapsed", !collapsed)}
              className="h-8 py-0"
            />
          </SidebarFooter>
        </Sidebar>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 flex-none items-center gap-2 bg-background px-3">
          {!desktop && (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
                <MenuIcon className="size-5" />
              </Button>
              <span className="truncate text-sm font-semibold">{WORKSPACE_BY_ROUTE.get(route)?.short}</span>
            </div>
          )}
          {desktop && <div className="flex flex-1 justify-center">{searchButton}</div>}
          <div className="flex items-center gap-0.5">
            {!desktop && (
              <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setSearchOpen(true)}>
                <SearchIcon className="size-[18px]" />
              </Button>
            )}
            <EngineStatus compact={!desktop} />
            <ThemeButton />
            {focusButton}
          </div>
        </header>
        <main id="main" className={cn("min-w-0 flex-1 bg-card", desktop ? "mb-2 mr-2 rounded-2xl border border-border" : "border-t border-border")}>
          {children}
        </main>
      </div>
      {!desktop && (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-[280px] overflow-y-auto bg-background p-4">
            <div className="mb-4 flex items-center gap-2.5">
              <Mark className="size-6" />
              <SheetTitle className="text-sm">NextWord Lab</SheetTitle>
            </div>
            <SheetDescription className="sr-only">Navigation</SheetDescription>
            <NavItems collapsed={false} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
