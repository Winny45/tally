import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bars, Legend } from '../components/charts'
import type { Series } from '../components/charts'
import { BarList, Empty, Page, Stat } from '../components/ui'
import { buckets, byCategory, cashAvailable, incomeIn, monthlyAverages, netWorth, project, spendIn, upcoming } from '../lib/analytics'
import { demoData } from '../lib/demo'
import { useStore } from '../lib/store'
import { addMonths, fmtDay, money, money0, monthStart, today } from '../lib/util'
import { TxnRow } from './Transactions'

const SERIES: Series[] = [
  { key: 'income', name: 'Income', color: 'var(--series-1)' },
  { key: 'spend', name: 'Spending', color: 'var(--series-2)' },
]

export default function Dashboard() {
  const { db, replaceAll, syncing, syncBanks } = useStore()
  const t = today(), m0 = monthStart(t)
  const v = useMemo(() => {
    const spent = spendIn(db.transactions, m0, t)
    const lastSame = spendIn(db.transactions, addMonths(m0, -1), addMonths(t, -1))
    const avg = monthlyAverages(db.transactions)
    const proj = project(db.accounts, { months: 12, income: avg.income, spend: avg.spend, cut: 0, savingsRate: 0, investRate: 0 })
    return {
      spent, lastSame, avg, income: incomeIn(db.transactions, m0, t),
      months: buckets(db.transactions, 'month', 6), cats: byCategory(db.transactions, m0, t).slice(0, 5),
      due: upcoming(db.recurring.filter(r => r.kind !== 'income'), 14),
      recent: [...db.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
      in12: proj[proj.length - 1].current,
    }
  }, [db, m0, t])

  if (!db.accounts.length)
    return (
      <Page title="Welcome to Tally">
        <div className="card"><Empty title="No accounts yet">
          Add your accounts to start tracking, or load sample data to look around first.
        </Empty>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Link to="/accounts"><button className="primary">Add an account</button></Link>
            <button onClick={() => replaceAll(demoData())}>Load demo data</button>
          </div></div>
      </Page>
    )

  const diff = v.spent - v.lastSame
  const worth = netWorth(db.accounts)
  return (
    <Page title="Overview" actions={<button onClick={() => syncBanks()} disabled={syncing}>{syncing ? 'Updating…' : 'Update now'}</button>}>
      {db.accounts.some(a => a.source === 'demo') && (
        <div className="banner"><span>You're looking at <b>demo data</b>, not your real accounts.</span><Link to="/settings">Clear it in Settings</Link></div>
      )}
      <div className="grid cols-4">
        <Stat label="Net worth" value={money(worth)} sub={`${db.accounts.length} account${db.accounts.length === 1 ? '' : 's'}`} />
        <Stat label="Available cash" value={money(cashAvailable(db.accounts))} sub="Current accounts and cash" />
        <Stat label="Income this month" value={money(v.income)} sub={`Typical month ${money0(v.avg.income)}`} />
        <Stat label="Spent this month" value={money(v.spent)}
          sub={v.lastSame ? <span className={diff > 0 ? 'bad' : 'good'}>{diff > 0 ? '▲' : '▼'} {money0(Math.abs(diff))} vs this point last month</span> : 'No earlier month to compare'} />
      </div>
      <div className="grid split">
        <div className="card">
          <div className="card-head"><h2>Income and spending, last 6 months</h2><Legend series={SERIES} /></div>
          <Bars data={v.months} series={SERIES} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Where it went this month</h2><Link to="/spending">See all</Link></div>
          {v.cats.length ? <BarList rows={v.cats.map(c => ({ label: c.category, value: c.total }))} /> : <Empty title="Nothing spent yet this month" />}
        </div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Due in the next 14 days</h2><Link to="/bills">All bills</Link></div>
          {v.due.length ? (
            <ul className="list">{v.due.map(({ r, due }) => (
              <li key={r.id}><div className="row-main"><b>{r.name}</b><small>{fmtDay(due)}</small></div><span className="num">{money(r.amount)}</span></li>
            ))}</ul>
          ) : <Empty title="Nothing due soon" />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent activity</h2><Link to="/transactions">All transactions</Link></div>
          {v.recent.length ? <ul className="list">{v.recent.map(x => <TxnRow key={x.id} t={x} showDate />)}</ul> : <Empty title="No transactions yet" />}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2>At this rate, in 12 months</h2><Link to="/forecast">Open forecast</Link></div>
        <div className="stat"><strong className={v.in12 >= worth ? 'good' : 'bad'}>{money0(v.in12)}</strong>
          <span className="stat-sub">Net worth if you keep earning {money0(v.avg.income)} and spending {money0(v.avg.spend)} a month, before any interest or growth.</span></div>
      </div>
    </Page>
  )
}
