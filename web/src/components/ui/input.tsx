import * as React from "react"

import { cn } from "@/lib/utils"

// Linear Input — dark developer tool aesthetic
// Dark bg, subtle border, purple glow on focus (matches the ring/primary color)
// Resting: inset shadow for depth, border slightly visible
// Focus: purple ring + border brightens

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  nativeInput?: boolean
  size?: "default" | "sm"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", nativeInput: _nativeInput, ...props }, ref) => {
    void _nativeInput
    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md bg-card px-3 py-2 text-sm text-foreground",
          size === "sm" ? "h-8" : "h-9",
          "border border-input",
          "shadow-[inset_0_0.0625rem_0.125rem_rgba(0,0,0,0.04)]",
          "placeholder:text-muted-foreground",
          "transition-[border-color,box-shadow] duration-150 ease-out",
          "hover:border-border/80",
          "focus-visible:outline-none focus-visible:border-primary/60",
          "focus-visible:shadow-[inset_0_0.0625rem_0.125rem_rgba(0,0,0,0.1),0_0_0_0.1875rem_color-mix(in_oklch,var(--primary)_30%,transparent)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
