"use client"

/**
 * The theme switch's dropdown, loaded on first use by ThemeToggle
 * (theme-toggle.tsx), which owns the state and renders the trigger until
 * then. Kept apart so the Radix dropdown is not part of every page's first
 * load (src/hooks/use-deferred.ts says why).
 */
import { Check, Monitor, Moon, Sun } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export type Theme = "light" | "dark" | "system"

const options: { value: Theme; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

export default function ThemeMenu({
  trigger,
  theme,
  labels,
  onSelect,
}: {
  trigger: React.ReactElement
  theme: Theme | null
  labels: Record<Theme, string>
  onSelect: (theme: Theme) => void
}) {
  return (
    // Mounted by a click on the placeholder, so it opens at once.
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        {options.map(({ value, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => onSelect(value)}>
            <Icon />
            {labels[value]}
            {theme === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
