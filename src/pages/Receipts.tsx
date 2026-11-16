import { useEffect, useMemo, useState } from 'react'
import { CategorySelect, Empty, Field, Modal, num, Page } from '../components/ui'
import { categorise } from '../lib/categories'
import { useStore } from '../lib/store'
import type { Receipt, Txn } from '../lib/types'
import { daysBetween, fmtDate, money, round2, today, uid } from '../lib/util'

function useFileUrl(path: string | null) {
  const { fileUrl } = useStore()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) fileUrl(path).then(u => live && setUrl(u)).catch(() => {})
    return () => { live = false }
  }, [path, fileUrl])
  return url
}

/** A purchase on the same amount within three days of the receipt is almost certainly the same one. */
const findMatch = (txns: Txn[], total: number, date: string, taken: Set<string>) =>
  txns.find(t => !taken.has(t.id) && Math.abs(-t.amount - total) < 0.005 && Math.abs(daysBetween(t.date, date)) <= 3)

function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose(): void }) {
  const s = useStore()
  const { db } = s
  const [file, setFile] = useState<File | null>(null)
  const [f, setF] = useState(() => ({
    merchant: receipt?.merchant ?? '', total: String(receipt?.total ?? ''), date: receipt?.date ?? today(), category: receipt?.category ?? '', notes: receipt?.notes ?? '',
    addTxn: false, account_id: db.accounts[0]?.id ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const url = useFileUrl(receipt?.file_path ?? null)
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
  const taken = useMemo(() => new Set(db.receipts.filter(r => r.id !== receipt?.id && r.transaction_id).map(r => r.transaction_id!)), [db.receipts, receipt])
  const linked = receipt?.transaction_id ? db.transactions.find(t => t.id === receipt.transaction_id) : undefined
  const match = linked ?? (num(f.total) > 0 ? findMatch(db.transactions, num(f.total), f.date, taken) : undefined)

  const submit = async () => {
    setBusy(true)
    try {
      const total = round2(num(f.total))
      const category = f.category || categorise(f.merchant, -total)
      let transaction_id = match?.id ?? null
      if (!match && f.addTxn && f.account_id) {
        transaction_id = uid()
        await s.saveTxn({ id: transaction_id, account_id: f.account_id, date: f.date, amount: -total, description: f.merchant.trim(), category, notes: f.notes, source: 'receipt', external_id: null })
      }
      const file_path = file ? await s.uploadFile(file) : receipt?.file_path ?? null
      if (file && receipt?.file_path) await s.removeFile(receipt.file_path).catch(() => {}) // replaced: drop the old image
      await s.save('receipts', {
        id: receipt?.id ?? uid(), merchant: f.merchant.trim(), total, date: f.date, category, notes: f.notes,
        file_path, file_type: file ? file.type : receipt?.file_type ?? null, transaction_id,
      })
      onClose()
    } catch (e) { s.toast(`Couldn't save receipt: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const shown = preview ?? (receipt?.file_type?.startsWith('image/') ? url : null)
  return (
    <Modal title={receipt ? 'Receipt' : 'Add receipt'} onClose={onClose}
      footer={<>
        {receipt && <button className="danger" onClick={async () => { await s.remove('receipts', receipt.id); if (receipt.file_path) await s.removeFile(receipt.file_path).catch(() => {}); onClose() }}>Delete</button>}
        <button className="primary" disabled={busy || !f.merchant.trim() || num(f.total) <= 0} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="form">
        {shown && <img className="receipt-full" src={shown} alt="Receipt" />}
        {!shown && url && <a href={url} target="_blank" rel="noreferrer">Open attached file</a>}
        <Field label={receipt?.file_path ? 'Replace photo or PDF' : 'Photo or PDF'} hint="On a phone this opens the camera or your photo library.">
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Shop"><input value={f.merchant} onChange={e => set({ merchant: e.target.value })} /></Field>
        <div className="form-row">
          <Field label="Total (£)"><input inputMode="decimal" value={f.total} onChange={e => set({ total: e.target.value })} /></Field>
          <Field label="Date"><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} /></Field>
        </div>
        <Field label="Category"><CategorySelect value={f.category} onChange={category => set({ category })} all="Choose automatically" /></Field>
        <Field label="Notes"><input value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="What you bought, warranty, etc." /></Field>
        {match ? <p className="muted">✓ Matches <b>{match.description}</b> on {fmtDate(match.date)} — it will be attached to that transaction.</p>
          : num(f.total) > 0 && db.accounts.length > 0 && (
            <>
              <label className="check"><input type="checkbox" checked={f.addTxn} onChange={e => set({ addTxn: e.target.checked })} />No matching transaction found — record this purchase too</label>
              {f.addTxn && <Field label="Paid from"><select value={f.account_id} onChange={e => set({ account_id: e.target.value })}>{db.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
            </>
          )}
      </div>
    </Modal>
  )
}

function Card({ r, onOpen }: { r: Receipt; onOpen(): void }) {
  const url = useFileUrl(r.file_type?.startsWith('image/') ? r.file_path : null)
  return (
    <button className="card receipt" onClick={onOpen}>
      <div className="thumb">{url ? <img src={url} alt="" loading="lazy" /> : r.file_path ? 'PDF' : 'No image'}</div>
      <div className="meta"><b>{r.merchant}</b><div className="num">{money(r.total)}</div><small className="muted">{fmtDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}{r.transaction_id && ' · linked'}</small></div>
    </button>
  )
}

export default function Receipts() {
  const { db } = useStore()
  const [open, setOpen] = useState<Receipt | null | 'new'>(null)
  const rows = [...db.receipts].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Page title="Receipts" subtitle="Proof of purchase, kept with the payment it belongs to." actions={<button className="primary" onClick={() => setOpen('new')}>Add receipt</button>}>
      {!rows.length ? <div className="card"><Empty title="No receipts yet" emoji="🧾">Snap or upload a receipt to keep proof of purchase next to the transaction it belongs to.</Empty></div>
        : <div className="receipts">{rows.map(r => <Card key={r.id} r={r} onOpen={() => setOpen(r)} />)}</div>}
      {open && <ReceiptModal receipt={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </Page>
  )
}
