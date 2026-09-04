import { useEffect, useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  onFocus?: () => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  disabled?: boolean
}

/**
 * A labeled numeric input that stays in sync with external value changes (e.g. canvas drags).
 * `onChange` fires live on every keystroke (for immediate visual feedback); `onFocus`/`onCommit`
 * bracket a typing session so callers can coalesce it into a single history entry.
 */
export function NumberField({ label, value, onChange, onCommit, onFocus, min, max, step = 1, suffix, disabled }: NumberFieldProps) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100))

  useEffect(() => {
    setText(String(Math.round(value * 100) / 100))
  }, [value])

  function clamp(n: number): number {
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    return v
  }

  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className="w-20 rounded border border-surface-border bg-surface-2 px-2 py-1 text-right text-slate-100 outline-none focus:border-accent disabled:opacity-40"
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onFocus={() => onFocus?.()}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) onChange(clamp(n))
          }}
          onBlur={() => {
            const n = Number(text)
            const v = Number.isNaN(n) ? value : clamp(n)
            setText(String(v))
            ;(onCommit ?? onChange)(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </span>
    </label>
  )
}
