"use client"

/**
 * One of a PDF's own form fields, filled in place on the page in the Fill and
 * sign tool: an input, checkbox or select drawn exactly over the box the form
 * prints, at the position src/lib/pdf-tools.ts read from the file.
 *
 * Before this, a form's fields could only be filled in a list beside the
 * document while the page itself kept showing empty boxes, which looked like
 * the tool did nothing. The list is still there for small or crowded fields;
 * both edit the same value.
 *
 * Pointer and click events stop here, so filling a field never places a mark
 * on the page underneath.
 */
import type { FieldWidget, FormFieldInfo } from "@/lib/pdf-tools"

export function FormFieldInput({
  field,
  widget,
  value,
  chooseLabel,
  onChange,
}: {
  field: FormFieldInfo
  widget: FieldWidget
  value: string | boolean | undefined
  chooseLabel: string
  onChange: (value: string | boolean) => void
}) {
  const style = { left: `${widget.x}%`, top: `${widget.y}%`, width: `${widget.width}%`, height: `${widget.height}%` }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const box = "absolute border border-sky-500/60 bg-sky-50/70 text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={field.name}
        checked={(value ?? field.value) === true}
        onChange={(e) => onChange(e.target.checked)}
        onPointerDown={stop}
        onClick={stop}
        className={`${box} m-0 cursor-pointer accent-sky-700`}
        style={style}
      />
    )
  }

  if (field.type === "choice") {
    return (
      <select
        aria-label={field.name}
        value={String(value ?? field.value)}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={stop}
        onClick={stop}
        className={`${box} px-0.5 text-[clamp(9px,2.2vw,13px)]`}
        style={style}
      >
        <option value="">{chooseLabel}</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      aria-label={field.name}
      value={String(value ?? field.value)}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stop}
      onClick={stop}
      className={`${box} px-1 text-[clamp(9px,2.4vw,13px)]`}
      style={style}
    />
  )
}
