/**
 * One colour per signing role in a template, by the role's position: used
 * for the field boxes in the document preview and the "Who signs" list, so a
 * reader can see which fields belong to whom. Classes are written out in full
 * so Tailwind finds them.
 */
const TONES = [
  "border-sky-500/70 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  "border-emerald-500/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  "border-violet-500/70 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  "border-amber-500/70 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  "border-rose-500/70 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  "border-teal-500/70 bg-teal-500/10 text-teal-800 dark:text-teal-200",
]

export function roleTone(index: number): string {
  return TONES[index % TONES.length]
}
