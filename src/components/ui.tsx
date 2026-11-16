import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { CATEGORIES, metaFor } from '../lib/categories'
import { money } from '../lib/util'

export function Modal({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
)

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange(v: T): void; options: [T, string][] }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'bad' }) => (
  <div className="card stat"><span className="stat-label">{label}</span><strong className={tone ?? ''}>{value}</strong>{sub && <span className="stat-sub">{sub}</span>}</div>
)

export const Empty = ({ title, children, emoji = '✨' }: { title: string; children?: ReactNode; emoji?: string }) => (
  <div className="empty"><span className="emoji" aria-hidden="true">{emoji}</span><strong>{title}</strong>{children && <p>{children}</p>}</div>
)

export const Page = ({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) => (
  <div className="page"><div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="actions">{actions}</div></div>{children}</div>
)

/** Category icon on a soft tint of that category's colour. */
export const CatIcon = ({ category, small }: { category: string; small?: boolean }) => {
  const m = metaFor(category)
  return <span className={`chip ${small ? 'sm' : ''}`} style={{ '--h': m.hue } as CSSProperties} aria-hidden="true">{m.icon}</span>
}

const BANK_COLOURS: [RegExp, string][] = [
  [/monzo/i, '#ff5a4d'], [/natwest|rbs/i, '#5a287d'], [/chase/i, '#117aca'], [/vanguard/i, '#96151d'], [/starling/i, '#6935d3'],
  [/revolut/i, '#191c1f'], [/barclay/i, '#00aeef'], [/hsbc/i, '#db0011'], [/lloyds/i, '#006a4d'], [/santander/i, '#ec0000'],
  [/nationwide/i, '#1d3c7d'], [/halifax/i, '#005eb8'], [/amex|american express/i, '#016fd0'],
]
/** Initial on the bank's own colour, so accounts are recognisable at a glance. */
export const BankDot = ({ name }: { name: string }) => {
  const colour = BANK_COLOURS.find(([re]) => re.test(name))?.[1] ?? 'var(--accent)'
  return <span className="bank" style={{ background: colour }} aria-hidden="true">{(name.trim().charAt(0) || '£').toUpperCase()}</span>
}

export const CategorySelect = ({ value, onChange, all }: { value: string; onChange(v: string): void; all?: string }) => (
  <select value={value} onChange={e => onChange(e.target.value)}>
    {all && <option value="">{all}</option>}
    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
  </select>
)

/** Ranked horizontal bars: one hue, value labelled on every row. `icons` shows the category chip. */
export function BarList({ rows, max, icons }: { rows: { label: string; value: number; sub?: string }[]; max?: number; icons?: boolean }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value))
  return (
    <ul className="barlist">
      {rows.map(r => (
        <li key={r.label} className={icons ? '' : 'plain'}>
          {icons && <CatIcon category={r.label} small />}
          <div className="barlist-row"><span>{r.label}{r.sub && <em> · {r.sub}</em>}</span><span className="num">{money(r.value)}</span></div>
          <div className="track"><div className="fill" style={{ width: `${Math.min(100, (r.value / top) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function Progress({ value, max, over }: { value: number; max: number; over?: boolean }) {
  return <div className="track"><div className={`fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }} /></div>
}

interface TipProps { active?: boolean; label?: string | number; payload?: { name?: string; value?: number; color?: string }[] }
export function ChartTip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="chart-tip-row"><i style={{ background: p.color }} /><span>{p.name}</span><b>{money(p.value ?? 0)}</b></div>
      ))}
    </div>
  )
}

export const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
