'use client'

import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import { InventoryItem, InventoryTransaction, InventoryMetric, computeBalance } from '../../lib/types'

type Location = { id: string; name: string }

function today() { return new Date().toISOString().slice(0, 10) }

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'
const sel = input

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-800 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)

  // Selected item for detail view
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  // Add/edit item modal
  const [showItemForm, setShowItemForm] = useState(false)
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState({ name: '', metric: 'kg' as InventoryMetric, locationId: '', parLevel: '' })
  const [itemSubmitting, setItemSubmitting] = useState(false)
  const [itemError, setItemError] = useState<string | null>(null)

  // In/Out transaction modal
  const [showTxForm, setShowTxForm] = useState(false)
  const [txType, setTxType] = useState<'in' | 'out'>('in')
  const [txForm, setTxForm] = useState({ itemId: '', date: today(), description: '', quantity: '' })
  const [txSubmitting, setTxSubmitting] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true); const down = () => setIsOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      const [itemSnap, txSnap, locSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory_items'), where('active', '==', true))),
        getDocs(collection(db, 'inventory_transactions')),
        getDocs(collection(db, 'paddocks')),
      ])

      setLocations(locSnap.docs.map(d => ({ id: d.id, name: d.data().name as string })).sort((a, b) => a.name.localeCompare(b.name)))

      const txList: InventoryTransaction[] = txSnap.docs.map(d => ({
        id: d.id,
        itemId: d.data().itemId as string,
        date: d.data().date as string,
        description: (d.data().description ?? null) as string | null,
        quantityIn: (d.data().quantityIn ?? null) as number | null,
        quantityOut: (d.data().quantityOut ?? null) as number | null,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => b.date.localeCompare(a.date))

      const itemList: InventoryItem[] = itemSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name as string,
        metric: d.data().metric as InventoryMetric,
        locationId: (d.data().locationId ?? null) as string | null,
        parLevel: (d.data().parLevel ?? null) as number | null,
        active: true,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => a.name.localeCompare(b.name))

      setTransactions(txList)
      setItems(itemList)
    } catch (err) {
      console.error('Inventory load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Enrich items with computed balance
  const enrichedItems = useMemo(() =>
    items.map(item => {
      const balance = computeBalance(transactions, item.id)
      return {
        ...item,
        currentBalance: balance,
        needsReplenishment: item.parLevel != null && balance <= item.parLevel,
      }
    }),
    [items, transactions]
  )

  const itemTransactions = useMemo(() =>
    selectedItem ? transactions.filter(t => t.itemId === selectedItem.id) : [],
    [transactions, selectedItem]
  )

  // Running balance for selected item's transaction list
  const txWithBalance = useMemo(() => {
    const sorted = [...itemTransactions].sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    return sorted.map(t => {
      running += (t.quantityIn ?? 0) - (t.quantityOut ?? 0)
      return { ...t, balance: running }
    }).reverse()
  }, [itemTransactions])

  // ── Item form ──────────────────────────────────────────────────────────────

  function openAddItem() {
    setItemForm({ name: '', metric: 'kg', locationId: '', parLevel: '' })
    setEditItemId(null)
    setItemError(null)
    setShowItemForm(true)
  }

  function openEditItem(item: InventoryItem) {
    setItemForm({ name: item.name, metric: item.metric, locationId: item.locationId ?? '', parLevel: item.parLevel?.toString() ?? '' })
    setEditItemId(item.id)
    setItemError(null)
    setShowItemForm(true)
  }

  function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: itemForm.name,
      metric: itemForm.metric,
      locationId: itemForm.locationId || null,
      parLevel: itemForm.parLevel ? parseFloat(itemForm.parLevel) : null,
      active: true,
    }
    if (editItemId) {
      updateDoc(doc(db, 'inventory_items', editItemId), payload).catch(console.error)
    } else {
      addDoc(collection(db, 'inventory_items'), { ...payload, createdAt: Timestamp.now().toDate().toISOString() }).catch(console.error)
    }
    setShowItemForm(false)
    fetchAll(true)
  }

  function handleRemoveItem() {
    if (!editItemId) return
    updateDoc(doc(db, 'inventory_items', editItemId), { active: false }).catch(console.error)
    setShowItemForm(false)
    setSelectedItem(null)
    fetchAll(true)
  }

  // ── Transaction form ───────────────────────────────────────────────────────

  function openTx(type: 'in' | 'out', item?: InventoryItem) {
    setTxType(type)
    setTxForm({ itemId: item?.id ?? '', date: today(), description: '', quantity: '' })
    setTxError(null)
    setShowTxForm(true)
  }

  function handleTxSubmit(e: React.FormEvent) {
    e.preventDefault()
    const qty = parseFloat(txForm.quantity)
    if (isNaN(qty) || qty <= 0) return
    addDoc(collection(db, 'inventory_transactions'), {
      itemId: txForm.itemId,
      date: txForm.date,
      description: txForm.description || null,
      quantityIn: txType === 'in' ? qty : null,
      quantityOut: txType === 'out' ? qty : null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setShowTxForm(false)
    fetchAll(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const alerts = enrichedItems.filter(i => i.needsReplenishment).length

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">Inventory</h1>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Stock levels · In/Out log</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openTx('in')}
              className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-full font-medium cursor-pointer hover:bg-green-100 transition-colors">+ In</button>
            <button onClick={() => openTx('out')}
              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-medium cursor-pointer hover:bg-red-100 transition-colors">− Out</button>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">

        {alerts > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-amber-600 text-lg">⚠️</span>
            <p className="text-sm text-amber-800 font-medium">{alerts} item{alerts !== 1 ? 's' : ''} need restocking</p>
          </div>
        )}

        {/* Items grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-zinc-100" />)}
          </div>
        ) : enrichedItems.length === 0 ? (
          <p className="text-center text-zinc-400 text-sm py-16">No inventory items yet.</p>
        ) : (
          <div className="space-y-2">
            {enrichedItems.map(item => {
              const pct = item.parLevel && item.currentBalance != null
                ? Math.min(100, Math.max(0, (item.currentBalance / (item.parLevel * 2)) * 100))
                : null
              const urgent = item.needsReplenishment
              return (
                <button key={item.id} onClick={() => setSelectedItem(item)}
                  className={`w-full bg-white rounded-2xl border px-4 py-3.5 text-left shadow-sm hover:shadow-md hover:border-zinc-300 active:scale-[0.99] transition-all cursor-pointer ${
                    urgent ? 'border-amber-200' : 'border-zinc-100'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-zinc-900 text-sm">{item.name}</span>
                    <div className="flex items-center gap-2">
                      {urgent && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Low stock</span>}
                      <span className="text-sm font-bold text-zinc-900">{item.currentBalance?.toFixed(1) ?? '—'} <span className="text-xs font-normal text-zinc-400">{item.metric}</span></span>
                    </div>
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${urgent ? 'bg-amber-400' : 'bg-[#3B6D11]'}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {item.parLevel && (
                    <p className="text-[11px] text-zinc-400 mt-1">Par level: {item.parLevel} {item.metric}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={openAddItem}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ── Item detail modal ──────────────────────────────────────────────── */}
      <Modal open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem?.name ?? ''}>
        {selectedItem && (
          <div className="space-y-4">
            {/* Current balance */}
            <div className="bg-[#3B6D11]/5 rounded-2xl p-4 text-center">
              <p className="text-3xl font-bold text-[#3B6D11]">
                {enrichedItems.find(i => i.id === selectedItem.id)?.currentBalance?.toFixed(1) ?? '—'}
              </p>
              <p className="text-sm text-zinc-500">{selectedItem.metric} current balance</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setSelectedItem(null); openTx('in', selectedItem) }}
                className="flex-1 bg-green-50 text-green-700 text-sm font-medium py-2.5 rounded-full cursor-pointer hover:bg-green-100 transition-colors">+ Receive</button>
              <button onClick={() => { setSelectedItem(null); openTx('out', selectedItem) }}
                className="flex-1 bg-red-50 text-red-600 text-sm font-medium py-2.5 rounded-full cursor-pointer hover:bg-red-100 transition-colors">− Use</button>
              <button onClick={() => { setSelectedItem(null); openEditItem(selectedItem) }}
                className="px-4 border border-zinc-200 text-zinc-600 text-sm py-2.5 rounded-full cursor-pointer hover:bg-zinc-50 transition-colors">Edit</button>
            </div>

            {/* Transaction log */}
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Transaction log</p>
            {txWithBalance.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">No transactions yet.</p>
            ) : (
              <div className="space-y-1">
                {txWithBalance.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-zinc-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${t.quantityIn ? 'text-green-600' : 'text-red-600'}`}>
                          {t.quantityIn ? `+${t.quantityIn}` : `-${t.quantityOut}`} {selectedItem.metric}
                        </span>
                        {t.description && <span className="text-xs text-zinc-500">{t.description}</span>}
                      </div>
                      <p className="text-[11px] text-zinc-400">{t.date}</p>
                    </div>
                    <span className="text-sm font-medium text-zinc-700">{t.balance.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Add/Edit item modal ────────────────────────────────────────────── */}
      <Modal open={showItemForm} onClose={() => setShowItemForm(false)} title={editItemId ? 'Edit Item' : 'Add Inventory Item'}>
        <form onSubmit={handleItemSubmit} className="space-y-4">
          <Field label="Item name">
            <input required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
              placeholder="e.g. Diesel, Salt, Feed" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit">
              <select value={itemForm.metric} onChange={e => setItemForm({ ...itemForm, metric: e.target.value as InventoryMetric })} className={sel}>
                <option value="kg">kg</option>
                <option value="L">Litres (L)</option>
                <option value="units">Units</option>
              </select>
            </Field>
            <Field label="Par level (min stock)">
              <input type="number" value={itemForm.parLevel} onChange={e => setItemForm({ ...itemForm, parLevel: e.target.value })}
                placeholder="e.g. 50" className={input} />
            </Field>
          </div>
          <Field label="Location">
            <select value={itemForm.locationId} onChange={e => setItemForm({ ...itemForm, locationId: e.target.value })} className={sel}>
              <option value="">None</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          {itemError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{itemError}</p>}
          <button type="submit" disabled={itemSubmitting}
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {itemSubmitting ? 'Saving…' : editItemId ? 'Save Changes' : 'Add Item'}
          </button>
          {editItemId && (
            <button type="button" onClick={handleRemoveItem} disabled={itemSubmitting}
              className="w-full text-red-500 text-sm py-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer">Remove item</button>
          )}
        </form>
      </Modal>

      {/* ── Transaction modal ──────────────────────────────────────────────── */}
      <Modal open={showTxForm} onClose={() => setShowTxForm(false)} title={txType === 'in' ? 'Record Stock In' : 'Record Stock Out'}>
        <form onSubmit={handleTxSubmit} className="space-y-4">
          <Field label="Item">
            <select required value={txForm.itemId} onChange={e => setTxForm({ ...txForm, itemId: e.target.value })} className={sel}>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" required value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} className={input} />
            </Field>
            <Field label={`Quantity (${items.find(i => i.id === txForm.itemId)?.metric ?? '—'})`}>
              <input type="number" required step="0.01" min="0.01" value={txForm.quantity}
                onChange={e => setTxForm({ ...txForm, quantity: e.target.value })} placeholder="0" className={input} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })}
              placeholder="e.g. Monthly delivery" className={input} />
          </Field>
          {txError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{txError}</p>}
          <button type="submit" disabled={txSubmitting}
            className={`w-full text-white text-sm font-medium py-3 rounded-full transition-colors disabled:opacity-50 cursor-pointer ${
              txType === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
            }`}>
            {txSubmitting ? 'Saving…' : txType === 'in' ? 'Record Stock In' : 'Record Stock Out'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
