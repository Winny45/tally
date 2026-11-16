import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { bank, cloudBackend, localBackend, supabase } from './backend'
import { categorise } from './categories'
import { demoFeed } from './demo'
import { emptyTables, TABLE_NAMES } from './types'
import type { Account, TableName, Tables, Txn } from './types'
import { round2 } from './util'

type RowOf<K extends TableName> = Tables[K][number]

interface Store {
  db: Tables
  ready: boolean
  mode: 'local' | 'cloud'
  syncing: boolean
  toastMsg: string | null
  toast(msg: string): void
  save<K extends TableName>(table: K, rows: RowOf<K> | RowOf<K>[]): Promise<void>
  remove(table: TableName, ids: string | string[]): Promise<void>
  /** Saves a transaction and keeps the balance of a hand-maintained account in step. */
  saveTxn(next: Txn, prev?: Txn): Promise<void>
  deleteTxn(t: Txn): Promise<void>
  replaceAll(t: Tables): Promise<void>
  uploadFile(file: File): Promise<string>
  fileUrl(path: string): Promise<string>
  removeFile(path: string): Promise<void>
  syncBanks(quiet?: boolean): Promise<void>
  reload(): Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => useContext(Ctx)!

export function StoreProvider({ children }: { children: ReactNode }) {
  const mode: Store['mode'] = supabase ? 'cloud' : 'local'
  const backend = useMemo(() => (supabase ? cloudBackend(supabase) : localBackend()), [])
  const [db, setDb] = useState<Tables>(emptyTables)
  const dbRef = useRef(db)
  dbRef.current = db
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toastMsg, setToast] = useState<string | null>(null)
  const timer = useRef(0)

  const toast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 4500)
  }, [])
  const guard = useCallback(async (p: Promise<unknown>) => {
    try { await p } catch (e) { toast(`Couldn't save: ${(e as Error).message}`) }
  }, [toast])

  const save = useCallback(async <K extends TableName>(table: K, rows: RowOf<K> | RowOf<K>[]) => {
    const list = (Array.isArray(rows) ? rows : [rows]) as { id: string }[]
    if (!list.length) return
    setDb(d => {
      const map = new Map((d[table] as { id: string }[]).map(r => [r.id, r]))
      for (const r of list) map.set(r.id, r)
      return { ...d, [table]: [...map.values()] }
    })
    await guard(backend.upsert(table, list))
  }, [backend, guard])

  const remove = useCallback(async (table: TableName, ids: string | string[]) => {
    const gone = new Set(Array.isArray(ids) ? ids : [ids])
    if (!gone.size) return
    const cur = dbRef.current
    if (table === 'accounts') {
      const txIds = cur.transactions.filter(t => gone.has(t.account_id)).map(t => t.id)
      if (txIds.length) await remove('transactions', txIds)
    }
    if (table === 'transactions') {
      const orphaned = cur.receipts.filter(r => r.transaction_id && gone.has(r.transaction_id)).map(r => ({ ...r, transaction_id: null }))
      if (orphaned.length) await save('receipts', orphaned)
    }
    setDb(d => ({ ...d, [table]: (d[table] as { id: string }[]).filter(r => !gone.has(r.id)) }))
    await guard(backend.remove(table, [...gone]))
  }, [backend, guard, save])

  const adjust = useCallback(async (accountId: string, delta: number) => {
    const a = dbRef.current.accounts.find(x => x.id === accountId)
    if (a && a.source === 'manual' && delta) await save('accounts', { ...a, balance: round2(a.balance + delta) })
  }, [save])
  const saveTxn = useCallback(async (next: Txn, prev?: Txn) => {
    await save('transactions', next)
    if (prev && prev.account_id === next.account_id) await adjust(next.account_id, next.amount - prev.amount)
    else { if (prev) await adjust(prev.account_id, -prev.amount); await adjust(next.account_id, next.amount) }
  }, [save, adjust])
  const deleteTxn = useCallback(async (t: Txn) => {
    await remove('transactions', t.id)
    await adjust(t.account_id, -t.amount)
  }, [remove, adjust])

  const reload = useCallback(async () => {
    const t = await backend.load()
    setDb(t)
    // Bank feeds arrive uncategorised; label them here so one rule set serves every source.
    const blank = t.transactions.filter(x => !x.category).map(x => ({ ...x, category: categorise(x.description, x.amount) }))
    if (blank.length) await save('transactions', blank)
  }, [backend, save])

  const replaceAll = useCallback(async (t: Tables) => {
    const cur = dbRef.current
    for (const name of [...TABLE_NAMES].reverse()) await guard(backend.remove(name, (cur[name] as { id: string }[]).map(r => r.id)))
    for (const name of TABLE_NAMES) await guard(backend.upsert(name, t[name] as { id: string }[]))
    setDb(t)
  }, [backend, guard])

  const syncBanks = useCallback(async (quiet = false) => {
    setSyncing(true)
    try {
      if (mode === 'cloud') {
        const res = await bank.sync()
        await reload()
        if (res.errors.length) toast(`Bank sync problem: ${res.errors[0]}`)
        else if (!quiet) toast(res.added ? `${res.added} new transaction${res.added === 1 ? '' : 's'}` : 'Everything is up to date')
      } else {
        const demo = dbRef.current.accounts.filter(a => a.source === 'demo')
        const fresh = demoFeed(dbRef.current.accounts, demo[0]?.last_synced ?? null)
        const now = new Date().toISOString()
        const delta = new Map<string, number>()
        for (const t of fresh) delta.set(t.account_id, (delta.get(t.account_id) ?? 0) + t.amount)
        await save('transactions', fresh)
        await save('accounts', demo.map((a): Account => ({ ...a, last_synced: now, balance: round2(a.balance + (delta.get(a.id) ?? 0)) })))
        if (!quiet) toast(demo.length ? `${fresh.length} new demo transaction${fresh.length === 1 ? '' : 's'}` : 'No linked accounts to update')
      }
    } catch (e) {
      if (!quiet) toast(`Sync failed: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }, [mode, reload, save, toast])

  useEffect(() => {
    let live = true
    reload().catch(e => toast(`Couldn't load your data: ${(e as Error).message}`)).finally(() => live && setReady(true))
    if (!supabase) return
    // Another device changed something: pull the fresh copy.
    let t = 0
    const ch = supabase.channel('tally').on('postgres_changes', { event: '*', schema: 'public' }, () => {
      clearTimeout(t)
      t = window.setTimeout(() => void reload().catch(() => {}), 1500)
    }).subscribe()
    return () => { live = false; void supabase!.removeChannel(ch) }
  }, [reload, toast])

  // Automatic updates: refresh linked accounts on open, when the app comes back to the front, and every 30 minutes.
  useEffect(() => {
    if (!ready) return
    const check = () => {
      const linked = dbRef.current.accounts.filter(a => a.source !== 'manual')
      const stale = linked.some(a => !a.last_synced || Date.now() - Date.parse(a.last_synced) > 6 * 3600_000)
      if (stale && document.visibilityState === 'visible') void syncBanks(true)
    }
    check()
    const id = setInterval(check, 30 * 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check) }
  }, [ready, syncBanks])

  const value: Store = {
    db, ready, mode, syncing, toastMsg, toast, save, remove, saveTxn, deleteTxn, replaceAll, syncBanks, reload,
    uploadFile: backend.uploadFile, fileUrl: backend.fileUrl, removeFile: backend.removeFile,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
