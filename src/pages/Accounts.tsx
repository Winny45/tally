import { useEffect, useRef, useState } from 'react'
import { Empty, Field, Modal, num, Page, Stat } from '../components/ui'
import { cashAvailable, netWorth } from '../lib/analytics'
import { bank } from '../lib/backend'
import type { BankConnection } from '../lib/backend'
import { importCsv } from '../lib/csv'
import { demoData } from '../lib/demo'
import { useStore } from '../lib/store'
import type { Account, AccountType } from '../lib/types'
import { money, sum, uid } from '../lib/util'

const TYPES: [AccountType, string][] = [['current', 'Current account'], ['savings', 'Savings'], ['credit', 'Credit card'], ['investment', 'Investments'], ['cash', 'Cash']]
const ago = (isoTime: string | null) => {
  if (!isoTime) return 'never updated'
  const mins = Math.round((Date.now() - Date.parse(isoTime)) / 60000)
  return mins < 2 ? 'updated just now' : mins < 60 ? `updated ${mins} min ago` : mins < 1440 ? `updated ${Math.round(mins / 60)} h ago` : `updated ${Math.round(mins / 1440)} d ago`
}

function AccountModal({ account, onClose }: { account: Account | null; onClose(): void }) {
  const { db, save, remove } = useStore()
  const [f, setF] = useState(() => ({ name: account?.name ?? '', institution: account?.institution ?? '', type: account?.type ?? 'current' as AccountType, balance: String(account?.balance ?? '') }))
  const [confirm, setConfirm] = useState(false)
  const linked = account?.source === 'bank'
  const count = account ? db.transactions.filter(t => t.account_id === account.id).length : 0
  const submit = async () => {
    await save('accounts', {
      id: account?.id ?? uid(), source: account?.source ?? 'manual', external_id: account?.external_id ?? null,
      connection_id: account?.connection_id ?? null, last_synced: account?.last_synced ?? null,
      name: f.name.trim(), institution: f.institution.trim(), type: f.type, balance: num(f.balance),
    })
    onClose()
  }
  return (
    <Modal title={account ? 'Edit account' : 'Add account'} onClose={onClose}
      footer={<>
        {account && (confirm
          ? <button className="danger" onClick={async () => { await remove('accounts', account.id); onClose() }}>Yes, remove it and its {count} transaction{count === 1 ? "" : "s"}</button>
          : <button className="danger" onClick={() => setConfirm(true)}>Remove account</button>)}
        <button className="primary" disabled={!f.name.trim()} onClick={submit}>Save</button>
      </>}>
      <div className="form">
        <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Vanguard ISA" autoFocus={!account} /></Field>
        <div className="form-row">
          <Field label="Provider"><input value={f.institution} onChange={e => setF({ ...f, institution: e.target.value })} placeholder="e.g. Vanguard" /></Field>
          <Field label="Type"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value as AccountType })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        </div>
        <Field label="Current balance (£)" hint={linked ? 'Kept up to date by your bank.' : 'Use a negative number for money owed, such as a credit card balance.'}>
          <input inputMode="decimal" value={f.balance} disabled={linked} onChange={e => setF({ ...f, balance: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

export default function Accounts() {
  const s = useStore()
  const { db } = s
  const [editing, setEditing] = useState<Account | null | 'new'>(null)
  const [conns, setConns] = useState<BankConnection[] | null>(null)
  const [connErr, setConnErr] = useState('')
  const [localInfo, setLocalInfo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const importFor = useRef('')

  const loadConns = () => bank.connections().then(r => { setConns(r.connections); setConnErr('') }).catch(e => setConnErr((e as Error).message))
  useEffect(() => { if (s.mode === 'cloud') void loadConns() }, [s.mode, db.accounts.length])

  const connect = async () => {
    if (s.mode === 'local') return setLocalInfo(true)
    try {
      location.href = (await bank.authUrl()).url
    } catch (e) { s.toast(`Couldn't start bank link: ${(e as Error).message}`) }
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const res = await importCsv(file, importFor.current, db.transactions)
      await s.save('transactions', res.rows)
      s.toast(`Imported ${res.rows.length}${res.duplicates ? `, skipped ${res.duplicates} already here` : ''}${res.unreadable ? `, ${res.unreadable} rows unreadable` : ''}`)
    } catch (e) { s.toast((e as Error).message) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const addDemo = async () => {
    const d = demoData()
    await s.save('accounts', d.accounts)
    await s.save('transactions', d.transactions)
    setLocalInfo(false)
  }

  return (
    <Page title="Accounts" actions={<>
      <button onClick={() => s.syncBanks()} disabled={s.syncing}>{s.syncing ? 'Updating…' : 'Update now'}</button>
      <button onClick={() => setEditing('new')}>Add manually</button>
      <button className="primary" onClick={connect}>Link a bank</button>
    </>}>
      <div className="grid cols-3">
        <Stat label="Net worth" value={money(netWorth(db.accounts))} />
        <Stat label="Available cash" value={money(cashAvailable(db.accounts))} />
        <Stat label="Savings and investments" value={money(sum(db.accounts.filter(a => a.type === 'savings' || a.type === 'investment').map(a => a.balance)))} />
      </div>
      <div className="card">
        {!db.accounts.length ? <Empty title="No accounts yet">Link a bank for automatic updates, or add an account by hand and import its statements.</Empty> : (
          <ul className="list">
            {db.accounts.map(a => (
              <li key={a.id}>
                <div className="dot" aria-hidden="true">{(a.institution || a.name).charAt(0).toUpperCase()}</div>
                <div className="row-main">
                  <b>{a.name}</b>
                  <small>{a.institution || 'Manual'} · {TYPES.find(t => t[0] === a.type)?.[1]} · {a.source === 'manual' ? 'updated by hand' : ago(a.last_synced)}</small>
                </div>
                <span className="badge">{a.source === 'bank' ? 'Linked' : a.source === 'demo' ? 'Demo' : 'Manual'}</span>
                <strong className={`num ${a.balance < 0 ? 'bad' : ''}`}>{money(a.balance)}</strong>
                {a.source !== 'bank' && <button onClick={() => { importFor.current = a.id; fileRef.current?.click() }}>Import CSV</button>}
                <button onClick={() => setEditing(a)}>Edit</button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => onFile(e.target.files?.[0])} />
      </div>
      {s.mode === 'cloud' && (
        <div className="card">
          <h2>Bank links</h2>
          {connErr ? <p className="muted">Bank linking isn't available yet: {connErr}. See "Link your banks" in the README.</p>
            : !conns?.length ? <p className="muted">No banks linked. "Link a bank" takes you to your bank to approve read-only access.</p> : (
              <ul className="list">{conns.map(c => (
                <li key={c.id}>
                  <div className="row-main"><b>{c.provider_name}</b><small>{c.status === 'ok' ? ago(c.last_synced) : 'Needs re-linking — access has expired'}</small></div>
                  <button className="danger" onClick={async () => { await bank.disconnect(c.id).catch(e => s.toast((e as Error).message)); void loadConns() }}>Unlink</button>
                </li>
              ))}</ul>
            )}
          <p className="muted" style={{ marginTop: 10 }}>Unlinking stops updates; the account and its history stay until you remove the account.</p>
        </div>
      )}
      <p className="muted">Investment platforms such as Vanguard aren't covered by Open Banking, so add them manually and update the balance when it changes.</p>
      {editing && <AccountModal account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {localInfo && (
        <Modal title="Link a bank" onClose={() => setLocalInfo(false)} footer={<button className="primary" onClick={addDemo}>Add demo bank accounts</button>}>
          <p>Live bank links need the cloud setup (Supabase and TrueLayer keys) described in the README. Until that's done you can import CSV statements into a manual account, or add demo accounts to see how automatic updates behave.</p>
        </Modal>
      )}
    </Page>
  )
}
