export const uid = () => crypto.randomUUID()

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => iso(new Date())
export const addDays = (s: string, n: number) => {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const addMonths = (s: string, n: number) => {
  const d = parseISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return iso(d)
}
export const monthStart = (s: string) => s.slice(0, 8) + '01'
export const weekStart = (s: string) => {
  const d = parseISO(s)
  return addDays(s, -((d.getDay() + 6) % 7)) // Monday
}
export const daysBetween = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
export const money = (n: number) => gbp.format(n)
export const money0 = (n: number) => gbp0.format(n)
export const moneyShort = (n: number) =>
  Math.abs(n) >= 1000 ? `£${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `£${Math.round(n)}`

export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  parseISO(s).toLocaleDateString('en-GB', opts)
export const fmtDay = (s: string) => {
  const t = today()
  if (s === t) return 'Today'
  if (s === addDays(t, -1)) return 'Yesterday'
  return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short', year: s.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' })
}
export const round2 = (n: number) => Math.round(n * 100) / 100
export const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
