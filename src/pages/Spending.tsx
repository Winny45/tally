import { useMemo, useState } from 'react'
import { Bars } from '../components/charts'
import { BarList, Empty, Page, Segmented, Stat } from '../components/ui'
import { buckets, byCategory, inRange, isSpend } from '../lib/analytics'
import type { Granularity } from '../lib/analytics'
import { useStore } from '../lib/store'
import { fmtDate, money, sum } from '../lib/util'
import { TxnRow } from './Transactions'

const VIEWS: Record<Granularity, { count: number; label: string; unit: string }> = {
  day: { count: 30, label: 'Daily', unit: 'day' }, week: { count: 12, label: 'Weekly', unit: 'week' },
  month: { count: 12, label: 'Monthly', unit: 'month' }, year: { count: 5, label: 'Yearly', unit: 'year' },
}
const SERIES = [{ key: 'spend', name: 'Spending', color: 'var(--series-1)' }]

export default function Spending() {
  const { db } = useStore()
  const [g, setG] = useState<Granularity>('month')
  const [pick, setPick] = useState<number | null>(null)
  const data = useMemo(() => {
    const all = buckets(db.transactions, g, VIEWS[g].count)
    const first = all.findIndex(b => b.spend > 0 || b.income > 0)
    return g === 'year' && first > 0 ? all.slice(first) : all
  }, [db.transactions, g])
  const i = pick !== null && pick < data.length ? pick : data.length - 1
  const b = data[i]
  const cats = useMemo(() => byCategory(db.transactions, b.from, b.to), [db.transactions, b])
  const top = useMemo(() => db.transactions.filter(t => isSpend(t) && inRange(t, b.from, b.to)).sort((x, y) => x.amount - y.amount).slice(0, 8), [db.transactions, b])
  const avg = sum(data.slice(0, -1).map(d => d.spend)) / Math.max(1, data.length - 1)
  const range = b.from === b.to ? fmtDate(b.from, { day: 'numeric', month: 'long', year: 'numeric' })
    : g === 'year' ? b.label : g === 'month' ? fmtDate(b.from, { month: 'long', year: 'numeric' }) : `${fmtDate(b.from)} – ${fmtDate(b.to)}`

  return (
    <Page title="Spending" subtitle="Tap a bar to see what was inside it." actions={
      <Segmented value={g} onChange={v => { setG(v); setPick(null) }} options={(Object.keys(VIEWS) as Granularity[]).map(k => [k, VIEWS[k].label])} />
    }>
      <div className="grid cols-3">
        <Stat label={`Spent, ${range}`} value={money(b.spend)} />
        <Stat label={`Income, ${range}`} value={money(b.income)} />
        <Stat label={`Average per ${VIEWS[g].unit}`} value={money(avg)} sub={`Over the previous ${data.length - 1} ${VIEWS[g].unit}s`} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Spending per {VIEWS[g].unit}</h2></div>
        <Bars data={data} series={SERIES} selected={i} onSelect={setPick} />
      </div>
      <div className="grid cols-2">
        <div className="card"><h2>By category · {range}</h2>
          {cats.length ? <BarList icons rows={cats.map(c => ({ label: c.category, value: c.total, sub: `${Math.round((c.total / b.spend) * 100)}%` }))} /> : <Empty title="No spending in this period" />}
        </div>
        <div className="card"><h2>Biggest purchases · {range}</h2>
          {top.length ? <ul className="list">{top.map(t => <TxnRow key={t.id} t={t} showDate />)}</ul> : <Empty title="No spending in this period" />}
        </div>
      </div>
    </Page>
  )
}
