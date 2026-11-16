import { useMemo, useState } from 'react'
import { CategorySelect, Empty, Field, Modal, num, Page, Segmented, Stat } from '../components/ui'
import { detectRecurring, monthlyCost, nextDue } from '../lib/analytics'
import { useStore } from '../lib/store'
import type { Frequency, Recurring, RecurringKind } from '../lib/types'
import { daysBetween, fmtDay, money, sum, today, uid } from '../lib/util'

const KINDS: [RecurringKind, string][] = [['subscription', 'Subscriptions'], ['bill', 'Bills & utilities'], ['essential', 'Other must-buys'], ['income', 'Income']]
const FREQS: [Frequency, string][] = [['weekly', 'Weekly'], ['fortnightly', 'Every 2 weeks'], ['four-weekly', 'Every 4 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']]

function RecurringModal({ item, onClose }: { item: Partial<Recurring>; onClose(): void }) {
  const { save, remove } = useStore()
  const [f, setF] = useState(() => ({
    name: item.name ?? '', amount: String(item.amount ?? ''), kind: item.kind ?? 'subscription' as RecurringKind, category: item.category ?? 'Subscriptions',
    frequency: item.frequency ?? 'monthly' as Frequency, next_due: item.next_due ?? today(), active: item.active ?? true,
  }))
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  return (
    <Modal title={item.id ? 'Edit' : 'Add recurring payment'} onClose={onClose}
      footer={<>
        {item.id && <button className="danger" onClick={async () => { await remove('recurring', item.id!); onClose() }}>Delete</button>}
        <button className="primary" disabled={!f.name.trim() || num(f.amount) <= 0}
          onClick={async () => { await save('recurring', { ...f, id: item.id ?? uid(), name: f.name.trim(), amount: num(f.amount) }); onClose() }}>Save</button>
      </>}>
      <div className="form">
        <Field label="Name"><input value={f.name} onChange={e => set({ name: e.target.value })} autoFocus={!item.id} /></Field>
        <div className="form-row">
          <Field label="Amount (£)"><input inputMode="decimal" value={f.amount} onChange={e => set({ amount: e.target.value })} /></Field>
          <Field label="How often"><select value={f.frequency} onChange={e => set({ frequency: e.target.value as Frequency })}>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        </div>
        <div className="form-row">
          <Field label="Type"><select value={f.kind} onChange={e => set({ kind: e.target.value as RecurringKind })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Category"><CategorySelect value={f.category} onChange={category => set({ category })} /></Field>
        </div>
        <Field label="Next due"><input type="date" value={f.next_due} onChange={e => set({ next_due: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} />Active (untick if cancelled)</label>
      </div>
    </Modal>
  )
}

export default function Bills() {
  const { db, save } = useStore()
  const [kind, setKind] = useState<RecurringKind>('subscription')
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null)
  const out = db.recurring.filter(r => r.active && r.kind !== 'income')
  const monthly = sum(out.map(monthlyCost))
  const found = useMemo(() => detectRecurring(db), [db])
  const rows = db.recurring.filter(r => r.kind === kind).map(r => ({ r, due: nextDue(r) })).sort((a, b) => a.due.localeCompare(b.due))
  const dueSoon = out.map(r => ({ r, due: nextDue(r) })).filter(x => daysBetween(today(), x.due) <= 30)

  return (
    <Page title="Bills and subscriptions" subtitle="What goes out regularly, and when." actions={<button className="primary" onClick={() => setEditing({ kind })}>Add</button>}>
      <div className="grid cols-4">
        <Stat label="Committed each month" value={money(monthly)} sub={`${out.length} regular payments`} />
        <Stat label="Per year" value={money(monthly * 12)} />
        <Stat label="Subscriptions" value={money(sum(out.filter(r => r.kind === 'subscription').map(monthlyCost)))} sub="per month" />
        <Stat label="Due in 30 days" value={money(sum(dueSoon.map(x => x.r.amount)))} sub={`${dueSoon.length} payments`} />
      </div>
      {found.length > 0 && (
        <div className="card">
          <h2>Spotted in your transactions</h2>
          <p className="muted" style={{ marginBottom: 8 }}>These repeat on a regular schedule. Add the ones you want tracked.</p>
          <ul className="list">{found.slice(0, 8).map(d => (
            <li key={d.name}>
              <div className="row-main"><b>{d.name}</b><small>{FREQS.find(f => f[0] === d.frequency)?.[1]} · {d.category}</small></div>
              <span className="num">{money(d.amount)}</span>
              <button onClick={() => save('recurring', { ...d, id: uid() })}>Track</button>
            </li>
          ))}</ul>
        </div>
      )}
      <div className="card">
        <div className="card-head"><Segmented<RecurringKind> value={kind} onChange={setKind} options={KINDS} /></div>
        {!rows.length ? <Empty title="Nothing here yet">Add one, or link a bank and regular payments will be suggested automatically.</Empty> : (
          <ul className="list">{rows.map(({ r, due }) => (
            <li key={r.id} className="click" onClick={() => setEditing(r)}>
              <div className="row-main">
                <b>{r.name}</b>
                <small>{r.active ? `Next ${fmtDay(due)}` : 'Cancelled'} · {FREQS.find(f => f[0] === r.frequency)?.[1]}{r.frequency !== 'monthly' && ` · ${money(monthlyCost(r))}/mo`}</small>
              </div>
              {!r.active && <span className="badge">Inactive</span>}
              <span className={`num ${r.kind === 'income' ? 'good' : ''}`}>{money(r.amount)}</span>
            </li>
          ))}</ul>
        )}
      </div>
      {editing && <RecurringModal item={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
