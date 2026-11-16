import { useMemo, useState } from 'react'
import { CategorySelect, Empty, Field, Modal, num, Page } from '../components/ui'
import { categorise } from '../lib/categories'
import { useStore } from '../lib/store'
import type { Txn } from '../lib/types'
import { fmtDate, fmtDay, money, round2, sum, today, uid } from '../lib/util'

export function TxnRow({ t, onClick, showDate }: { t: Txn; onClick?(): void; showDate?: boolean }) {
  const { db } = useStore()
  const acc = db.accounts.find(a => a.id === t.account_id)
  const hasReceipt = db.receipts.some(r => r.transaction_id === t.id)
  return (
    <li className={onClick ? 'click' : ''} onClick={onClick}>
      <div className="dot" aria-hidden="true">{t.description.charAt(0).toUpperCase()}</div>
      <div className="row-main">
        <b>{t.description}</b>
        <small>{showDate && `${fmtDate(t.date)} · `}{t.category || 'Uncategorised'}{acc && ` · ${acc.name}`}{hasReceipt && ' · 🧾 receipt'}</small>
      </div>
      <span className={`num ${t.amount > 0 ? 'good' : ''}`}>{t.amount > 0 ? '+' : ''}{money(t.amount)}</span>
    </li>
  )
}

export function TxnModal({ txn, onClose }: { txn: Txn | null; onClose(): void }) {
  const { db, saveTxn, deleteTxn } = useStore()
  const [f, setF] = useState(() => ({
    description: txn?.description ?? '', amount: txn ? String(Math.abs(txn.amount)) : '', out: txn ? txn.amount < 0 : true,
    date: txn?.date ?? today(), account_id: txn?.account_id ?? db.accounts[0]?.id ?? '', category: txn?.category ?? '', notes: txn?.notes ?? '',
  }))
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const valid = f.description.trim() && num(f.amount) > 0 && f.account_id
  const submit = async () => {
    const amount = round2(num(f.amount) * (f.out ? -1 : 1))
    await saveTxn({
      id: txn?.id ?? uid(), source: txn?.source ?? 'manual', external_id: txn?.external_id ?? null,
      description: f.description.trim(), amount, date: f.date, account_id: f.account_id, notes: f.notes,
      category: f.category || categorise(f.description, amount),
    }, txn ?? undefined)
    onClose()
  }
  const receipt = txn && db.receipts.find(r => r.transaction_id === txn.id)
  return (
    <Modal title={txn ? 'Edit transaction' : 'Add transaction'} onClose={onClose}
      footer={<>
        {txn && <button className="danger" onClick={async () => { await deleteTxn(txn); onClose() }}>Delete</button>}
        <button className="primary" disabled={!valid} onClick={submit}>Save</button>
      </>}>
      <div className="form">
        <Field label="Description"><input value={f.description} onChange={e => set({ description: e.target.value })} autoFocus={!txn} /></Field>
        <div className="form-row">
          <Field label="Amount (£)"><input inputMode="decimal" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          <Field label="Direction"><select value={f.out ? 'out' : 'in'} onChange={e => set({ out: e.target.value === 'out' })}><option value="out">Money out</option><option value="in">Money in</option></select></Field>
        </div>
        <div className="form-row">
          <Field label="Date"><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
          <Field label="Account"><select value={f.account_id} onChange={e => set({ account_id: e.target.value })}>{db.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        <Field label="Category"><CategorySelect value={f.category} onChange={category => set({ category })} all="Choose automatically" /></Field>
        <Field label="Notes"><input value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
        {receipt && <p className="muted">🧾 Receipt attached: {receipt.merchant}, {money(receipt.total)}</p>}
      </div>
    </Modal>
  )
}

export default function Transactions() {
  const { db } = useStore()
  const [q, setQ] = useState('')
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [limit, setLimit] = useState(150)
  const [editing, setEditing] = useState<Txn | null | 'new'>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.transactions
      .filter(t => (!account || t.account_id === account) && (!category || t.category === category)
        && (!needle || t.description.toLowerCase().includes(needle) || t.notes.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [db.transactions, q, account, category])
  const days = useMemo(() => {
    const m = new Map<string, Txn[]>()
    for (const t of rows.slice(0, limit)) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m]
  }, [rows, limit])

  return (
    <Page title="Transactions" actions={<button className="primary" disabled={!db.accounts.length} onClick={() => setEditing('new')}>Add transaction</button>}>
      <div className="filters">
        <input type="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search transactions" />
        <select value={account} onChange={e => setAccount(e.target.value)} aria-label="Account"><option value="">All accounts</option>{db.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <CategorySelect value={category} onChange={setCategory} all="All categories" />
      </div>
      <div className="card">
        {!rows.length ? <Empty title="No transactions">Link a bank, import a statement from Accounts, or add one by hand.</Empty> : (
          <>
            <p className="muted">{rows.length} transaction{rows.length === 1 ? '' : 's'}</p>
            {days.map(([date, list]) => (
              <div key={date}>
                <div className="day-head"><span>{fmtDay(date)}</span><span className="num">{money(sum(list.map(t => t.amount)))}</span></div>
                <ul className="list">{list.map(t => <TxnRow key={t.id} t={t} onClick={() => setEditing(t)} />)}</ul>
              </div>
            ))}
            {rows.length > limit && <button style={{ marginTop: 12, width: '100%' }} onClick={() => setLimit(limit + 300)}>Show more</button>}
          </>
        )}
      </div>
      {editing && <TxnModal txn={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
