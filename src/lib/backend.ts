import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { emptyTables, TABLE_NAMES } from './types'
import type { TableName, Tables } from './types'
import { uid } from './util'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
/** Null when no cloud project is configured: the app then keeps data on this device only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

// ---- tiny IndexedDB key/value store (local data, offline cache, receipt files) ----
let dbp: Promise<IDBDatabase> | null = null
const idb = () =>
  (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('tally', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const d = await idb()
  return new Promise<T>((resolve, reject) => {
    const r = fn(d.transaction('kv', mode).objectStore('kv'))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
export const kvGet = <T>(k: string) => tx<T | undefined>('readonly', s => s.get(k))
export const kvSet = (k: string, v: unknown) => tx('readwrite', s => s.put(v, k))
export const kvDel = (k: string) => tx('readwrite', s => s.delete(k))

export interface Backend {
  load(): Promise<Tables>
  upsert(table: TableName, rows: { id: string }[]): Promise<void>
  remove(table: TableName, ids: string[]): Promise<void>
  uploadFile(file: File): Promise<string>
  fileUrl(path: string): Promise<string>
  removeFile(path: string): Promise<void>
}

type Row = { id: string }
const rowsOf = (t: Tables, name: TableName) => t[name] as unknown as Row[]

export function localBackend(): Backend {
  let mem: Tables | null = null
  const persist = () => kvSet('tables', mem)
  return {
    async load() {
      mem = { ...emptyTables(), ...((await kvGet<Tables>('tables')) ?? {}) }
      return structuredClone(mem)
    },
    async upsert(table, rows) {
      if (!mem) await this.load()
      const map = new Map(rowsOf(mem!, table).map(r => [r.id, r]))
      for (const r of rows) map.set(r.id, r)
      ;(mem as unknown as Record<string, Row[]>)[table] = [...map.values()]
      await persist()
    },
    async remove(table, ids) {
      if (!mem) await this.load()
      const gone = new Set(ids)
      ;(mem as unknown as Record<string, Row[]>)[table] = rowsOf(mem!, table).filter(r => !gone.has(r.id))
      await persist()
    },
    async uploadFile(file) {
      const path = `file:${uid()}`
      await kvSet(path, file)
      return path
    },
    async fileUrl(path) {
      const blob = await kvGet<Blob>(path)
      if (!blob) throw new Error('File not found on this device')
      return URL.createObjectURL(blob)
    },
    async removeFile(path) { await kvDel(path) },
  }
}

const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export function cloudBackend(sb: SupabaseClient): Backend {
  const all = async (table: TableName) => {
    const out: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order('id').range(from, from + 999)
      if (error) throw error
      out.push(...(data as Row[]))
      if (!data || data.length < 1000) return out
    }
  }
  return {
    async load() {
      try {
        const lists = await Promise.all(TABLE_NAMES.map(all))
        const t = Object.fromEntries(TABLE_NAMES.map((n, i) => [n, lists[i]])) as unknown as Tables
        void kvSet('cloud-cache', t)
        return t
      } catch (e) {
        const cached = await kvGet<Tables>('cloud-cache') // offline: show the last synced copy
        if (cached) return cached
        throw e
      }
    },
    async upsert(table, rows) {
      for (const part of chunks(rows, 500)) {
        const { error } = await sb.from(table).upsert(part)
        if (error) throw error
      }
    },
    async remove(table, ids) {
      for (const part of chunks(ids, 200)) {
        const { error } = await sb.from(table).delete().in('id', part)
        if (error) throw error
      }
    },
    async uploadFile(file) {
      const { data } = await sb.auth.getUser()
      const path = `${data.user!.id}/${uid()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error } = await sb.storage.from('receipts').upload(path, file, { contentType: file.type })
      if (error) throw error
      return path
    },
    async fileUrl(path) {
      const { data, error } = await sb.storage.from('receipts').createSignedUrl(path, 3600)
      if (error) throw error
      return data.signedUrl
    },
    async removeFile(path) {
      const { error } = await sb.storage.from('receipts').remove([path])
      if (error) throw error
    },
  }
}

// ---- bank linking (cloud mode): all provider secrets stay inside the `bank` edge function ----
export interface BankConnection { id: string; provider_name: string; created_at: string; last_synced: string | null; status: string }

async function bankCall<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Cloud sync is not configured')
  const { data, error } = await supabase.functions.invoke('bank', { body: { action, ...extra } })
  if (error) {
    const ctx = (error as { context?: unknown }).context
    if (!(ctx instanceof Response)) throw new Error('the bank service has not been deployed yet')
    const detail = await ctx.json().catch(() => null)
    throw new Error(ctx.status === 404 ? 'the bank service has not been deployed yet' : detail?.error ?? error.message)
  }
  return data as T
}
/** Where this copy of the app lives; the bank sends you back here after you approve access. */
const appAddress = () => location.origin + location.pathname

export const bank = {
  authUrl: (state: string) => bankCall<{ url: string }>('auth-url', { state, redirect: appAddress() }),
  exchange: (code: string) => bankCall<{ ok: true }>('exchange', { code, redirect: appAddress() }),
  sync: () => bankCall<{ added: number; errors: string[] }>('sync'),
  connections: () => bankCall<{ connections: BankConnection[] }>('connections'),
  disconnect: (id: string) => bankCall<{ ok: true }>('disconnect', { id }),
}
