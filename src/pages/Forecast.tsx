import { useMemo, useState } from 'react'
import { Legend, Lines } from '../components/charts'
import type { Series } from '../components/charts'
import { Field, num, Page, Segmented, Stat } from '../components/ui'
import { monthlyAverages, netWorth, project } from '../lib/analytics'
import { useStore } from '../lib/store'
import { money0 } from '../lib/util'

const HORIZONS: [string, string][] = [['6', '6 months'], ['12', '1 year'], ['36', '3 years'], ['60', '5 years'], ['120', '10 years']]

export default function Forecast() {
  const { db } = useStore()
  const avg = useMemo(() => monthlyAverages(db.transactions), [db.transactions])
  const [months, setMonths] = useState('12')
  const [income, setIncome] = useState(String(Math.round(avg.income)))
  const [spend, setSpend] = useState(String(Math.round(avg.spend)))
  const [cut, setCut] = useState(100)
  const [savingsRate, setSavingsRate] = useState('4')
  const [investRate, setInvestRate] = useState('5')
  const data = useMemo(
    () => project(db.accounts, { months: Number(months), income: num(income), spend: num(spend), cut, savingsRate: num(savingsRate), investRate: num(investRate) }),
    [db.accounts, months, income, spend, cut, savingsRate, investRate],
  )
  const end = data[data.length - 1], now = netWorth(db.accounts)
  const series: Series[] = [
    { key: 'current', name: 'As you are now', color: 'var(--series-1)' },
    ...(cut > 0 ? [{ key: 'improved', name: `Saving ${money0(cut)} more a month`, color: 'var(--series-2)' }] : []),
  ]
  const net = num(income) - num(spend)
  const horizon = HORIZONS.find(h => h[0] === months)![1]

  return (
    <Page title="Forecast" subtitle="Where you are heading if things carry on like this." actions={<Segmented value={months} onChange={setMonths} options={HORIZONS} />}>
      <div className="grid cols-4">
        <Stat label="Net worth today" value={money0(now)} />
        <Stat label={`In ${horizon}`} value={money0(end.current)} tone={end.current >= now ? 'good' : 'bad'} sub={`${end.current >= now ? '+' : '−'}${money0(Math.abs(end.current - now))}`} />
        <Stat label={`If you save ${money0(cut)} more a month`} value={money0(end.improved)} sub={`${money0(end.improved - end.current)} better off`} />
        <Stat label="Left over each month" value={money0(net)} tone={net >= 0 ? 'good' : 'bad'} sub="Income minus spending" />
      </div>
      <div className="card">
        <div className="card-head"><h2>Projected net worth</h2><Legend series={series} /></div>
        <Lines data={data} series={series} />
      </div>
      <div className="card">
        <h2>Assumptions</h2>
        <div className="grid cols-2">
          <Field label="Monthly income (£)" hint={`Your recent average is ${money0(avg.income)}`}><input inputMode="decimal" value={income} onChange={e => setIncome(e.target.value)} /></Field>
          <Field label="Monthly spending (£)" hint={`Your recent average is ${money0(avg.spend)}`}><input inputMode="decimal" value={spend} onChange={e => setSpend(e.target.value)} /></Field>
          <Field label="Interest on savings accounts (% a year)"><input inputMode="decimal" value={savingsRate} onChange={e => setSavingsRate(e.target.value)} /></Field>
          <Field label="Growth on investments (% a year)"><input inputMode="decimal" value={investRate} onChange={e => setInvestRate(e.target.value)} /></Field>
        </div>
        <Field label={`What if you spent ${money0(cut)} less each month?`}>
          <input type="range" min={0} max={1000} step={25} value={cut} onChange={e => setCut(Number(e.target.value))} />
        </Field>
        <p className="muted" style={{ marginTop: 10 }}>
          An estimate from the figures above, not a prediction. Investments can fall as well as rise, and the growth rate is your own assumption.
        </p>
      </div>
    </Page>
  )
}
