'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import { RevenueEntry, ExpenseEntry } from '../../lib/types'

type Tab = 'summary' | 'revenue' | 'expenses'

const REVENUE_CATEGORIES = [
  'Cattle sale', 'Milk sales', 'Crop sale', 'Other income',
]

const EXPENSE_CATEGORIES = [
  'Feed & supplements', 'Veterinary', 'Labour', 'Fuel & lubricants',
  'Repairs & maintenance', 'Equipment purchase', 'Seeds & fertiliser',
  'Dipping chemicals', 'Safety equipment', 'Administration', 'Other',
]

interface Entry {
  id: string
  type: 'revenue' | 'expense'
  description: string
  category: string | null
  amount: number
  date: string
}

export default function FinancePage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  const [addOpen, setAddOpen] = useState<'revenue' | 'expense' | null>(null)
  const [monthFilter, setMonthFilter] = useState<string>(() => new Date().toISOString().slice(0, 7))

  async function load() {
    const [revSnap, expSnap] = await Promise.all([
      getDocs(collection(db, 'revenue_entries')),
      getDocs(collection(db, 'expense_entries')),
    ])
    const revs: Entry[] = revSnap.docs.map(d => ({
      id: d.id, type: 'revenue' as const,
      ...(d.data() as { description: string; category: string | null; amount: number; date: string }),
    }))
    const exps: Entry[] = expSnap.docs.map(d => ({
      id: d.id, type: 'expense' as const,
      ...(d.data() as { description: string; category: string | null; amount: number; date: string }),
    }))
    setEntries([...revs, ...exps].sort((a, b) => b.date.localeCompare(a.date)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = entries.filter(e => e.date.startsWith(monthFilter))
  const totalRevenue = filtered.filter(e => e.type === 'revenue').reduce((s, e) => s + e.amount, 0)
  const totalExpenses = filtered.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const netProfit = totalRevenue - totalExpenses

  // Category breakdown for the month
  const expByCategory = new Map<string, number>()
  filtered.filter(e => e.type === 'expense').forEach(e => {
    const cat = e.category ?? 'Other'
    expByCategory.set(cat, (expByCategory.get(cat) ?? 0) + e.amount)
  })
  const sortedExpCats = [...expByCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Finance</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Revenue & expenses</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-white" />
        </div>

        {/* P&L cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
            <p className="text-base font-bold text-green-800">${totalRevenue.toLocaleString()}</p>
            <p className="text-[10px] text-green-600 mt-0.5">Revenue</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
            <p className="text-base font-bold text-red-800">${totalExpenses.toLocaleString()}</p>
            <p className="text-[10px] text-red-600 mt-0.5">Expenses</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${netProfit >= 0 ? 'bg-[#3B6D11]/5 border-[#3B6D11]/20' : 'bg-amber-50 border-amber-100'}`}>
            <p className={`text-base font-bold ${netProfit >= 0 ? 'text-[#3B6D11]' : 'text-amber-700'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
            </p>
            <p className={`text-[10px] mt-0.5 ${netProfit >= 0 ? 'text-[#3B6D11]' : 'text-amber-600'}`}>Net profit</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-zinc-100 p-1">
          {([['summary', 'Summary'], ['revenue', 'Revenue'], ['expenses', 'Expenses']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-[#3B6D11] text-white' : 'text-zinc-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Summary tab */}
        {tab === 'summary' && (
          <div className="space-y-3">
            {sortedExpCats.length === 0 && !loading && (
              <p className="text-center text-sm text-zinc-400 py-8">No entries for this period.</p>
            )}
            {sortedExpCats.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Expense breakdown</p>
                <div className="space-y-2">
                  {sortedExpCats.map(([cat, amt]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-zinc-700">{cat}</span>
                        <span className="font-medium text-zinc-900">${amt.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full transition-all"
                          style={{ width: `${totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent entries */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Recent transactions</p>
              {filtered.slice(0, 10).map(e => (
                <EntryRow key={e.id} entry={e} />
              ))}
              {filtered.length === 0 && <p className="text-sm text-zinc-400 text-center py-2">None this period.</p>}
            </div>
          </div>
        )}

        {/* Revenue tab */}
        {tab === 'revenue' && (
          <div className="space-y-2">
            <button onClick={() => setAddOpen('revenue')}
              className="w-full bg-green-700 text-white rounded-xl py-3 text-sm font-semibold">
              + Add Revenue
            </button>
            {filtered.filter(e => e.type === 'revenue').length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No revenue entries this period.</p>
            )}
            {filtered.filter(e => e.type === 'revenue').map(e => <EntryRow key={e.id} entry={e} />)}
          </div>
        )}

        {/* Expenses tab */}
        {tab === 'expenses' && (
          <div className="space-y-2">
            <button onClick={() => setAddOpen('expense')}
              className="w-full bg-red-700 text-white rounded-xl py-3 text-sm font-semibold">
              + Add Expense
            </button>
            {filtered.filter(e => e.type === 'expense').length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No expense entries this period.</p>
            )}
            {filtered.filter(e => e.type === 'expense').map(e => <EntryRow key={e.id} entry={e} />)}
          </div>
        )}
      </div>

      {/* Add modals */}
      <AddEntryModal
        open={addOpen === 'revenue'}
        type="revenue"
        categories={REVENUE_CATEGORIES}
        onClose={() => setAddOpen(null)}
        onSaved={() => { setAddOpen(null); load() }}
      />
      <AddEntryModal
        open={addOpen === 'expense'}
        type="expense"
        categories={EXPENSE_CATEGORIES}
        onClose={() => setAddOpen(null)}
        onSaved={() => { setAddOpen(null); load() }}
      />
    </div>
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-50 last:border-0">
      <div>
        <p className="text-sm text-zinc-900">{entry.description}</p>
        <p className="text-xs text-zinc-400">{entry.date}{entry.category ? ` · ${entry.category}` : ''}</p>
      </div>
      <p className={`text-sm font-bold ${entry.type === 'revenue' ? 'text-green-700' : 'text-red-600'}`}>
        {entry.type === 'revenue' ? '+' : '−'}${entry.amount.toLocaleString()}
      </p>
    </div>
  )
}

function AddEntryModal({ open, type, categories, onClose, onSaved }: {
  open: boolean; type: 'revenue' | 'expense'; categories: string[]
  onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!description.trim() || !amount) return
    setSaving(true)
    try {
      const coll = type === 'revenue' ? 'revenue_entries' : 'expense_entries'
      await addDoc(collection(db, coll), {
        description: description.trim(),
        category: category || null,
        amount: Number(amount),
        date,
        createdAt: Timestamp.now().toDate().toISOString(),
      })
      setDescription('')
      setCategory('')
      setAmount('')
      setDate(today)
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={type === 'revenue' ? 'Add Revenue' : 'Add Expense'}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Description *</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="">Select category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Amount ($) *</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
        </div>
        <button onClick={save} disabled={saving || !description.trim() || !amount}
          className={`w-full text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 ${type === 'revenue' ? 'bg-green-700' : 'bg-red-700'}`}>
          {saving ? 'Saving…' : `Add ${type === 'revenue' ? 'Revenue' : 'Expense'}`}
        </button>
      </div>
    </Modal>
  )
}
