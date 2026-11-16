import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bars, Legend } from '../components/charts'
import type { Series } from '../components/charts'
import { BankDot, BarList, CatIcon, Empty, Page } from '../components/ui'
import { buckets, byCategory, cashAvailable, incomeIn, monthlyAverages, netWorth, project, spendIn, upcoming } from '../lib/analytics'
import { demoData } from '../lib/demo'
import { useStore } from '../lib/store'
import { addMonths, fmtDay, money, money0, monthStart, today } from '../lib/util'
import { TxnRow } from './Transactions'

const SERIES: Series[] = [
  { key: 'income', name: 'Money in', color: 'var(--series-1)' },
  { key: 'spend', name: 'Money out', color: 'var(--series-2)' },
]
const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { db, replaceAll, syncing, syncBanks, mode } = useStore()
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
        <div className="card">
          <Empty title="Let's get your money in one place" emoji="👋">
            {mode === 'local' ? 'Add your accounts to start tracking, or load sample data to look around first.' : 'Link a bank or add an account to start tracking.'}
          </Empty>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <Link to="/accounts"><button className="primary">Add an account</button></Link>
            {/* Sample data is for trying the app out offline; it never goes into a synced account. */}
            {mode === 'local' && <button onClick={() => replaceAll(demoData())}>Load demo data</button>}
          </div>
        </div>
      </Page>
    )

  const diff = v.spent - v.lastSame
  const worth = netWorth(db.accounts)
  const line = !v.lastSame ? `You've spent ${money0(v.spent)} so far this month.`
    : Math.abs(diff) < 5 ? `You've spent ${money0(v.spent)} this month, about the same as this point last month.`
      : `You've spent ${money0(v.spent)} this month. That's ${money0(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than this point last month${diff > 0 ? '.' : ' — nice.'}`
  return (
    <div className="page">
      {db.accounts.some(a => a.source === 'demo') && (
        <div className="banner"><span>You're looking at <b>demo data</b>, not your real accounts.</span><Link to="/settings">Clear it in Settings</Link></div>
      )}
      <div className="card hero">
        <div className="hero-top">
          <div>
            <div className="hello">{greeting()} 👋</div>
            <div className="big num">{money(worth)}</div>
            <div className="hello">across {db.accounts.length} account{db.accounts.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={() => syncBanks()} disabled={syncing}>{syncing ? 'Updating…' : 'Refresh'}</button>
        </div>
        <p className="line">{line}</p>
        <div className="hero-stats">
          <div><span>Ready to spend</span><b>{money0(cashAvailable(db.accounts))}</b></div>
          <div><span>In this month</span><b>{money0(v.income)}</b></div>
          <div><span>Out this month</span><b>{money0(v.spent)}</b></div>
        </div>
      </div>

      <div className="strip">
        {db.accounts.map(a => (
          <Link key={a.id} to="/accounts" className="card acct">
            <BankDot name={a.institution || a.name} />
            <div><div className="acct-name">{a.name}</div><small>{a.institution || 'Manual'}</small></div>
            <strong className={a.balance < 0 ? 'bad' : ''}>{money(a.balance)}</strong>
          </Link>
        ))}
      </div>

      <div className="grid split">
        <div className="card">
          <div className="card-head"><h2>In and out, last 6 months</h2><Legend series={SERIES} /></div>
          <Bars data={v.months} series={SERIES} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Where it went this month</h2><Link to="/spending">See all</Link></div>
          {v.cats.length ? <BarList icons rows={v.cats.map(c => ({ label: c.category, value: c.total }))} /> : <Empty title="Nothing spent yet this month" emoji="🌱" />}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h2>Latest</h2><Link to="/transactions">See all</Link></div>
          {v.recent.length ? <ul className="list">{v.recent.map(x => <TxnRow key={x.id} t={x} showDate />)}</ul> : <Empty title="No transactions yet" />}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="card-head"><h2>Coming up</h2><Link to="/bills">All bills</Link></div>
            {v.due.length ? (
              <ul className="list">{v.due.map(({ r, due }) => (
                <li key={r.id}><CatIcon category={r.category} /><div className="row-main"><b>{r.name}</b><small>{fmtDay(due)}</small></div><span className="num">{money(r.amount)}</span></li>
              ))}</ul>
            ) : <Empty title="Nothing due in the next 2 weeks" emoji="😌">Track your regular payments under Bills &amp; subs to see them here.</Empty>}
          </div>
          <div className="card">
            <div className="card-head"><h2>A year from now</h2><Link to="/forecast">Open forecast</Link></div>
            <div className="stat"><strong className={v.in12 >= worth ? 'good' : 'bad'}>{money0(v.in12)}</strong>
              <span className="stat-sub">If you keep bringing in about {money0(v.avg.income)} and spending {money0(v.avg.spend)} a month.</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
