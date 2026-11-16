import Papa from 'papaparse'
import { categorise } from './categories'
import type { Txn } from './types'
import { iso, round2, uid } from './util'

const COLS = {
  date: ['date', 'transaction date', 'booking date', 'posted date', 'completed date'],
  description: ['name', 'description', 'merchant', 'details', 'transaction description', 'counter party', 'reference', 'memo'],
  amount: ['amount', 'value', 'amount (gbp)'],
  out: ['money out', 'paid out', 'debit', 'debit amount', 'withdrawals'],
  in: ['money in', 'paid in', 'credit', 'credit amount', 'deposits'],
  id: ['transaction id', 'id', 'transaction reference'],
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Accepts 2026-01-31, 31/01/2026 (UK order), 31-01-26 and "31 Jan 2026". */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) return iso(new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1])))
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/)
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(new Date(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[1])))
  return null
}
const num = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/[£,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface CsvResult { rows: Txn[]; duplicates: number; unreadable: number }

/** Reads a bank statement export. Works with Monzo's format and most "date, description, amount" layouts. */
export async function importCsv(file: File, accountId: string, existing: Txn[]): Promise<CsvResult> {
  const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true })
  const headers = parsed.meta.fields ?? []
  const find = (names: string[]) => headers.find(h => names.includes(h.trim().toLowerCase()))
  const c = { date: find(COLS.date), description: find(COLS.description), amount: find(COLS.amount), out: find(COLS.out), in: find(COLS.in), id: find(COLS.id) }
  if (!c.date || !c.description || !(c.amount || c.out || c.in))
    throw new Error(`Couldn't recognise this file. It needs a date column, a description/name column and an amount (or money in/out) column. Found: ${headers.join(', ')}`)
  const seen = new Set(existing.filter(t => t.account_id === accountId).map(t => t.external_id))
  const counts = new Map<string, number>()
  const out: CsvResult = { rows: [], duplicates: 0, unreadable: 0 }
  for (const r of parsed.data) {
    const date = parseDate(r[c.date] ?? '')
    const amount = round2(c.amount && (r[c.amount] ?? '').trim() !== '' ? num(r[c.amount]) : num(c.in && r[c.in]) - Math.abs(num(c.out && r[c.out])))
    const description = (r[c.description] ?? '').trim() || 'Unknown'
    if (!date || amount === 0) { out.unreadable++; continue }
    // Rows without a bank id get a stable fingerprint so re-importing the same file adds nothing.
    const base = `${date}|${amount}|${description}`
    const n = (counts.get(base) ?? 0) + 1
    counts.set(base, n)
    const external_id = (c.id && r[c.id]?.trim()) || `csv:${base}|${n}`
    if (seen.has(external_id)) { out.duplicates++; continue }
    seen.add(external_id)
    out.rows.push({ id: uid(), account_id: accountId, date, amount, description, category: categorise(description, amount), notes: '', source: 'csv', external_id })
  }
  return out
}
