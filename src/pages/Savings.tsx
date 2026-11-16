import { useMemo, useState } from 'react'
import { CategorySelect, Empty, Field, Modal, num, Page, Progress } from '../components/ui'
import { byCategory, insights } from '../lib/analytics'
import { useStore } from '../lib/store'
import type { Budget, Goal } from '../lib/types'
import { daysBetween, fmtDate, money, money0, monthStart, sum, today, uid } from '../lib/util'

const TAG = { tip: 'Idea', warn: 'Watch', good: 'Going well' }

function BudgetModal({ item, onClose }: { item: Budget | null; onClose(): void }) {
  const { save, remove } = useStore()
  const [category, setCategory] = useState(item?.category ?? 'Groceries')
  const [limit, setLimit] = useState(String(item?.monthly_limit ?? ''))
  return (
    <Modal title={item ? 'Edit budget' : 'Add budget'} onClose={onClose} footer={<>
      {item && <button className="danger" onClick={async () => { await remove('budgets', item.id); onClose() }}>Delete</button>}
      <button className="primary" disabled={num(limit) <= 0} onClick={async () => { await save('budgets', { id: item?.id ?? uid(), category, monthly_limit: num(limit) }); onClose() }}>Save</button>
    </>}>
      <div className="form">
        <Field label="Category"><CategorySelect value={category} onChange={setCategory} /></Field>
        <Field label="Monthly limit (£)"><input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function GoalModal({ item, onClose }: { item: Goal | null; onClose(): void }) {
  const { save, remove } = useStore()
  const [f, setF] = useState({ name: item?.name ?? '', target: String(item?.target ?? ''), saved: String(item?.saved ?? '0'), target_date: item?.target_date ?? '' })
  return (
    <Modal title={item ? 'Edit goal' : 'Add savings goal'} onClose={onClose} footer={<>
      {item && <button className="danger" onClick={async () => { await remove('goals', item.id); onClose() }}>Delete</button>}
      <button className="primary" disabled={!f.name.trim() || num(f.target) <= 0}
        onClick={async () => { await save('goals', { id: item?.id ?? uid(), name: f.name.trim(), target: num(f.target), saved: num(f.saved), target_date: f.target_date || null }); onClose() }}>Save</button>
    </>}>
      <div className="form">
        <Field label="What are you saving for?"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <div className="form-row">
          <Field label="Target (£)"><input inputMode="decimal" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Saved so far (£)"><input inputMode="decimal" value={f.saved} onChange={e => setF({ ...f, saved: e.target.value })} /></Field>
        </div>
        <Field label="Target date (optional)"><input type="date" value={f.target_date} onChange={e => setF({ ...f, target_date: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

export default function Savings() {
  const { db } = useStore()
  const [budget, setBudget] = useState<Budget | null | 'new'>(null)
  const [goal, setGoal] = useState<Goal | null | 'new'>(null)
  const tips = useMemo(() => insights(db), [db])
  const spent = useMemo(() => new Map(byCategory(db.transactions, monthStart(today()), today()).map(c => [c.category, c.total])), [db.transactions])
  const possible = sum(tips.map(t => t.saving ?? 0))

  return (
    <Page title="Save money">
      <div className="card">
        <div className="card-head"><h2>Where you could save</h2>{possible > 0 && <span className="muted">Up to {money0(possible)} a year in total</span>}</div>
        {!tips.length ? <Empty title="Nothing to suggest yet">Once a few weeks of transactions are in, ideas based on your own spending show up here.</Empty> : (
          <div className="grid">{tips.map(t => (
            <div key={t.title} className={`insight ${t.tone}`}><span className="tag">{TAG[t.tone]}</span><b>{t.title}</b><p>{t.detail}</p></div>
          ))}</div>
        )}
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Monthly budgets</h2><button onClick={() => setBudget('new')}>Add budget</button></div>
          {!db.budgets.length ? <Empty title="No budgets">Set a monthly limit for a category and track it here.</Empty> : (
            <ul className="barlist">{db.budgets.map(b => {
              const used = spent.get(b.category) ?? 0
              return (
                <li key={b.id} onClick={() => setBudget(b)} style={{ cursor: 'pointer' }}>
                  <div className="barlist-row"><span>{b.category}</span><span className={`num ${used > b.monthly_limit ? 'bad' : ''}`}>{money0(used)} of {money0(b.monthly_limit)}{used > b.monthly_limit ? ' · over' : ''}</span></div>
                  <Progress value={used} max={b.monthly_limit} over={used > b.monthly_limit} />
                </li>
              )
            })}</ul>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Savings goals</h2><button onClick={() => setGoal('new')}>Add goal</button></div>
          {!db.goals.length ? <Empty title="No goals">Name something to save for and see how much a month gets you there.</Empty> : (
            <ul className="barlist">{db.goals.map(g => {
              const left = Math.max(0, g.target - g.saved)
              const months = g.target_date ? Math.max(1, Math.ceil(daysBetween(today(), g.target_date) / 30.4)) : null
              return (
                <li key={g.id} onClick={() => setGoal(g)} style={{ cursor: 'pointer' }}>
                  <div className="barlist-row"><span>{g.name}</span><span className="num">{money0(g.saved)} of {money0(g.target)}</span></div>
                  <Progress value={g.saved} max={g.target} />
                  <small className="muted">{left === 0 ? 'Reached 🎉' : months && g.target_date ? `${money(left / months)} a month to hit it by ${fmtDate(g.target_date, { month: 'short', year: 'numeric' })}` : `${money0(left)} to go`}</small>
                </li>
              )
            })}</ul>
          )}
        </div>
      </div>
      {budget && <BudgetModal item={budget === 'new' ? null : budget} onClose={() => setBudget(null)} />}
      {goal && <GoalModal item={goal === 'new' ? null : goal} onClose={() => setGoal(null)} />}
    </Page>
  )
}
