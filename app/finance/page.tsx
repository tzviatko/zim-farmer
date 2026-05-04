'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import { RevenueEntry, ExpenseEntry } from '../../lib/types'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const PIE_COLORS = ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b']

function MinimalTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-xs text-zinc-700 shadow-sm">
      {payload[0].name}: ${payload[0].value.toLocaleString()}
    </div>
  )
}

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
  const [isOnline, setIsOnline] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  const [addOpen, setAddOpen] = useState<'revenue' | 'expense' | null>(null)
  const [expCatFilter, setExpCatFilter] = useState<string | null>(null)
  const [isPointerDevice, setIsPointerDevice] = useState(false)

  useEffect(() => {
    setIsPointerDevice(window.matchMedia('(hover: hover)').matches)
  }, [])
  const [monthFilter, setMonthFilter] = useState<string>(() => new Date().toISOString().slice(0, 7))
  function shiftMonth(delta: number) {
    const [y, m] = monthFilter.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = new Date(monthFilter + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  async function load() {
    setLoading(true)
    try {
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
    } catch (err) {
      console.error('Finance load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Finance</h1>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Revenue & expenses</p>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Month selector */}
        <div className="flex items-center justify-between bg-white border border-zinc-200 rounded-xl px-2 py-2">
          <button onClick={() => shiftMonth(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 active:bg-zinc-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-semibold text-zinc-900">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 active:bg-zinc-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* P&L cards — border style */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-green-200 p-3 text-center">
            <p className="text-base font-bold text-green-700">${totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-0.5">Revenue</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-3 text-center">
            <p className="text-base font-bold text-red-600">${totalExpenses.toLocaleString()}</p>
            <p className="text-xs text-red-500 mt-0.5">Expenses</p>
          </div>
          <div className={`bg-white rounded-xl border p-3 text-center ${netProfit >= 0 ? 'border-[#3B6D11]' : 'border-amber-300'}`}>
            <p className={`text-base font-bold ${netProfit >= 0 ? 'text-[#3B6D11]' : 'text-amber-700'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
            </p>
            <p className={`text-xs mt-0.5 ${netProfit >= 0 ? 'text-[#3B6D11]' : 'text-amber-600'}`}>Net profit</p>
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
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Expense breakdown</p>
                <div className="flex items-center gap-3">
                  <div style={{ height: 120, width: 120, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sortedExpCats.map(([name, value]) => ({ name, value }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={55}
                          cursor="pointer"
                          isAnimationActive={false}
                          onClick={(entry) => {
                            const name = entry.name as string | undefined
                            if (!name) return
                            setExpCatFilter(prev => prev === name ? null : name)
                          }}
                        >
                          {sortedExpCats.map(([cat], i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                              opacity={expCatFilter && expCatFilter !== cat ? 0.3 : 1}
                              stroke={expCatFilter === cat ? '#111' : 'none'}
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        {isPointerDevice && <Tooltip content={<MinimalTooltip />} />}
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {sortedExpCats.map(([cat, amt], i) => (
                      <button
                        key={cat}
                        onClick={() => setExpCatFilter(prev => prev === cat ? null : cat)}
                        className={`flex items-center gap-2 w-full text-left transition-opacity cursor-pointer ${
                          expCatFilter && expCatFilter !== cat ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-[10px] text-zinc-600 truncate flex-1">{cat}</span>
                        <span className="text-[10px] font-medium text-zinc-900">${amt.toLocaleString()}</span>
                      </button>
                    ))}
                    {expCatFilter && (
                      <button onClick={() => setExpCatFilter(null)}
                        className="text-[10px] text-zinc-400 underline cursor-pointer mt-1">
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recent entries */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Recent transactions</p>
              {filtered
                .filter(e => !expCatFilter || (e.type === 'expense' && e.category === expCatFilter))
                .slice(0, 10)
                .map(e => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              {filtered.length === 0 && <p className="text-sm text-zinc-400 text-center py-2">None this period.</p>}
            </div>
          </div>
        )}

        {/* Revenue tab */}
        {tab === 'revenue' && (
          <div className="space-y-2">
            {filtered.filter(e => e.type === 'revenue').length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No revenue entries this period.</p>
            )}
            {filtered.filter(e => e.type === 'revenue').map(e => <EntryRow key={e.id} entry={e} />)}
          </div>
        )}

        {/* Expenses tab */}
        {tab === 'expenses' && (
          <div className="space-y-2">
            {filtered.filter(e => e.type === 'expense').length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No expense entries this period.</p>
            )}
            {filtered.filter(e => e.type === 'expense').map(e => <EntryRow key={e.id} entry={e} />)}
          </div>
        )}
      </div>

      {/* Context-aware FAB */}
      {(tab === 'revenue' || tab === 'expenses') && (
        <button onClick={() => setAddOpen(tab === 'revenue' ? 'revenue' : 'expense')}
          className={`fixed bottom-[106px] right-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white z-30 active:scale-95 transition-all cursor-pointer ${tab === 'revenue' ? 'bg-green-700 hover:bg-green-800' : 'bg-red-700 hover:bg-red-800'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

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
  function save() {
    if (!description.trim() || !amount) return
    const coll = type === 'revenue' ? 'revenue_entries' : 'expense_entries'
    addDoc(collection(db, coll), {
      description: description.trim(),
      category: category || null,
      amount: Number(amount),
      date,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setDescription('')
    setCategory('')
    setAmount('')
    setDate(today)
    onSaved()
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
        <button onClick={save} disabled={!description.trim() || !amount}
          className={`w-full text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 ${type === 'revenue' ? 'bg-green-700' : 'bg-red-700'}`}>
          {`Add ${type === 'revenue' ? 'Revenue' : 'Expense'}`}
        </button>
      </div>
    </Modal>
  )
}
