import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"

const HoverCard = PreviewCardPrimitive.Root

const HoverCardTrigger = PreviewCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  HTMLDivElement,
  PreviewCardPrimitive.Popup.Props &
    Pick<
      PreviewCardPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset"
    >
>(
  (
    { className, align = "center", alignOffset, side, sideOffset = 4, ...props },
    ref
  ) => (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          ref={ref}
          className={cn(
            // Linear popover: rounded-[0.75rem], shadow, ring border
            "z-50 w-64 rounded-[0.75rem] bg-popover p-4 text-popover-foreground shadow-[0_0.25rem_1rem_0_rgb(0_0_0/0.08),0_0_0_0.0625rem_rgb(0_0_0/0.06)] outline-none",
            "transition-[transform,translate,scale,opacity] duration-150",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "data-starting-style:scale-95 data-ending-style:scale-95",
            "data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2",
            "data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
)
HoverCardContent.displayName = "HoverCardContent"

export { HoverCard, HoverCardTrigger, HoverCardContent }
