"use client"

/**
 * An on/off switch with a sprung thumb, for settings that matter enough to
 * deserve one (the admin Security page). Built on Radix's Switch, so keyboard
 * use, focus and the `switch` role with its checked state come from there;
 * framer-motion only moves the thumb and tints the track.
 *
 * `locked` keeps it on and shows a padlock in the thumb, for a setting that
 * cannot be turned off right now (the last sign-in method left on). `size`
 * "lg" is the page's headline switch. Square, like every control here, and
 * with reduced motion the thumb jumps instead of springing.
 */
import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { motion, useReducedMotion } from "framer-motion"
import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "children"> & {
  locked?: boolean
  size?: "md" | "lg"
}

export const MotionSwitch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, Props>(
  ({ className, checked, locked = false, size = "md", disabled, ...props }, ref) => {
    const reduceMotion = useReducedMotion()
    const on = Boolean(checked)
    const dims = size === "lg" ? { track: "h-8 w-14", thumb: "h-6 w-6", travel: 24 } : { track: "h-6 w-11", thumb: "h-4 w-4", travel: 20 }
    return (
      <SwitchPrimitive.Root
        ref={ref}
        checked={on}
        disabled={disabled || locked}
        aria-readonly={locked || undefined}
        className={cn(
          "group relative inline-flex shrink-0 cursor-pointer items-center border p-[3px] outline-none transition-colors duration-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed",
          on ? "border-primary bg-primary" : "border-border bg-muted",
          disabled && !locked && "opacity-50",
          locked && "cursor-default",
          dims.track,
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb asChild>
          <motion.span
            initial={false}
            animate={{ x: on ? dims.travel : 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 32, mass: 0.7 }}
            className={cn("pointer-events-none flex items-center justify-center bg-white shadow-sm", dims.thumb)}
          >
            {locked && <Lock className="h-3 w-3 text-primary" aria-hidden="true" />}
          </motion.span>
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    )
  }
)
MotionSwitch.displayName = "MotionSwitch"
