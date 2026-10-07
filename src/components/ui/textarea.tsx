import { cn } from "@/lib/utils"
import { TextareaHTMLAttributes, forwardRef } from "react"

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

// Visual system (globals.css): styled like Input: white field, ink-30%
// border, accent on focus, 16px text. Was bg-secondary, hairline, text-sm.
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          ref={ref}
          className={cn(
            "flex min-h-24 w-full border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
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

Textarea.displayName = "Textarea"

export { Textarea }
