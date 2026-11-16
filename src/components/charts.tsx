import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { moneyShort } from '../lib/util'
import { ChartTip } from './ui'

const tick = { fill: 'var(--muted)', fontSize: 12 }
const axes = (
  <>
    <CartesianGrid vertical={false} stroke="var(--grid)" />
    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={tick} minTickGap={16} interval="preserveStartEnd" />
    <YAxis tickFormatter={moneyShort} width={46} tickLine={false} axisLine={false} tick={tick} />
  </>
)

export interface Series { key: string; name: string; color: string }

export function Bars<T extends { label: string }>({ data, series, selected, onSelect }: {
  data: T[]; series: Series[]; selected?: number; onSelect?(i: number): void
}) {
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data} barCategoryGap="22%" barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          {axes}
          <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--wash)' }} />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false}
              onClick={(_d, i) => onSelect?.(i)} cursor={onSelect ? 'pointer' : undefined}>
              {selected !== undefined && data.map((_, i) => <Cell key={i} fillOpacity={i === selected ? 1 : 0.45} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Lines<T extends { label: string }>({ data, series }: { data: T[]; series: Series[] }) {
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {axes}
          <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--axis)' }} />
          {series.map(s => <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export const Legend = ({ series }: { series: Series[] }) => (
  <div className="legend">{series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}</div>
)
