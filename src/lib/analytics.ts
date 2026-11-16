import { merchantKey, merchantName, NON_SPEND } from './categories'
import type { Account, Frequency, Recurring, Tables, Txn } from './types'
import { addDays, addMonths, daysBetween, fmtDate, monthStart, round2, sum, today, weekStart } from './util'

export const isSpend = (t: Txn) => t.amount < 0 && !NON_SPEND.has(t.category)
export const isIncome = (t: Txn) => t.amount > 0 && !NON_SPEND.has(t.category)
export const inRange = (t: Txn, from: string, to: string) => t.date >= from && t.date <= to

export const spendIn = (txns: Txn[], from: string, to: string) =>
  -sum(txns.filter(t => isSpend(t) && inRange(t, from, to)).map(t => t.amount))
export const incomeIn = (txns: Txn[], from: string, to: string) =>
  sum(txns.filter(t => isIncome(t) && inRange(t, from, to)).map(t => t.amount))

export function byCategory(txns: Txn[], from: string, to: string) {
  const m = new Map<string, number>()
  for (const t of txns) if (isSpend(t) && inRange(t, from, to)) m.set(t.category || 'Other', (m.get(t.category || 'Other') ?? 0) - t.amount)
  return [...m].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total)
}

export type Granularity = 'day' | 'week' | 'month' | 'year'
export interface Bucket { key: string; label: string; from: string; to: string; spend: number; income: number }

/** Spending and income grouped into consecutive periods ending today. */
export function buckets(txns: Txn[], g: Granularity, count: number): Bucket[] {
  const t = today()
  const out: Bucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    let from: string, to: string, label: string
    if (g === 'day') { from = to = addDays(t, -i); label = fmtDate(from) }
    else if (g === 'week') { from = addDays(weekStart(t), -7 * i); to = addDays(from, 6); label = fmtDate(from) }
    else if (g === 'month') { from = addMonths(monthStart(t), -i); to = addDays(addMonths(from, 1), -1); label = fmtDate(from, { month: 'short', year: '2-digit' }) }
    else { const y = Number(t.slice(0, 4)) - i; from = `${y}-01-01`; to = `${y}-12-31`; label = String(y) }
    out.push({ key: from, label, from, to, spend: round2(spendIn(txns, from, to)), income: round2(incomeIn(txns, from, to)) })
  }
  return out
}

/** Average monthly income and spending over the last `n` complete months (falls back to this month). */
export function monthlyAverages(txns: Txn[], n = 3) {
  const first = txns.length ? txns.reduce((a, t) => (t.date < a ? t.date : a), today()) : today()
  const thisMonth = monthStart(today())
  const months: { from: string; to: string }[] = []
  for (let i = 1; i <= n; i++) {
    const from = addMonths(thisMonth, -i)
    if (from < monthStart(first)) break
    months.push({ from, to: addDays(addMonths(from, 1), -1) })
  }
  if (!months.length) months.push({ from: thisMonth, to: today() })
  return {
    income: round2(sum(months.map(m => incomeIn(txns, m.from, m.to))) / months.length),
    spend: round2(sum(months.map(m => spendIn(txns, m.from, m.to))) / months.length),
    months: months.length,
  }
}

export const netWorth = (accounts: Account[]) => round2(sum(accounts.map(a => a.balance)))
export const cashAvailable = (accounts: Account[]) =>
  round2(sum(accounts.filter(a => a.type === 'current' || a.type === 'cash').map(a => a.balance)))

const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12, fortnightly: 26 / 12, 'four-weekly': 13 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12,
}
export const monthlyCost = (r: Recurring) => round2(r.amount * PER_MONTH[r.frequency])

export function advance(date: string, f: Frequency): string {
  switch (f) {
    case 'weekly': return addDays(date, 7)
    case 'fortnightly': return addDays(date, 14)
    case 'four-weekly': return addDays(date, 28)
    case 'monthly': return addMonths(date, 1)
    case 'quarterly': return addMonths(date, 3)
    case 'yearly': return addMonths(date, 12)
  }
}
/** The next date on or after today that this item falls due. */
export function nextDue(r: Recurring): string {
  let d = r.next_due
  const t = today()
  for (let i = 0; d < t && i < 2000; i++) d = advance(d, r.frequency)
  return d
}
export function upcoming(recurring: Recurring[], days: number) {
  const limit = addDays(today(), days)
  return recurring.filter(r => r.active).map(r => ({ r, due: nextDue(r) }))
    .filter(x => x.due <= limit).sort((a, b) => a.due.localeCompare(b.due))
}

