import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { type VariantProps } from "class-variance-authority"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"
import { toggleVariants } from "./toggle"
import { springInteraction } from "@/lib/motion"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & { uid: string; isSingle: boolean }
>({
  size: "default",
  variant: "default",
  uid: "",
  isSingle: false,
})

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof toggleVariants>) {
  const uid = React.useId()
  const isSingle = !props.multiple

  return (
    <ToggleGroupPrimitive
      className={cn(
        "flex items-center gap-1 rounded-[0.625rem] border border-border bg-secondary p-1",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, uid, isSingle }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}
ToggleGroup.displayName = "ToggleGroup"

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        "text-muted-foreground hover:text-foreground",
        "data-pressed:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
      render={(buttonProps, state) => (
        <button {...buttonProps}>
          <AnimatePresence initial={false}>
            {state.pressed && (
              <motion.div
                key="indicator"
                layoutId={
                  context.isSingle ? `toggle-indicator-${context.uid}` : undefined
                }
                className="absolute inset-0 rounded-lg bg-background shadow-sm"
                initial={context.isSingle ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  context.isSingle ? { opacity: 0 } : { opacity: 0, scale: 0.8 }
                }
                transition={springInteraction}
              />
            )}
          </AnimatePresence>
          <span className="relative z-10">{children}</span>
        </button>
      )}
    />
  )
}
ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem }
