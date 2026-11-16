# Tally

Personal money tracker: accounts, spending by day/week/month/year, bills and subscriptions, receipts, saving ideas, budgets, goals and a net-worth forecast. One installable web app for phone, desktop and browser.

```bash
npm install
npm run dev
```

Out of the box it runs in **local mode**: data lives in this browser only, and "Load demo data" fills it with sample accounts (labelled Demo) so you can look around.

## What works in which mode

| | Local mode (no setup) | Cloud mode (Supabase) |
|---|---|---|
| Manual accounts, transactions, bills, budgets, goals, forecast | yes | yes |
| CSV statement import (Monzo format and most date/description/amount layouts) | yes | yes |
| Receipts (photo/PDF) | stored on the device | stored in your private Supabase bucket |
| Sync between phone, desktop and web | no — use backup/restore in Settings | yes, live |
| Live bank link with automatic updates | demo feed only | yes, through TrueLayer |

## Turn on sync (Supabase)

1. Create a free project at supabase.com.
2. In the dashboard open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project Settings → API).
4. Restart `npm run dev`. The app now asks you to create an account and sign in; use the same login on every device.

`.env.local` is git-ignored. Never put the service-role key or any TrueLayer secret in it.

## Link your banks (TrueLayer, UK Open Banking)

Access is read-only: balances and transactions. The app cannot move money.

1. Create an app at console.truelayer.com and note the client id and secret.
2. In the TrueLayer console add your app's address as an allowed redirect URI — exactly as it appears in the browser, e.g. `http://localhost:5183/` for development or your hosted URL.
3. Deploy the function and give it the keys:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set TRUELAYER_CLIENT_ID=... TRUELAYER_CLIENT_SECRET=... TRUELAYER_REDIRECT_URI=https://your-app-url/ TRUELAYER_ENV=sandbox
npx supabase functions deploy bank --no-verify-jwt
```

(`--no-verify-jwt` is fine: the function checks the signed-in user itself.)

4. In the app: Accounts → **Link a bank**. In `sandbox` you get TrueLayer's mock bank (user `john`, password `doe`). Switch `TRUELAYER_ENV=live` with your live client id/secret for real banks.

Things to know:

- **Monzo and Chase UK** are both Open Banking providers. **Vanguard is not** (investment platforms aren't covered), so add it as a manual account and update the balance when it changes.
- Going live with real banks requires TrueLayer to approve your app for production data. Check their current terms for personal use before relying on it; CSV import is the fallback.
- UK rules make you re-approve access roughly every 90 days. A link that has expired shows "Needs re-linking".

### Automatic updates

The app refreshes linked accounts when you open it, when it returns to the foreground, and every 30 minutes while open. To also update in the background, set `CRON_SECRET` as a function secret and schedule a call (Supabase dashboard → Integrations → Cron) that POSTs to `https://<project-ref>.supabase.co/functions/v1/bank` with the header `x-cron-secret: <your secret>`.

## Put it on your phone

Build with `npm run build` and host the `dist` folder on any static host with HTTPS (GitHub Pages, Cloudflare Pages, Netlify). Open the URL on your phone and choose **Add to Home Screen**; on desktop use the install button in the address bar. Remember to add that URL as the TrueLayer redirect URI.

## Layout

- `src/lib/analytics.ts` — spending buckets, recurring-payment detection, saving insights, forecast maths
- `src/lib/backend.ts` — local (IndexedDB) and cloud (Supabase) storage behind one interface
- `src/lib/store.tsx` — app state, optimistic saves, auto-sync
- `src/lib/categories.ts` — category list and merchant keyword rules (edit to taste)
- `supabase/schema.sql` — tables, row-level security, receipts bucket
- `supabase/functions/bank/index.ts` — TrueLayer link + sync
