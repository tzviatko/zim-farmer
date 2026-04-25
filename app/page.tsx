'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────

type Paddock = { id: string; name: string }

type DippingRecord = {
  dipping_sessions: { session_date: string } | null
}

type CattleRow = {
  id: string
  tag: string
  sex: 'cow' | 'bull' | 'heifer' | 'steer'
  breed: string | null
  dob: string | null
  notes: string | null
  active: boolean
  created_at: string
  paddocks: { name: string } | null
  dipping_records: DippingRecord[]
}

type FormData = {
  tag: string
  sex: string
  breed: string
  paddock_id: string
  dob: string
  notes: string
}

type Filter = 'all' | 'cow' | 'bull' | 'heifer' | 'steer'
type DipStatus = 'ok' | 'due' | 'overdue'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDipStatus(records: DippingRecord[]): DipStatus {
  const dates = records
    .map(r => r.dipping_sessions?.session_date)
    .filter(Boolean) as string[]
  if (!dates.length) return 'overdue'
  const lastMs = Math.max(...dates.map(d => new Date(d).getTime()))
  const days = Math.floor((Date.now() - lastMs) / 86_400_000)
  if (days <= 14) return 'ok'
  if (days <= 21) return 'due'
  return 'overdue'
}

const DIP_LABEL: Record<DipStatus, string> = { ok: 'Dipped', due: 'Due', overdue: 'Overdue' }
const DIP_CLASS: Record<DipStatus, string> = {
  ok: 'bg-green-50 text-green-700',
  due: 'bg-orange-50 text-orange-600',
  overdue: 'bg-red-50 text-red-600',
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cow', label: 'Cows' },
  { key: 'bull', label: 'Bulls' },
  { key: 'heifer', label: 'Heifers' },
  { key: 'steer', label: 'Steers' },
]

