// Supabase Edge Function: links UK bank accounts through TrueLayer (Open Banking, read-only)
// and copies balances and transactions into the user's tables.
//
// Secrets (set with `supabase secrets set ...`):
//   TRUELAYER_CLIENT_ID, TRUELAYER_CLIENT_SECRET
//   TRUELAYER_REDIRECT_URI  one or more allowed app addresses, comma-separated (e.g. local dev and the hosted site)
//   TRUELAYER_ENV   "sandbox" (default, mock bank) or "live"
//   CRON_SECRET     optional; lets a scheduled job sync every user (send it as the x-cron-secret header)
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const env = (k: string) => Deno.env.get(k) ?? ''
const LIVE = env('TRUELAYER_ENV') === 'live'
const DOMAIN = LIVE ? 'truelayer.com' : 'truelayer-sandbox.com'
const AUTH = `https://auth.${DOMAIN}`
const API = `https://api.${DOMAIN}/data/v1`

// The app says which of its addresses it is running at; only addresses on the allow-list are ever used.
const REDIRECTS = env('TRUELAYER_REDIRECT_URI').split(',').map(s => s.trim()).filter(Boolean)
const redirectFor = (asked: unknown) => (typeof asked === 'string' && REDIRECTS.includes(asked) ? asked : REDIRECTS[0])