const norm = merchantKey
const median = (ns: number[]) => [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)]

/** Finds payments that repeat on a regular rhythm and aren't already tracked. */
export function detectRecurring(db: Tables): Omit<Recurring, 'id'>[] {
  const known = new Set(db.recurring.map(r => norm(r.name)))
  const groups = new Map<string, Txn[]>()
  for (const t of db.transactions) {
    if (t.amount >= 0 || NON_SPEND.has(t.category) || t.category === 'People') continue
    const k = norm(t.description)
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const out: Omit<Recurring, 'id'>[] = []
  for (const [k, list] of groups) {
    if (known.has(k) || list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].date, t.date))
    const gap = median(gaps)
    const frequency: Frequency | null =
      gap >= 6 && gap <= 8 ? 'weekly' : gap >= 13 && gap <= 15 ? 'fortnightly' : gap >= 26 && gap <= 33 ? 'monthly'
        : gap >= 85 && gap <= 95 ? 'quarterly' : gap >= 355 && gap <= 375 ? 'yearly' : null
    if (!frequency) continue
    if (frequency !== 'yearly' && frequency !== 'quarterly' && list.length < 3) continue
    if (gaps.filter(g => Math.abs(g - gap) <= 4).length < gaps.length * 0.7) continue
    const amounts = list.map(t => -t.amount)
    const typical = median(amounts)
    if (amounts.filter(a => Math.abs(a - typical) <= typical * 0.25).length < amounts.length * 0.7) continue
    const last = list[list.length - 1]
    if (daysBetween(last.date, today()) > gap * 2 + 10) continue // stopped
    const category = last.category || 'Other'
    out.push({
      name: merchantName(last.description), amount: round2(-last.amount), frequency, category, active: true,
      kind: category === 'Subscriptions' || category === 'Entertainment' || category === 'Health & fitness' ? 'subscription'
        : category === 'Bills & utilities' || category === 'Housing' ? 'bill' : 'essential',
      next_due: advance(last.date, frequency),
    })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export interface Insight { title: string; detail: string; saving?: number; tone: 'tip' | 'warn' | 'good' }

export function insights(db: Tables): Insight[] {
  const out: Insight[] = []
  const t = today()
  const txns = db.transactions
  const avg = monthlyAverages(txns)
  const subs = db.recurring.filter(r => r.active && r.kind === 'subscription')
  const subsMonthly = sum(subs.map(monthlyCost))
  if (subs.length) {
    const top = [...subs].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0]
    out.push({
      tone: 'tip', saving: round2(subsMonthly * 12),
      title: `${subs.length} subscriptions cost £${subsMonthly.toFixed(2)} a month`,
      detail: `That is £${(subsMonthly * 12).toFixed(0)} a year. The largest is ${top.name} at £${monthlyCost(top).toFixed(2)} a month — cancel any you no longer use.`,
    })
  }
  // Categories running ahead of where they stood at this point in the previous three months.
  // Comparing like-for-like days keeps front-loaded bills such as rent from looking like overspending.
  const m0 = monthStart(t)
  const base = new Map<string, number>()
  for (let i = 1; i <= 3; i++)
    for (const c of byCategory(txns, addMonths(m0, -i), addMonths(t, -i))) base.set(c.category, (base.get(c.category) ?? 0) + c.total / 3)
  for (const c of byCategory(txns, m0, t)) {
    const usual = base.get(c.category) ?? 0
    if (usual >= 30 && c.total > usual * 1.25 && c.total - usual >= 15)
      out.push({
        tone: 'warn', title: `${c.category} is running ${Math.round((c.total / usual - 1) * 100)}% above usual`,
        detail: `£${c.total.toFixed(0)} so far this month, against a typical £${usual.toFixed(0)} by this date. Getting back to normal keeps about £${(c.total - usual).toFixed(0)} a month.`,
        saving: round2((c.total - usual) * 12),
      })
  }
  // Frequent small purchases
  const from90 = addDays(t, -90)
  const small = new Map<string, { n: number; total: number; name: string }>()
  for (const x of txns) {
    if (!isSpend(x) || x.date < from90 || -x.amount > 15) continue
    const k = norm(x.description)
    const cur = small.get(k) ?? { n: 0, total: 0, name: merchantName(x.description) }
    small.set(k, { ...cur, n: cur.n + 1, total: cur.total - x.amount })
  }
  const habit = [...small].filter(([, v]) => v.n >= 12).sort((a, b) => b[1].total - a[1].total)[0]
  if (habit)
    out.push({
      tone: 'tip', saving: round2((habit[1].total / 3) * 12 * 0.5),
      title: `${habit[1].n} small purchases at ${habit[1].name} in 90 days`,
      detail: `They add up to £${habit[1].total.toFixed(0)}, about £${(habit[1].total / 3).toFixed(0)} a month. Halving them would save roughly £${((habit[1].total / 3) * 6).toFixed(0)} a year.`,
    })
  const cats = new Map(byCategory(txns, from90, t).map(c => [c.category, c.total]))
  const eat = cats.get('Eating out') ?? 0, groc = cats.get('Groceries') ?? 0
  if (eat > 0 && eat > groc * 0.6)
    out.push({
      tone: 'tip', saving: round2((eat / 3) * 12 * 0.25),
      title: `Eating out is £${(eat / 3).toFixed(0)} a month`,
      detail: `Compared with £${(groc / 3).toFixed(0)} on groceries. Cutting a quarter of it would save about £${((eat / 3) * 3).toFixed(0)} a year.`,
    })
  for (const b of db.budgets) {
    const spent = cats.size ? (byCategory(txns, monthStart(t), t).find(c => c.category === b.category)?.total ?? 0) : 0
    if (spent > b.monthly_limit)
      out.push({ tone: 'warn', title: `${b.category} budget exceeded`, detail: `Spent £${spent.toFixed(0)} of a £${b.monthly_limit.toFixed(0)} monthly budget.` })
  }
  if (avg.income > 0) {
    const rate = (avg.income - avg.spend) / avg.income
    out.push(rate >= 0.1
      ? { tone: 'good', title: `You keep ${Math.round(rate * 100)}% of what you earn`, detail: `Average income £${avg.income.toFixed(0)} against £${avg.spend.toFixed(0)} spending over the last ${avg.months} month(s).` }
      : { tone: 'warn', title: rate < 0 ? 'Spending is higher than income' : `Only ${Math.round(rate * 100)}% of income is left over`, detail: `Average income £${avg.income.toFixed(0)} against £${avg.spend.toFixed(0)} spending over the last ${avg.months} month(s).` })
  }
  const idle = cashAvailable(db.accounts) - avg.spend * 3
  if (avg.spend > 0 && idle > 500)
    out.push({ tone: 'tip', title: `£${idle.toFixed(0)} sits in current accounts beyond 3 months of spending`, detail: 'Current accounts usually pay little or no interest on that balance.' })
  return out
}