const emptyForm: FormData = { tag: '', sex: 'cow', breed: '', paddock_id: '', dob: '', notes: '' }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [cattle, setCattle] = useState<CattleRow[]>([])
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)

  async function fetchAll(quiet = false) {
    quiet ? setSyncing(true) : setLoading(true)

    const [{ data: cattleData }, { data: paddockData }] = await Promise.all([
      supabase
        .from('cattle')
        .select(`
          id, tag, sex, breed, dob, notes, active, created_at,
          paddocks!paddock_id ( name ),
          dipping_records ( dipping_sessions ( session_date ) )
        `)
        .eq('active', true)
        .order('created_at', { ascending: false }),
      supabase.from('paddocks').select('id, name').order('name'),
    ])

    if (cattleData) setCattle(cattleData as unknown as CattleRow[])
    if (paddockData) setPaddocks(paddockData)
    setLoading(false)
    setSyncing(false)
  }

  useEffect(() => { fetchAll() }, [])

  const stats = useMemo(() => ({
    total: cattle.length,
    cows: cattle.filter(c => c.sex === 'cow').length,
    bulls: cattle.filter(c => c.sex === 'bull').length,
    young: cattle.filter(c => c.sex === 'heifer' || c.sex === 'steer').length,
  }), [cattle])

  const filtered = useMemo(() =>
    cattle
      .filter(c => filter === 'all' || c.sex === filter)
      .filter(c => {
        if (!search) return true
        const q = search.toLowerCase()
        return c.tag.toLowerCase().includes(q) || (c.breed?.toLowerCase().includes(q) ?? false)
      }),
    [cattle, filter, search]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.from('cattle').insert([{
      tag: form.tag,
      sex: form.sex,
      breed: form.breed || null,
      paddock_id: form.paddock_id || null,
      dob: form.dob || null,
      notes: form.notes || null,
    }])
    if (!error) {
      setShowForm(false)
      setForm(emptyForm)
      fetchAll(true)
    }
    setSubmitting(false)
  }

  function closeForm() {
    setShowForm(false)
    setForm(emptyForm)
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)]">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            ZIM FARMER
            <span className="inline-block w-2 h-2 rounded-full bg-[#3B6D11] ml-1.5 mb-0.5 align-middle" />
          </h1>
          <button
            onClick={() => fetchAll(true)}
            className="text-zinc-400 hover:text-zinc-600 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
            aria-label="Sync data"
          >
            <SyncIcon spinning={syncing} />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto pb-36">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {([
            { label: 'Total', value: stats.total },
            { label: 'Cows', value: stats.cows },
            { label: 'Bulls', value: stats.bulls },
            { label: 'Young Stock', value: stats.young },
          ] as const).map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm">
              <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-3xl font-bold text-zinc-900">
                {loading ? <span className="text-zinc-200">—</span> : s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="px-4 mt-4 relative">
          <div className="absolute left-7 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            <SearchIcon />
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by tag or breed…"
            className="w-full bg-white border border-zinc-100 rounded-2xl pl-10 pr-4 py-3 text-sm text-zinc-700 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
          />
        </div>

        {/* ── Filter chips ── */}
        <div className="flex gap-2 px-4 mt-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors cursor-pointer border ${
                filter === f.key
                  ? 'bg-[#3B6D11] text-white border-[#3B6D11]'
                  : 'bg-white text-zinc-500 border-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Cattle list ── */}
        <div className="px-4 mt-4 space-y-2">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-[62px] bg-white rounded-2xl animate-pulse border border-zinc-100" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-400 text-sm">
              {cattle.length === 0 ? 'No cattle recorded yet.' : 'No results match your filter.'}
            </div>
          ) : (
            filtered.map(animal => {
              const status = getDipStatus(animal.dipping_records)
              const meta = [animal.breed, animal.paddocks?.name, animal.sex]
                .filter(Boolean)
                .join(' · ')
              return (
                <div
                  key={animal.id}
                  className="bg-white rounded-2xl border border-zinc-100 px-4 py-3.5 flex items-center justify-between shadow-sm"
                >
                  <div className="min-w-0 mr-3">
                    <span className="block text-base font-medium text-zinc-900 font-[family-name:var(--font-dm-mono)] leading-tight">
                      {animal.tag}
                    </span>
                    <p className="text-xs text-zinc-400 mt-0.5 capitalize truncate">{meta}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${DIP_CLASS[status]}`}>
                    {DIP_LABEL[status]}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Floating add button ── */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-[76px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer"
        aria-label="Add cattle"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 h-[60px] flex">
        {([
          { label: 'Cattle', active: true, icon: <TagNavIcon /> },
          { label: 'Paddocks', active: false, icon: <GridNavIcon /> },
          { label: 'Dipping', active: false, icon: <DropNavIcon /> },
          { label: 'Reports', active: false, icon: <ChartNavIcon /> },
        ] as const).map(item => (
          <button
            key={item.label}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide transition-colors ${
              item.active ? 'text-[#3B6D11]' : 'text-zinc-400'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Add Cattle modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && closeForm()}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-zinc-900">Add Cattle</h2>
              <button
                onClick={closeForm}
                className="text-zinc-400 hover:text-zinc-700 text-xl leading-none cursor-pointer w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Tag Number</label>
                <input
                  required
                  value={form.tag}
                  onChange={e => setForm({ ...form, tag: e.target.value })}
                  placeholder="e.g. ZF-001"
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm font-[family-name:var(--font-dm-mono)] focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">Sex</label>
                  <select
                    value={form.sex}
                    onChange={e => setForm({ ...form, sex: e.target.value })}
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white"
                  >
                    <option value="cow">Cow</option>
                    <option value="bull">Bull</option>
                    <option value="heifer">Heifer</option>
                    <option value="steer">Steer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">Paddock</label>
                  <select
                    value={form.paddock_id}
                    onChange={e => setForm({ ...form, paddock_id: e.target.value })}
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white"
                  >
                    <option value="">None</option>
                    {paddocks.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Breed</label>
                <input
                  value={form.breed}
                  onChange={e => setForm({ ...form, breed: e.target.value })}
                  placeholder="e.g. Angus, Hereford"
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Date of Birth</label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={e => setForm({ ...form, dob: e.target.value })}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes…"
                  rows={2}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving…' : 'Save Animal'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? 'animate-spin' : ''}
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function TagNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function GridNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function DropNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  )
}

function ChartNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
