import type { ReactNode } from 'react'

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="border-b border-surface-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        {actions}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  disabled?: boolean
  title?: string
  className?: string
}) {
  const base = 'rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const variants: Record<string, string> = {
    default: 'bg-surface-3 text-slate-100 hover:bg-surface-4',
    primary: 'bg-accent text-white hover:bg-accent-hover',
    danger: 'bg-red-900/60 text-red-200 hover:bg-red-900',
    ghost: 'bg-transparent text-slate-300 hover:bg-surface-3',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span className="text-slate-400">{label}</span>
      <select
        className="rounded border border-surface-border bg-surface-2 px-2 py-1 text-slate-100 outline-none focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}
