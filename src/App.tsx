import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { bank, supabase } from './lib/backend'
import { StoreProvider, useStore } from './lib/store'
import Accounts from './pages/Accounts'
import Bills from './pages/Bills'
import Dashboard from './pages/Dashboard'
import Forecast from './pages/Forecast'
import Receipts from './pages/Receipts'
import Savings from './pages/Savings'
import Settings from './pages/Settings'
import Spending from './pages/Spending'
import Transactions from './pages/Transactions'

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  accounts: 'M3 7h18v12H3zM3 11h18M7 15h3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  receipt: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  save: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  forecast: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  settings: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2M16 4v4M8 10v4M16 16v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}
const Icon = ({ name }: { name: string }) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>

const NAV: [string, string, string][] = [
  ['/', 'Home', 'home'], ['/accounts', 'Accounts', 'accounts'], ['/transactions', 'Transactions', 'list'],
  ['/spending', 'Spending', 'chart'], ['/bills', 'Bills & subs', 'bills'], ['/receipts', 'Receipts', 'receipt'],
  ['/savings', 'Save money', 'save'], ['/forecast', 'Forecast', 'forecast'], ['/settings', 'Settings', 'settings'],
]

function More() {
  return (
    <div className="page"><h1>More</h1>
      <div className="card"><ul className="list">
        {NAV.filter(([to]) => !['/', '/transactions', '/spending', '/bills'].includes(to)).map(([to, label, icon]) => (
          <li key={to}><NavLink to={to} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit', flex: 1 }}><Icon name={icon} />{label}</NavLink></li>
        ))}
      </ul></div>
    </div>
  )
}

function Shell() {
  const s = useStore()
  // Returning from the bank's consent screen: finish the link, then pull transactions.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const code = q.get('code'), state = q.get('state'), err = q.get('error')
    if (!code && !err) return
    history.replaceState(null, '', location.pathname + location.hash)
    if (err) return s.toast(`Bank link cancelled: ${err}`)
    if (!state || state !== sessionStorage.getItem('bank-state')) return s.toast('Bank link could not be verified. Please try again.')
    sessionStorage.removeItem('bank-state')
    bank.exchange(code!).then(() => s.syncBanks()).catch(e => s.toast(`Bank link failed: ${(e as Error).message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand"><img src="icon-192.png" alt="" />Tally</div>
        {NAV.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} />{label}</NavLink>)}
        <div className="spacer" />
        <div className="mode">{s.mode === 'cloud' ? 'Synced across your devices' : 'Stored on this device only'}</div>
      </nav>
      <main>
        {!s.ready ? <div className="page"><p className="muted">Loading…</p></div> : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/spending" element={<Spending />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/more" element={<More />} />
          </Routes>
        )}
      </main>
      <nav className="tabbar">
        <NavLink to="/" end><Icon name="home" />Home</NavLink>
        <NavLink to="/transactions"><Icon name="list" />Activity</NavLink>
        <NavLink to="/spending"><Icon name="chart" />Spending</NavLink>
        <NavLink to="/bills"><Icon name="bills" />Bills</NavLink>
        <NavLink to="/more"><Icon name="more" />More</NavLink>
      </nav>
      {s.toastMsg && <div className="toast" role="status">{s.toastMsg}</div>}
    </div>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e: FormEvent, signUp: boolean) => {
    e.preventDefault()
    setBusy(true)
    const { error, data } = signUp
      ? await supabase!.auth.signUp({ email, password })
      : await supabase!.auth.signInWithPassword({ email, password })
    setBusy(false)
    setMsg(error ? error.message : signUp && !data.session ? 'Check your email to confirm your account, then sign in.' : '')
  }
  return (
    <div className="auth">
      <form className="card" onSubmit={e => go(e, false)}>
        <div className="brand" style={{ padding: 0 }}><img src="icon-192.png" alt="" />Tally</div>
        <p className="muted">Sign in to see your money on every device.</p>
        <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {msg && <p className="bad">{msg}</p>}
        <button className="primary" disabled={busy}>Sign in</button>
        <button type="button" disabled={busy} onClick={e => go(e, true)}>Create account</button>
      </form>
    </div>
  )
}

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(supabase ? null : true)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session))
    return () => data.subscription.unsubscribe()
  }, [])
  if (signedIn === null) return null
  if (!signedIn) return <SignIn />
  return <StoreProvider><HashRouter><Shell /></HashRouter></StoreProvider>
}