// The `state` value that travels to the bank and back is signed for the user who started the link,
// so the return trip can be verified on any tab or device they are signed in on (no browser storage needed).
const STATE_TTL_MS = 20 * 60_000
async function signState(userId: string, ts: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(env('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`bank-link.${userId}.${ts}`)))
  return `${ts}.${[...sig].map(b => b.toString(16).padStart(2, '0')).join('')}`
}
async function stateIsValid(userId: string, state: unknown) {
  if (typeof state !== 'string') return false
  const ts = state.split('.')[0]
  const age = Date.now() - Number(ts)
  return Number.isFinite(age) && age >= 0 && age < STATE_TTL_MS && (await signState(userId, ts)) === state
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Conn { id: string; user_id: string; access_token: string; refresh_token: string | null; expires_at: string; last_synced: string | null }

async function token(params: Record<string, string>) {
  const res = await fetch(`${AUTH}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('TRUELAYER_CLIENT_ID'), client_secret: env('TRUELAYER_CLIENT_SECRET'), ...params }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error_description ?? body.error ?? `token request failed (${res.status})`)
  return body as { access_token: string; refresh_token?: string; expires_in: number }
}

async function get(path: string, access: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` } })
  if (!res.ok) throw new Error(`${path.split('?')[0]} → ${res.status}`)
  return ((await res.json()).results ?? []) as Record<string, any>[]
}

const day = (d: Date) => d.toISOString().slice(0, 10)

// Banks often name an account after its holder or an internal product code; "Monzo current account" reads better.
function friendlyName(it: Record<string, any>, kind: 'accounts' | 'cards') {
  const bank = it.provider?.display_name ?? ''
  const type = kind === 'cards' ? 'credit card' : it.account_type === 'SAVINGS' ? 'savings' : 'current account'
  return bank ? `${bank} ${type}` : it.display_name ?? 'Account'
}

async function syncConnection(admin: SupabaseClient, c: Conn): Promise<number> {
  let access = c.access_token
  if (Date.parse(c.expires_at) < Date.now() + 60_000) {
    if (!c.refresh_token) throw new Error('access expired — link the bank again')
    const t = await token({ grant_type: 'refresh_token', refresh_token: c.refresh_token })
    access = t.access_token
    await admin.from('bank_connections').update({
      access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    }).eq('id', c.id)
  }
  // First run pulls a year; later runs re-read the last 10 days to catch late-settling payments.
  const from = day(new Date(c.last_synced ? Date.parse(c.last_synced) - 10 * 86400_000 : Date.now() - 365 * 86400_000))
  const to = day(new Date())
  const now = new Date().toISOString()
  let added = 0

  for (const kind of ['accounts', 'cards'] as const) {
    let items: Record<string, any>[] = []
    try { items = await get(`/${kind}`, access) } catch { continue } // many banks expose only one of the two
    for (const it of items) {
      const extId = `tl:${it.account_id ?? it.card_id}`
      const itemPath = `/${kind}/${it.account_id ?? it.card_id}`
      const bal = (await get(`${itemPath}/balance`, access).catch(() => []))[0]
      // Card balances are reported as the amount owed, so they count against net worth.
      const balance = bal ? (kind === 'cards' ? -Number(bal.current) : Number(bal.current)) : null
      const { data: existing } = await admin.from('accounts').select('id').eq('user_id', c.user_id).eq('external_id', extId).maybeSingle()
      let accountId = existing?.id as string | undefined
      if (accountId) {
        await admin.from('accounts').update({ ...(balance !== null ? { balance } : {}), last_synced: now, connection_id: c.id, source: 'bank' }).eq('id', accountId)
      } else {
        const { data, error } = await admin.from('accounts').insert({
          user_id: c.user_id, external_id: extId, connection_id: c.id, source: 'bank', last_synced: now,
          name: friendlyName(it, kind), institution: it.provider?.display_name ?? '',
          type: kind === 'cards' ? 'credit' : it.account_type === 'SAVINGS' ? 'savings' : 'current', balance: balance ?? 0,
        }).select('id').single()
        if (error) throw error
        accountId = data.id
      }
      let txns: Record<string, any>[]
      try { txns = await get(`${itemPath}/transactions?from=${from}&to=${to}`, access) }
      catch { txns = await get(`${itemPath}/transactions?from=${day(new Date(Date.now() - 89 * 86400_000))}&to=${to}`, access) } // some banks cap history at 90 days
      const rows = txns.map(t => ({
        user_id: c.user_id, account_id: accountId, source: 'bank', external_id: `tl:${t.transaction_id}`,
        date: String(t.timestamp).slice(0, 10),
        amount: kind === 'cards' ? -Number(t.amount) : Number(t.amount), // card purchases arrive as positive numbers
        description: t.merchant_name || t.description || 'Transaction',
      }))
      for (let i = 0; i < rows.length; i += 500) {
        // ignoreDuplicates keeps any category or note already edited in the app.
        const { data, error } = await admin.from('transactions').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,external_id', ignoreDuplicates: true }).select('id')
        if (error) throw error
        added += data?.length ?? 0
      }
    }
  }
  await admin.from('bank_connections').update({ last_synced: now, status: 'ok' }).eq('id', c.id)
  return added
}

async function syncAll(admin: SupabaseClient, userId?: string) {
  let q = admin.from('bank_connections').select('*')
  if (userId) q = q.eq('user_id', userId)
  const { data: conns, error } = await q
  if (error) throw error
  let added = 0
  const errors: string[] = []
  for (const c of (conns ?? []) as Conn[]) {
    try { added += await syncConnection(admin, c) }
    catch (e) {
      errors.push((e as Error).message)
      await admin.from('bank_connections').update({ status: 'error' }).eq('id', c.id)
    }
  }
  return { added, errors }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const cron = req.headers.get('x-cron-secret')
    if (cron && env('CRON_SECRET') && cron === env('CRON_SECRET')) return json(await syncAll(admin))

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return json({ error: 'Not signed in' }, 401)
    const body = await req.json().catch(() => ({}))

    if (body.action === 'connections') {
      const { data } = await admin.from('bank_connections').select('id, provider_name, created_at, last_synced, status').eq('user_id', user.id).order('created_at')
      return json({ connections: data ?? [] })
    }
    if (body.action === 'sync') return json(await syncAll(admin, user.id))
    if (body.action === 'disconnect') {
      const { data: c } = await admin.from('bank_connections').select('*').eq('id', body.id).eq('user_id', user.id).maybeSingle()
      if (!c) return json({ error: 'Link not found' }, 404)
      await fetch(`${AUTH}/api/delete`, { method: 'DELETE', headers: { Authorization: `Bearer ${c.access_token}` } }).catch(() => {}) // best effort: revoke at the provider
      await admin.from('bank_connections').delete().eq('id', c.id)
      return json({ ok: true })
    }

    if (!env('TRUELAYER_CLIENT_ID') || !env('TRUELAYER_CLIENT_SECRET') || !REDIRECTS.length)
      return json({ error: 'TrueLayer keys are not set on the server' }, 400)

    if (body.action === 'auth-url') {
      const q = new URLSearchParams({
        response_type: 'code', client_id: env('TRUELAYER_CLIENT_ID'), redirect_uri: redirectFor(body.redirect),
        scope: 'info accounts balance cards transactions offline_access',
        providers: LIVE ? 'uk-ob-all uk-oauth-all' : 'uk-cs-mock uk-ob-all uk-oauth-all',
        state: await signState(user.id, String(Date.now())),
      })
      return json({ url: `${AUTH}/?${q}` })
    }
    if (body.action === 'exchange') {
      if (!(await stateIsValid(user.id, body.state)))
        return json({ error: 'This bank link was started more than 20 minutes ago or under a different login. Please start it again.' }, 400)
      const t = await token({ grant_type: 'authorization_code', redirect_uri: redirectFor(body.redirect), code: String(body.code ?? '') })
      const me = (await get('/me', t.access_token).catch(() => []))[0]
      const { error } = await admin.from('bank_connections').insert({
        user_id: user.id, provider_name: me?.provider?.display_name ?? 'Bank', access_token: t.access_token,
        refresh_token: t.refresh_token ?? null, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      })
      if (error) throw error
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
