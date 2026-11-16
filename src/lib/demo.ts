import { emptyTables } from './types'
import type { Account, Tables, Txn } from './types'
import { addDays, addMonths, monthStart, round2, today, uid } from './util'

/** Sample data so the app can be explored before any real account is linked. Clearly labelled "Demo" in the UI. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAILY: [string, string, number, number, number][] = [
  // description, category, chance per day, min, max
  ['Tesco Stores', 'Groceries', 0.22, 12, 55], ['Sainsbury\'s', 'Groceries', 0.1, 8, 40], ['Aldi', 'Groceries', 0.08, 15, 45],
  ['Pret A Manger', 'Eating out', 0.3, 3.5, 9], ['Deliveroo', 'Eating out', 0.1, 14, 32], ['Nando\'s', 'Eating out', 0.04, 14, 30],
  ['TfL Travel Charge', 'Transport', 0.55, 2.8, 8.4], ['Uber', 'Transport', 0.05, 7, 22],
  ['Amazon', 'Shopping', 0.09, 8, 70], ['Uniqlo', 'Shopping', 0.015, 20, 90], ['Odeon Cinema', 'Entertainment', 0.02, 9, 24],
  ['Boots', 'Health & fitness', 0.04, 4, 22],
]
const MONTHLY: [number, string, string, number, number][] = [
  // day, description, category, amount, jitter
  [1, 'Rent - Lettings Ltd', 'Housing', 950, 0], [1, 'Council Tax', 'Housing', 142, 0],
  [2, 'PureGym', 'Health & fitness', 24.99, 0], [3, 'Spotify', 'Subscriptions', 11.99, 0],
  [5, 'Octopus Energy', 'Bills & utilities', 96, 18], [8, 'Thames Water', 'Bills & utilities', 38.5, 0],
  [10, 'Netflix', 'Subscriptions', 10.99, 0], [12, 'BT Broadband', 'Bills & utilities', 32, 0],
  [15, 'EE Mobile', 'Bills & utilities', 18, 0], [20, 'Amazon Prime', 'Subscriptions', 8.99, 0],
]

function dayTxns(date: string, accs: Account[], rand: () => number): Txn[] {
  const [monzo, chase, saver, isa] = accs
  const mk = (a: Account, amount: number, description: string, category: string): Txn =>
    ({ id: uid(), account_id: a.id, date, amount: round2(amount), description, category, notes: '', source: 'demo', external_id: null })
  const out: Txn[] = []
  const day = Number(date.slice(8))
  for (const [d, desc, cat, amt, jit] of MONTHLY) if (d === day) out.push(mk(monzo, -(amt + (rand() - 0.5) * jit), desc, cat))
  if (day === 28) out.push(mk(monzo, 2650, 'Salary - Acme Ltd', 'Income'))
  if (day === 29 || (day === 28 && date.slice(5, 7) === '02')) {
    out.push(mk(monzo, -200, 'Transfer to Chase Saver', 'Transfers'), mk(saver, 200, 'Transfer from Monzo', 'Transfers'))
    out.push(mk(monzo, -150, 'Vanguard Investments', 'Savings & investments'), mk(isa, 150, 'Monthly investment', 'Savings & investments'))
  }
  for (const [desc, cat, p, min, max] of DAILY)
    if (rand() < p) out.push(mk(rand() < 0.3 ? chase : monzo, -(min + rand() * (max - min)), desc, cat))
  return out
}

export function demoData(): Tables {
  const t = emptyTables()
  const acc = (name: string, institution: string, type: Account['type'], balance: number): Account =>
    ({ id: uid(), name, institution, type, balance, source: 'demo', external_id: null, connection_id: null, last_synced: new Date().toISOString() })
  t.accounts = [
    acc('Monzo Current', 'Monzo (Demo)', 'current', 1840.55), acc('Chase Current', 'Chase (Demo)', 'current', 612.3),
    acc('Chase Saver', 'Chase (Demo)', 'savings', 4200), acc('Stocks & Shares ISA', 'Vanguard (Demo)', 'investment', 8420),
  ]
  const rand = rng(42)
  const end = today()
  for (let d = addMonths(monthStart(end), -13); d <= end; d = addDays(d, 1)) t.transactions.push(...dayTxns(d, t.accounts, rand))
  const nextOn = (day: number) => {
    const d = `${end.slice(0, 8)}${String(day).padStart(2, '0')}`
    return d >= end ? d : addMonths(d, 1)
  }
  t.recurring = [
    ...MONTHLY.map(([day, name, category, amount]) => ({
      id: uid(), name, amount, category, frequency: 'monthly' as const, next_due: nextOn(day), active: true,
      kind: category === 'Subscriptions' || name === 'PureGym' ? 'subscription' as const : 'bill' as const,
    })),
    { id: uid(), name: 'Salary - Acme Ltd', amount: 2650, category: 'Income', frequency: 'monthly', next_due: nextOn(28), active: true, kind: 'income' },
    { id: uid(), name: 'TV Licence', amount: 174.5, category: 'Bills & utilities', frequency: 'yearly', next_due: addDays(end, 40), active: true, kind: 'bill' },
  ]
  t.budgets = [
    { id: uid(), category: 'Groceries', monthly_limit: 300 }, { id: uid(), category: 'Eating out', monthly_limit: 120 },
    { id: uid(), category: 'Shopping', monthly_limit: 150 },
  ]
  t.goals = [
    { id: uid(), name: 'Emergency fund', target: 6000, saved: 4200, target_date: addMonths(end, 9) },
    { id: uid(), name: 'Holiday', target: 1500, saved: 450, target_date: addMonths(end, 7) },
  ]
  return t
}

/** Stand-in for a bank feed in local mode: returns a few fresh transactions for the demo accounts. */
export function demoFeed(accounts: Account[], since: string | null): Txn[] {
  const demo = accounts.filter(a => a.source === 'demo')
  if (demo.length < 4) return []
  const rand = rng(Date.now() & 0xffff)
  const end = today()
  const out: Txn[] = []
  const from = since ? addDays(since.slice(0, 10), 1) : end
  for (let d = from; d <= end; d = addDays(d, 1)) out.push(...dayTxns(d, demo, rand))
  if (!out.length) out.push(...dayTxns(end, demo, () => rand() * 0.6).slice(0, 2))
  return out
}
