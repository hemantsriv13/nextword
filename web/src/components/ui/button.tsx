import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/lab/info-tip";

// Linear Button: dark developer tool, purple (#5e6ad2) primary
// Real linear.app treatment: gradient fill, 1px border ring, subtle drop shadow
// Secondary: dark panel with border, ghost understated

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-medium",
    "rounded-md transition-all duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.98] active:brightness-95",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary: gradient fill + border ring + drop shadow.
        // Ring color is derived from --primary via color-mix so theme overrides
        // (orange, green, etc.) automatically retint the ring.
        default:
          "bg-primary text-primary-foreground " +
          "shadow-[0_0_0_0.0625rem_color-mix(in_oklch,var(--primary)_55%,transparent),0_0.0625rem_0.1875rem_rgba(0,0,0,0.4),inset_0_0.0625rem_0_rgba(255,255,255,0.1)] " +
          "hover:bg-primary/90 hover:shadow-[0_0_0_0.0625rem_color-mix(in_oklch,var(--primary)_70%,transparent),0_0.125rem_0.375rem_rgba(0,0,0,0.4),inset_0_0.0625rem_0_rgba(255,255,255,0.12)]",
        // Secondary: dark panel, border, subtle shadow
        secondary:
          "bg-secondary text-secondary-foreground " +
          "border border-border " +
          "shadow-[0_0.0625rem_0.125rem_rgba(0,0,0,0.2)] " +
          "hover:bg-accent hover:border-border/60 hover:shadow-[0_0.0625rem_0.25rem_rgba(0,0,0,0.3)]",
        // Outline: transparent with full border
        outline:
          "border border-border bg-transparent text-foreground " +
          "hover:bg-secondary hover:border-border/80",
        // Ghost: no background, understated
        ghost:
          "bg-transparent text-muted-foreground " +
          "hover:bg-secondary hover:text-foreground",
        // Destructive
        destructive:
          "bg-destructive text-destructive-foreground " +
          "shadow-[0_0_0_0.0625rem_rgba(239,68,68,0.4),0_0.0625rem_0.1875rem_rgba(0,0,0,0.3)] " +
          "hover:bg-destructive/90",
        // Link
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm:      "h-8 px-3 text-xs rounded-md",
        default: "h-9 px-4",
        lg:      "h-10 px-6 text-sm",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends Omit<ButtonPrimitive.Props, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Callers written against the Radix API pass the element to become as a
    // child: <Button asChild><Link>…</Link></Button>. Base UI has no asChild,
    // it composes through `render`. Without this the prop reaches the DOM and
    // the anchor nests inside the button instead of replacing it, which stacks
    // the icon above the label and puts a link inside a button.
    if (asChild && React.isValidElement(props.children)) {
      const { children, ...rest } = props
      return (
        <ButtonPrimitive
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...rest}
          // After the spread, so an explicit asChild child wins over a stray
          // render prop rather than being silently replaced by it.
          // SAFETY: this branch runs only when `asChild` is set, and the caller then
          // owns passing a single element for the slot to clone.
          render={children as React.ReactElement}
        />
      );
    }

    const button = (
      <ButtonPrimitive
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
    // NextWord Lab: a button with contextual help gets its Info icon beside it, never inside it.
    // data-help-info="off" opts out (icon-only toolbar buttons whose label already says it all).
    const helpId = (props as Record<string, unknown>)["data-help-id"] as string | undefined
    if (!helpId || (props as Record<string, unknown>)["data-help-info"] === "off") return button
    // Button and icon travel together, so they stay on one line and centred on each other wherever
    // the row aligns its items. Placement classes (self-*, margins) move to the pair.
    const place = (className ?? "").split(/\s+/).filter((c) => /^(self-|m[trblxy]?-|-m[trblxy]?-)/.test(c))
    return (
      <span className={cn("inline-flex items-center gap-1", place)}>
        {React.cloneElement(button, { className: cn(buttonVariants({ variant, size, className: (className ?? "").split(/\s+/).filter((c) => !place.includes(c)).join(" ") })) })}
        <InfoTip id={helpId} disabled={!!props.disabled} />
      </span>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
