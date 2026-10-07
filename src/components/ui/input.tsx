import { cn } from "@/lib/utils"
import { InputHTMLAttributes, forwardRef } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

// Visual system (globals.css): white field, ink-30% border (--input),
// accent border on focus, 16px text, which also keeps iOS from zooming in
// on focus. Was bg-secondary with a hairline border, text-sm, h-10.
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={ref}
          className={cn(
            "flex h-11 w-full border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export { Input }
