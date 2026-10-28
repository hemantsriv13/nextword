import { lazy, Suspense, type ComponentType } from "react"
import { MotionConfig } from "motion/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GlossaryProvider } from "@/components/lab/glossary"
import { HelpProvider } from "@/components/lab/help"
import { ToolkitTourProvider } from "@/components/lab/toolkit-tour"
import { CheckpointProvider } from "@/components/lab/checkpoint"
import { LoadingRows } from "@/components/lab/layout"
import { Shell } from "@/components/lab/shell"
import { PixelAlien } from "@/components/lab/pixel-alien"
import { WorkspaceBoundary } from "@/components/lab/boundary"
import type { Route } from "@/content/glossary"
import { useRoute } from "@/lib/hooks"

const PAGES: Record<Route, ComponentType> = {
  home: lazy(() => import("@/workspaces/Home")),
  journey: lazy(() => import("@/workspaces/Journey")),
  playground: lazy(() => import("@/workspaces/Playground")),
  data: lazy(() => import("@/workspaces/DataStudio")),
  counts: lazy(() => import("@/workspaces/Counts")),
  neural: lazy(() => import("@/workspaces/Neural")),
  attention: lazy(() => import("@/workspaces/Attention")),
  decoding: lazy(() => import("@/workspaces/Decoding")),
  evaluation: lazy(() => import("@/workspaces/Evaluation")),
  adapt: lazy(() => import("@/workspaces/Adapt")),
  serving: lazy(() => import("@/workspaces/Serving")),
  toolkit: lazy(() => import("@/workspaces/Toolkit")),
  glossary: lazy(() => import("@/workspaces/Glossary")),
  notebook: lazy(() => import("@/workspaces/Notebook")),
}

export function App() {
  const { route } = useRoute()
  const Page = PAGES[route]
  return (
    <MotionConfig reducedMotion="user">
    <TooltipProvider delay={300}>
      <GlossaryProvider>
      <HelpProvider>
      <ToolkitTourProvider>
      <CheckpointProvider>
        <Shell>
          <WorkspaceBoundary name={route}>
          <Suspense fallback={<div className="p-6"><LoadingRows rows={6} label="Loading workspace" /></div>}>
            <Page key={route} />
          </Suspense>
          </WorkspaceBoundary>
        </Shell>
        <PixelAlien />
      </CheckpointProvider>
      </ToolkitTourProvider>
      </HelpProvider>
      </GlossaryProvider>
    </TooltipProvider>
    </MotionConfig>
  )
}

export default App
