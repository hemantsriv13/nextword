"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { springInteraction } from "@/lib/motion"

const TabsContext = React.createContext<{ uid: string }>({ uid: "" })

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  const uid = React.useId()
  return (
    <TabsContext.Provider value={{ uid }}>
      <TabsPrimitive.Root className={cn("", className)} {...props} />
    </TabsContext.Provider>
  )
}
Tabs.displayName = "Tabs"

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
TabsList.displayName = "TabsList"

function TabsTrigger({
  className,
  children,
  ...props
}: TabsPrimitive.Tab.Props) {
  const { uid } = React.useContext(TabsContext)

  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-foreground",
        className
      )}
      {...props}
      render={(tabProps, state) => (
        <button {...tabProps}>
          {state.active && (
            <motion.div
              layoutId={`tabs-indicator-${uid}`}
              className="absolute inset-0 rounded-sm bg-background shadow-sm"
              transition={springInteraction}
            />
          )}
          <span className="relative z-10">{children}</span>
        </button>
      )}
    />
  )
}
TabsTrigger.displayName = "TabsTrigger"

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
}
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
