"use client"

import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { ButtonHTMLAttributes, forwardRef } from "react"

// The visual system's buttons (src/app/globals.css): PandaDoc's inspected
// shapes in Salsox's colours. 600 weight, a 2px border on every variant so
// filled and outlined buttons are the same size, a darker fill on hover
// instead of a lift or a glow, square corners. Sizes follow PandaDoc's small
// (h-50, 16px) and large (h-60, 18px) buttons, with two compact sizes for
// the app's dense screens.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        // Same as primary now: the visual system has no gradients. Kept as a
        // variant so the pages that ask for it need no change.
        gradient: "border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover",
        secondary: "border-secondary bg-secondary text-secondary-foreground hover:border-accent hover:bg-accent",
        // inspected: PandaDoc's secondary button, ink border at 60% -> full ink
        outline: "border-foreground/60 bg-transparent text-foreground hover:border-foreground",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-accent",
        destructive: "border-destructive bg-destructive text-white hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-[18px] text-[15px]",
        lg: "h-[50px] px-[18px] text-base",
        xl: "h-[60px] px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)

// The kit's buttons before the visual system: pills that lifted and glowed.
// const buttonVariants = cva(
//   "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-0",
//   {
//     variants: {
//       variant: {
//         primary:
//           "bg-primary text-primary-foreground shadow-soft hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]",
//         gradient:
//           "relative overflow-hidden text-primary-foreground shadow-soft [background-image:var(--gradient-brand)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]",
//         secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
//         outline:
//           "border border-border bg-background/60 backdrop-blur-sm text-foreground hover:bg-accent hover:-translate-y-0.5",
//         ghost: "bg-transparent hover:bg-accent text-foreground",
//         destructive: "bg-destructive text-white hover:opacity-90 hover:-translate-y-0.5",
//       },
//       size: {
//         sm: "h-9 px-4 text-sm",
//         md: "h-11 px-5 text-sm",
//         lg: "h-13 px-8 text-base",
//         xl: "h-16 px-10 text-lg",
//       },
//     },
//     defaultVariants: { variant: "primary", size: "md" },
//   }
// )

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, asChild, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    return (
      <Comp
        ref={ref as React.Ref<HTMLButtonElement>}
        disabled={!asChild && (disabled || loading)}
        className={cn("group/btn", buttonVariants({ variant, size }), className)}
        {...props}
      >
        {asChild ? children : (
          <>
            {/* The gradient variant's light sweep went with the gradient:
            {variant === "gradient" && (
              <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-[120%] skew-x-12 bg-white/25 transition-transform duration-700 ease-out group-hover/btn:translate-x-[220%]" />
            )} */}
            {loading && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
