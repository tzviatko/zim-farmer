'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { seedTestData } from '../lib/seed'

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
  paddock_id: string | null
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

function formatTag(tag: string): string {
  const digits = tag.replace(/\D/g, '')
  return (digits || '0').padStart(4, '0').slice(-4)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [cattle, setCattle] = useState<CattleRow[]>([])
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [breedFilter, setBreedFilter] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll(quiet = false) {
    quiet ? setSyncing(true) : setLoading(true)

    try {
      const [cattleSnap, paddocksSnap] = await Promise.all([
        getDocs(query(collection(db, 'cattle'), where('active', '==', true))),
        getDocs(collection(db, 'paddocks')),
      ])

      const paddocksList = paddocksSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Paddock))
        .sort((a, b) => a.name.localeCompare(b.name))

      const cattleList = await Promise.all(
        cattleSnap.docs.map(async (cattleDoc) => {
          const dippingSnap = await getDocs(
            collection(db, 'cattle', cattleDoc.id, 'dipping_records')
          )
          const dipping_records: DippingRecord[] = dippingSnap.docs.map(d => ({
            dipping_sessions: { session_date: d.data().session_date as string },
          }))
          const data = cattleDoc.data()
          const paddock = paddocksList.find(p => p.id === data.paddock_id) ?? null
          return {
            id: cattleDoc.id,
            tag: data.tag as string,
            sex: data.sex as CattleRow['sex'],
            breed: (data.breed as string) ?? null,
            dob: (data.dob as string) ?? null,
            notes: (data.notes as string) ?? null,
            active: data.active as boolean,
            paddock_id: (data.paddock_id as string) ?? null,
            created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            paddocks: paddock ? { name: paddock.name } : null,
            dipping_records,
          } as CattleRow
        })
      )

      // Sort by created_at descending client-side
      cattleList.sort((a, b) => b.created_at.localeCompare(a.created_at))

      setPaddocks(paddocksList)
      setCattle(cattleList)
    } catch (err) {
      console.error('fetchAll failed:', err)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const stats = useMemo(() => ({
    total: cattle.length,
    cows: cattle.filter(c => c.sex === 'cow').length,
    bulls: cattle.filter(c => c.sex === 'bull').length,
    heifers: cattle.filter(c => c.sex === 'heifer').length,
    steers: cattle.filter(c => c.sex === 'steer').length,
    young: cattle.filter(c => c.sex === 'heifer' || c.sex === 'steer').length,
  }), [cattle])

  const breedStats = useMemo(() => {
    const map = new Map<string, number>()
    cattle.forEach(c => {
      const breed = c.breed || 'Unknown'
      map.set(breed, (map.get(breed) || 0) + 1)
    })
    return Array.from(map.entries())
      .map(([breed, count]) => ({ breed, count }))
      .sort((a, b) => b.count - a.count)
  }, [cattle])

  const filtered = useMemo(() =>
    cattle
      .filter(c => filter === 'all' || c.sex === filter)
      .filter(c => !breedFilter || c.breed === breedFilter)
      .filter(c => {
        if (!search) return true
        const q = search.toLowerCase()
        return c.tag.toLowerCase().includes(q) || (c.breed?.toLowerCase().includes(q) ?? false)
      }),
    [cattle, filter, breedFilter, search]
  )

  const displayStats = useMemo(() => ({
    total: filtered.length,
    cows: filtered.filter(c => c.sex === 'cow').length,
    bulls: filtered.filter(c => c.sex === 'bull').length,
    young: filtered.filter(c => c.sex === 'heifer' || c.sex === 'steer').length,
  }), [filtered])

  function openAdd() {
    setForm(emptyForm)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(animal: CattleRow) {
    setForm({
      tag: formatTag(animal.tag),
      sex: animal.sex,
      breed: animal.breed ?? '',
      paddock_id: animal.paddock_id ?? '',
      dob: animal.dob ?? '',
      notes: animal.notes ?? '',
    })
    setEditingId(animal.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    const payload = {
      tag: form.tag,
      sex: form.sex,
      breed: form.breed || null,
      paddock_id: form.paddock_id || null,
      dob: form.dob || null,
      notes: form.notes || null,
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'cattle', editingId), payload)
      } else {
        await addDoc(collection(db, 'cattle'), {
          ...payload,
          active: true,
          created_at: serverTimestamp(),
        })
      }
      closeForm()
      fetchAll(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'unavailable') {
        setFormError('Device is offline and local storage is unavailable. Please reload the app while connected, then try again.')
      } else {
        setFormError(err instanceof Error ? err.message : 'An error occurred')
      }
    }
    setSubmitting(false)
  }

  async function handleDelete() {
    if (!editingId) return
    setDeleting(true)
    try {
      await updateDoc(doc(db, 'cattle', editingId), { active: false })
      closeForm()
      fetchAll(true)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'unavailable') {
        setFormError('Device is offline and local storage is unavailable. Please reload the app while connected, then try again.')
      } else {
        setFormError(err instanceof Error ? err.message : 'An error occurred')
      }
    }
    setDeleting(false)
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

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <p className="text-xs text-amber-700 text-center">
            You&apos;re offline — changes are saved locally and will sync when you reconnect.
          </p>
        </div>
      )}

      <div className="max-w-lg mx-auto pb-[220px]">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {([
            { label: 'Total', value: displayStats.total },
            { label: 'Cows', value: displayStats.cows },
            { label: 'Bulls', value: displayStats.bulls },
            { label: 'Young Stock', value: displayStats.young },
          ] as const).map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm">
              <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">{s.label}</p>
              <p className="text-3xl font-bold text-zinc-900">
                {loading ? <span className="text-zinc-200">—</span> : s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Herd breakdown chart ── */}
        {!loading && (
          <DonutChart
            cows={stats.cows}
            bulls={stats.bulls}
            heifers={stats.heifers}
            steers={stats.steers}
            activeTypeFilter={filter}
            onTypeFilterChange={(f) => { setFilter(f); setBreedFilter(null) }}
            breedData={breedStats}
            activeBreedFilter={breedFilter}
            onBreedFilterChange={(b) => { setBreedFilter(b); setFilter('all') }}
          />
        )}

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
            <div className="text-center py-16 text-zinc-400 text-sm space-y-3">
              <p>{cattle.length === 0 ? 'No cattle recorded yet.' : 'No results match your filter.'}</p>
              {cattle.length === 0 && (
                <button
                  onClick={() => seedTestData().then(() => fetchAll())}
                  className="text-xs text-[#3B6D11] underline underline-offset-2"
                >
                  Load sample data
                </button>
              )}
            </div>
          ) : (
            filtered.map(animal => {
              const status = getDipStatus(animal.dipping_records)
              const meta = [animal.breed, animal.paddocks?.name, animal.sex]
                .filter(Boolean)
                .join(' · ')
              return (
                <button
                  key={animal.id}
                  onClick={() => openEdit(animal)}
                  className="w-full bg-white rounded-2xl border border-zinc-100 px-4 py-3.5 flex items-center justify-between shadow-sm hover:border-zinc-300 hover:shadow-md active:scale-[0.99] transition-all text-left cursor-pointer"
                >
                  <div className="min-w-0 mr-3">
                    <span className="block text-base font-medium text-zinc-900 font-[family-name:var(--font-dm-mono)] leading-tight">
                      {formatTag(animal.tag)}
                    </span>
                    <p className="text-xs text-zinc-400 mt-0.5 capitalize truncate">{meta}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DIP_CLASS[status]}`}>
                      {DIP_LABEL[status]}
                    </span>
                    <ChevronIcon />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Floating add button ── */}
      <button
        onClick={openAdd}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer"
        aria-label="Add cattle"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 h-[86px] flex">
        {([
          { label: 'Cattle', active: true, icon: <TagNavIcon /> },
          { label: 'Paddocks', active: false, icon: <GridNavIcon /> },
          { label: 'Dipping', active: false, icon: <DropNavIcon /> },
          { label: 'Reports', active: false, icon: <ChartNavIcon /> },
        ] as const).map(item => (
          <button
            key={item.label}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide transition-colors py-[19px] ${
              item.active ? 'text-[#3B6D11]' : 'text-zinc-400'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && closeForm()}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-zinc-900">
                {editingId ? 'Edit Cattle' : 'Add Cattle'}
              </h2>
              <button
                onClick={closeForm}
                className="text-zinc-400 hover:text-zinc-700 text-xl leading-none cursor-pointer w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

              <div>
                <label className="block text-xs font-medium text-zinc-800 mb-1.5">Tag Number</label>
                <input
                  required
                  value={form.tag}
                  onChange={e => setForm({ ...form, tag: e.target.value })}
                  placeholder="e.g. 0042"
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 font-[family-name:var(--font-dm-mono)] focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-800 mb-1.5">Sex</label>
                  <select
                    value={form.sex}
                    onChange={e => setForm({ ...form, sex: e.target.value })}
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white"
                  >
                    <option value="cow">Cow</option>
                    <option value="bull">Bull</option>
                    <option value="heifer">Heifer</option>
                    <option value="steer">Steer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-800 mb-1.5">Paddock</label>
                  <select
                    value={form.paddock_id}
                    onChange={e => setForm({ ...form, paddock_id: e.target.value })}
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white"
                  >
                    <option value="">None</option>
                    {paddocks.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-800 mb-1.5">Breed</label>
                <input
                  value={form.breed}
                  onChange={e => setForm({ ...form, breed: e.target.value })}
                  placeholder="e.g. Angus, Hereford"
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-800 mb-1.5">Date of Birth</label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={e => setForm({ ...form, dob: e.target.value })}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-800 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes…"
                  rows={2}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 resize-none"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || deleting}
                className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Save Animal'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting || deleting}
                  className="w-full text-red-500 text-sm py-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {deleting ? 'Removing…' : 'Remove from registry'}
                </button>
              )}

            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Donut chart ──────────────────────────────────────────────────────────────

const SEG_COLORS = {
  cow: '#3B6D11',
  bull: '#1C3B08',
  heifer: '#7BAD3E',
  steer: '#C5E09E',
}

const BREED_PALETTE = [
  '#3B6D11', '#1C3B08', '#7BAD3E', '#C5E09E',
  '#5B8C2A', '#A8D46F', '#2A5C0A', '#91C462',
  '#4A7C1E', '#D4EBB0',
]

function DonutChart({
  cows, bulls, heifers, steers,
  activeTypeFilter, onTypeFilterChange,
  breedData, activeBreedFilter, onBreedFilterChange,
}: {
  cows: number; bulls: number; heifers: number; steers: number
  activeTypeFilter: Filter
  onTypeFilterChange: (f: Filter) => void
  breedData: { breed: string; count: number }[]
  activeBreedFilter: string | null
  onBreedFilterChange: (breed: string | null) => void
}) {
  const [tab, setTab] = useState<'type' | 'breed'>('type')

  function switchTab(t: 'type' | 'breed') {
    setTab(t)
    if (t === 'breed') onTypeFilterChange('all')
    if (t === 'type') onBreedFilterChange(null)
  }

  const typeSegments = [
    { key: 'cow' as Filter,    label: 'Cows',    value: cows,    color: SEG_COLORS.cow },
    { key: 'bull' as Filter,   label: 'Bulls',   value: bulls,   color: SEG_COLORS.bull },
    { key: 'heifer' as Filter, label: 'Heifers', value: heifers, color: SEG_COLORS.heifer },
    { key: 'steer' as Filter,  label: 'Steers',  value: steers,  color: SEG_COLORS.steer },
  ]

  const breedSegments = breedData.map((b, i) => ({
    key: b.breed,
    label: b.breed,
    value: b.count,
    color: BREED_PALETTE[i % BREED_PALETTE.length],
  }))

  const segments = tab === 'type' ? typeSegments : breedSegments
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const activeKey = tab === 'type'
    ? (activeTypeFilter === 'all' ? null : activeTypeFilter as string)
    : activeBreedFilter

  function handleSegmentClick(key: string) {
    if (tab === 'type') {
      onTypeFilterChange(activeTypeFilter === key ? 'all' : key as Filter)
    } else {
      onBreedFilterChange(activeBreedFilter === key ? null : key)
    }
  }

  const SIZE = 160
  const cx = SIZE / 2
  const cy = SIZE / 2
  const R = 68
  const r = 46

  function arc(startAngle: number, endAngle: number): string {
    const cos = Math.cos, sin = Math.sin
    const x1  = cx + R * cos(startAngle), y1  = cy + R * sin(startAngle)
    const x2  = cx + R * cos(endAngle),   y2  = cy + R * sin(endAngle)
    const ix1 = cx + r * cos(startAngle), iy1 = cy + r * sin(startAngle)
    const ix2 = cx + r * cos(endAngle),   iy2 = cy + r * sin(endAngle)
    const large = endAngle - startAngle > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`
  }

  const active = segments.filter(s => s.value > 0)
  const GAP = active.length > 1 ? 0.04 : 0
  let cursor = -Math.PI / 2
  const arcs = active.map(s => {
    const span = (s.value / total) * 2 * Math.PI
    const start = cursor + GAP / 2
    const end   = cursor + span - GAP / 2
    cursor += span
    return { ...s, start, end, span }
  })

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm mx-4 mt-3 p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-400 uppercase tracking-widest">Herd Breakdown</p>
        <div className="flex bg-zinc-100 rounded-full p-0.5">
          {(['type', 'breed'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-3 py-1 rounded-full text-[11px] transition-colors cursor-pointer ${
                tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {t === 'type' ? 'By Type' : 'By Breed'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">

        {/* SVG donut */}
        <div className="relative shrink-0">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none"
                stroke="#f4f4f5" strokeWidth={R - r} />
            ) : arcs.map(s =>
              s.span >= 2 * Math.PI - 0.001 ? (
                <circle
                  key={s.key} cx={cx} cy={cy} r={(R + r) / 2} fill="none"
                  stroke={s.color} strokeWidth={R - r}
                  className="cursor-pointer transition-opacity"
                  style={{ opacity: !activeKey || activeKey === s.key ? 1 : 0.3 }}
                  onClick={() => handleSegmentClick(s.key)}
                />
              ) : (
                <path
                  key={s.key} d={arc(s.start, s.end)} fill={s.color}
                  className="cursor-pointer transition-opacity"
                  style={{ opacity: !activeKey || activeKey === s.key ? 1 : 0.3 }}
                  onClick={() => handleSegmentClick(s.key)}
                />
              )
            )}
            <circle cx={cx} cy={cy} r={r - 1} fill="white" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-zinc-900 leading-none">{total}</span>
            <span className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wider">total</span>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1 max-h-[140px] overflow-y-auto">
          {segments.map(s => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
            const dimmed = !!activeKey && activeKey !== s.key
            return (
              <div
                key={s.key}
                className="flex items-start gap-2 cursor-pointer transition-opacity"
                style={{ opacity: dimmed ? 0.35 : 1 }}
                onClick={() => handleSegmentClick(s.key)}
              >
                <span className="mt-[3px] w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }} />
                <div>
                  <p className="text-xs text-zinc-400 leading-none truncate max-w-[64px]">{s.label}</p>
                  <p className="text-sm font-bold text-zinc-900 mt-0.5 leading-none">
                    {s.value}
                    <span className="text-xs font-normal text-zinc-400 ml-1">{pct}%</span>
                  </p>
                </div>
              </div>
            )
          })}
        </div>

      </div>
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

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
      <polyline points="9 18 15 12 9 6" />
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
