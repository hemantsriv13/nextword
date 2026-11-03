// What is running on this computer, from the backend's own answers (lib/system.ts). It never asks the
// explaining model to generate: it only asks Colibri which models it serves. Each row says what works
// without the part that is missing.
import { RefreshDoubleIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { engineOf, type SystemStatus } from "@/lib/system"
import { cn } from "@/lib/utils"

type Tone = "ok" | "off" | "wait" | "planned"

function Row({ name, tone, state, detail }: { name: string; tone: Tone; state: string; detail?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0" data-testid="system-row" data-tone={tone}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{name}</span>
        <span className={cn("inline-flex flex-none items-center gap-1.5 text-sm", tone === "ok" ? "text-positive" : tone === "off" ? "text-foreground" : "text-muted-foreground")}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", tone === "ok" ? "bg-positive" : tone === "off" ? "bg-src-sim-edge ring-1 ring-foreground/40" : "bg-muted-foreground/40")} />
          {state}
        </span>
      </div>
      {detail && <div className="text-label text-muted-foreground">{detail}</div>}
    </li>
  )
}

export function SystemStatusList({ status, compact = false }: { status: SystemStatus; compact?: boolean }) {
  const { backend, engines, explainer } = status
  const mlp = engineOf(status, "char-mlp")
  const backendDown = backend.state === "failed"
  return (
    <div className="flex flex-col gap-3" data-help-id="home.status">
      <ul className="flex flex-col divide-y divide-border" aria-label="What is running on this computer" aria-live="polite">
        <Row name="Python backend" tone={backend.state === "ok" ? "ok" : backend.state === "checking" ? "wait" : "off"}
          state={backend.state === "ok" ? "Running" : backend.state === "checking" ? "Checking…" : "Not reachable"}
          detail={backendDown ? <>Start it in the project folder: <code className="tok">.venv\Scripts\python -m nextword.lab</code></> : !compact && backend.state === "ok" ? <>Engine version <span className="tok">{backend.data.modelVersion}</span></> : undefined} />
        <Row name="Bigram engine" tone={backend.state === "ok" ? "ok" : backend.state === "checking" ? "wait" : "off"}
          state={backend.state === "ok" ? "Available" : backend.state === "checking" ? "Checking…" : "Needs the backend"} />
        <Row name="Character MLP (PyTorch)" tone={mlp?.status === "available" ? "ok" : engines.state === "checking" ? "wait" : "off"}
          state={mlp?.status === "available" ? "Available" : engines.state === "checking" ? "Checking…" : backendDown || engines.state === "failed" ? "Needs the backend" : "Not available"}
          detail={mlp?.status === "available" ? (compact ? undefined : <>{mlp.version}, {mlp.savedRuns ?? 0} saved run{mlp.savedRuns === 1 ? "" : "s"}. Trains on the CPU; doesn't need the AI tutor.</>)
            : mlp?.status === "unavailable" ? <>{mlp.reason} {mlp.nextAction && <>Next: <code className="tok">{mlp.nextAction}</code></>}</> : undefined} />
        <Row name="AI tutor (Qwen through Colibri)" tone={explainer.state === "ok" && explainer.data.available && explainer.data.modelServed ? "ok" : explainer.state === "checking" ? "wait" : "off"}
          state={explainer.state === "checking" ? "Checking…" : explainer.state === "ok" && explainer.data.available && explainer.data.modelServed ? "Running" : "Off"}
          detail={explainer.state === "ok" && explainer.data.available && explainer.data.modelServed
            ? <>Serving <span className="tok">{explainer.data.model}</span>. Optional: lessons and models work without it.</>
            : explainer.state === "checking" ? undefined
            : <>Optional. Everything except “Ask your tutor” works without it. To use it, start Colibri with the command in <a className="underline underline-offset-2" href="/docs/LOCAL_AI.md">LOCAL_AI.md</a>.</>} />
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="bg-card" onClick={status.refresh}><RefreshDoubleIcon className="size-4" /> Check again</Button>
        <span className="text-label text-muted-foreground">Checking lists the running model; it never asks it to write anything.</span>
      </div>
    </div>
  )
}