export interface ProjectionInput { months: number; income: number; spend: number; cut: number; savingsRate: number; investRate: number }
export interface ProjectionPoint { month: number; label: string; current: number; improved: number }

/** Month-by-month net worth: cash moves by income − spending; savings and investments compound. */
export function project(accounts: Account[], p: ProjectionInput): ProjectionPoint[] {
  const bal = (types: string[]) => sum(accounts.filter(a => types.includes(a.type)).map(a => a.balance))
  const start = { cash: bal(['current', 'cash', 'credit']), savings: bal(['savings']), invest: bal(['investment']) }
  const a = { ...start }, b = { ...start }
  const out: ProjectionPoint[] = []
  const t = monthStart(today())
  for (let m = 0; m <= p.months; m++) {
    if (m > 0) {
      for (const [s, net] of [[a, p.income - p.spend], [b, p.income - p.spend + p.cut]] as const) {
        s.savings *= 1 + p.savingsRate / 100 / 12
        s.invest *= 1 + p.investRate / 100 / 12
        s.cash += net
      }
    }
    out.push({
      month: m, label: fmtDate(addMonths(t, m), { month: 'short', year: '2-digit' }),
      current: Math.round(a.cash + a.savings + a.invest), improved: Math.round(b.cash + b.savings + b.invest),
    })
  }
  return out
}
