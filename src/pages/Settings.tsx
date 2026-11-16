import { useRef, useState } from 'react'
import { Page } from '../components/ui'
import { supabase } from '../lib/backend'
import { demoData } from '../lib/demo'
import { useStore } from '../lib/store'
import { emptyTables, TABLE_NAMES } from '../lib/types'
import type { Tables } from '../lib/types'
import { today } from '../lib/util'

export default function Settings() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState(false)

  const exportJson = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s.db, null, 2)], { type: 'application/json' }))
    a.download = `tally-backup-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Partial<Tables>
      if (!TABLE_NAMES.some(n => Array.isArray(data[n]))) throw new Error('not a Tally backup file')
      await s.replaceAll({ ...emptyTables(), ...data })
      s.toast('Backup restored')
    } catch (e) { s.toast(`Couldn't restore: ${(e as Error).message}`) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const count = TABLE_NAMES.reduce((n, t) => n + s.db[t].length, 0)

  return (
    <Page title="Settings">
      <div className="card">
        <h2>Sync</h2>
        {s.mode === 'cloud' ? (
          <div className="actions"><p style={{ flex: 1 }}>Signed in. Changes appear on your other devices within a couple of seconds.</p>
            <button onClick={() => supabase!.auth.signOut()}>Sign out</button></div>
        ) : (
          <p>Data is stored <b>on this device only</b>. To sync your phone, web and desktop, follow "Turn on sync" in the README to connect a Supabase project, then rebuild.</p>
        )}
      </div>
      <div className="card">
        <h2>Install as an app</h2>
        <p>On a phone, open this site in your browser and choose <b>Add to Home Screen</b>. On a computer, use the install button in the address bar (Chrome or Edge). It then opens in its own window and works offline.</p>
      </div>
      <div className="card">
        <h2>Your data</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{count} records. Backups include everything except receipt images.</p>
        <div className="actions">
          <button onClick={exportJson}>Download backup</button>
          <button onClick={() => fileRef.current?.click()}>Restore backup</button>
          {s.mode === 'local' && <button onClick={async () => { await s.replaceAll(demoData()); s.toast('Demo data loaded') }}>Replace with demo data</button>}
          {confirm
            ? <button className="danger" onClick={async () => { await s.replaceAll(emptyTables()); setConfirm(false); s.toast('All data cleared') }}>Yes, delete all {count} records</button>
            : <button className="danger" onClick={() => setConfirm(true)}>Clear all data</button>}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => importJson(e.target.files?.[0])} />
      </div>
    </Page>
  )
}
