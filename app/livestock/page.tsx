'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, doc, query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import {
  Animal, AnimalGender, AnimalStatus, AnimalOwner, AnimalGroup,
  DipRecord, VaccinationRecord, WeightRecord, StatusChange,
  computeAnimalType, getDipStatus, DipStatus,
} from '../../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Paddock = { id: string; name: string }
type EnrichedAnimal = Animal & {
  type: string
  ageYears: number | null
  lastDipDate: string | null
  dipStatus: DipStatus
  lastWeightKg: number | null
  hasOffspring: boolean
  // sub-records loaded lazily when opening detail
  dips?: DipRecord[]
  vaccinations?: VaccinationRecord[]
  weights?: WeightRecord[]
  statusChanges?: StatusChange[]
}

type Tab = 'all' | 'active' | 'in_calf' | 'bull' | 'cow' | 'young'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'active',  label: 'Active' },
  { key: 'in_calf', label: 'In Calf' },
  { key: 'bull',    label: 'Bulls' },
  { key: 'cow',     label: 'Cows' },
  { key: 'young',   label: 'Young' },
]

const STATUS_OPTS: AnimalStatus[] = ['active', 'sold', 'lost', 'in_calf', 'deceased']
const OWNER_OPTS: AnimalOwner[] = ['Amaval', 'Tsinda - Cornelia', 'Tsinda - Other']
const GROUP_OPTS: AnimalGroup[] = ['A', 'B']

const DIP_LABEL: Record<DipStatus, string> = { ok: 'Dipped', due: 'Due soon', overdue: 'Overdue' }
const DIP_CLASS: Record<DipStatus, string> = {
  ok:      'bg-green-50 text-green-700',
  due:     'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
}
const STATUS_CLASS: Record<AnimalStatus, string> = {
  active:   'bg-green-50 text-green-700',
  in_calf:  'bg-blue-50 text-blue-700',
  sold:     'bg-zinc-100 text-zinc-500',
  lost:     'bg-orange-50 text-orange-700',
  deceased: 'bg-red-50 text-red-600',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDoc(id: string, d: Record<string, unknown>): Animal {
  // Support old schema (sex: cow/bull/heifer/steer) and new schema (gender: M/F)
  let gender = d.gender as AnimalGender | undefined
  let isBull = d.isBull as boolean | undefined

  if (!gender) {
    const sex = d.sex as string | undefined
    gender = sex === 'bull' || sex === 'steer' ? 'M' : 'F'
    isBull = sex === 'bull'
  }

  return {
    id,
    tag: String(d.tag ?? ''),
    gender: gender ?? 'F',
    isBull: isBull ?? false,
    dob: (d.dob ?? null) as string | null,
    status: ((d.status ?? (d.active ? 'active' : 'sold')) as AnimalStatus),
    group: (d.group ?? null) as AnimalGroup | null,
    motherId: (d.motherId ?? d.mother_id ?? null) as string | null,
    owner: (d.owner ?? null) as AnimalOwner | null,
    breed: (d.breed ?? null) as string | null,
    notes: (d.notes ?? null) as string | null,
    paddockId: (d.paddockId ?? d.paddock_id ?? null) as string | null,
    active: (d.active ?? true) as boolean,
    createdAt: (d.created_at as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  }
}

function fmt(tag: string): string {
  const digits = tag.replace(/\D/g, '')
  return (digits || '0').padStart(4, '0').slice(-4)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LivestockPage() {
  const [animals, setAnimals] = useState<EnrichedAnimal[]>([])
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [isOnline, setIsOnline] = useState(true)

  // Add/edit modal
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  // Detail / health modals
  const [detailAnimal, setDetailAnimal] = useState<EnrichedAnimal | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'health' | 'history'>('info')
  const [showDipForm, setShowDipForm] = useState(false)
  const [showVaccForm, setShowVaccForm] = useState(false)
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [dipDate, setDipDate] = useState(today())
  const [vaccDate, setVaccDate] = useState(today())
  const [vaccType, setVaccType] = useState('')
  const [vaccineUsed, setVaccineUsed] = useState('')
  const [weightDate, setWeightDate] = useState(today())
  const [weightKg, setWeightKg] = useState('')

  // Batch dipping
  const [showBatchDip, setShowBatchDip] = useState(false)
  const [batchDipDate, setBatchDipDate] = useState(today())
  const [batchDipTags, setBatchDipTags] = useState<Set<string>>(new Set())

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
      const [cattleSnap, paddocksSnap, dipSnap, weightSnap] = await Promise.all([
        getDocs(query(collection(db, 'cattle'), where('active', '==', true))),
        getDocs(collection(db, 'paddocks')),
        getDocs(collection(db, 'dip_records')),
        getDocs(collection(db, 'weight_records')),
      ])

      const paddockList: Paddock[] = paddocksSnap.docs
        .map(d => ({ id: d.id, name: d.data().name as string }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setPaddocks(paddockList)

      // Index dip dates per animal
      const lastDipMap = new Map<string, string>()
      dipSnap.docs.forEach(d => {
        const data = d.data()
        const aid = data.animalId as string
        const date = data.date as string
        if (!lastDipMap.has(aid) || date > lastDipMap.get(aid)!) lastDipMap.set(aid, date)
      })

      // Index last weight per animal
      const lastWeightMap = new Map<string, number>()
      weightSnap.docs.forEach(d => {
        const data = d.data()
        const aid = data.animalId as string
        lastWeightMap.set(aid, Math.max(lastWeightMap.get(aid) ?? 0, data.weightKg as number))
      })

      const rawAnimals = cattleSnap.docs.map(d => mapDoc(d.id, d.data() as Record<string, unknown>))

      // Build offspring set
      const offspringParents = new Set(rawAnimals.map(a => a.motherId).filter(Boolean) as string[])

      const enriched: EnrichedAnimal[] = rawAnimals.map(a => {
        const hasOffspring = offspringParents.has(a.id)
        const ageYears = a.dob
          ? (Date.now() - new Date(a.dob).getTime()) / (365.25 * 86_400_000)
          : null
        const lastDipDate = lastDipMap.get(a.id) ?? null
        return {
          ...a,
          type: computeAnimalType(a.gender, a.isBull, a.dob, hasOffspring),
          ageYears,
          lastDipDate,
          dipStatus: getDipStatus(lastDipDate),
          lastWeightKg: lastWeightMap.get(a.id) ?? null,
          hasOffspring,
        }
      })

      enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setAnimals(enriched)
    } catch (err) {
      console.error('fetchAll failed:', err)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Load sub-records lazily when opening an animal detail
  async function openDetail(animal: EnrichedAnimal) {
    setDetailAnimal(animal)
    setDetailTab('info')
    const [dipSnap, vaccSnap, weightSnap, statusSnap] = await Promise.all([
      getDocs(query(collection(db, 'dip_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'vaccination_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'weight_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'status_changes'), where('animalId', '==', animal.id))),
    ])
    const withRecords: EnrichedAnimal = {
      ...animal,
      dips: dipSnap.docs.map(d => ({ id: d.id, animalId: animal.id, date: d.data().date as string, sessionId: null })).sort((a,b) => b.date.localeCompare(a.date)),
      vaccinations: vaccSnap.docs.map(d => ({ id: d.id, animalId: animal.id, date: d.data().date as string, type: d.data().type as string, vaccineUsed: d.data().vaccineUsed as string | null })).sort((a,b) => b.date.localeCompare(a.date)),
      weights: weightSnap.docs.map(d => ({ id: d.id, animalId: animal.id, date: d.data().date as string, weightKg: d.data().weightKg as number })).sort((a,b) => b.date.localeCompare(a.date)),
      statusChanges: statusSnap.docs.map(d => ({ id: d.id, animalId: animal.id, date: d.data().date as string, fromStatus: d.data().fromStatus as AnimalStatus | null, toStatus: d.data().toStatus as AnimalStatus, notes: d.data().notes as string | null })).sort((a,b) => b.date.localeCompare(a.date)),
    }
    setDetailAnimal(withRecords)
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = animals
    if (tab === 'active') list = list.filter(a => a.status === 'active')
    else if (tab === 'in_calf') list = list.filter(a => a.status === 'in_calf')
    else if (tab === 'bull') list = list.filter(a => a.isBull)
    else if (tab === 'cow') list = list.filter(a => a.type === 'Cow')
    else if (tab === 'young') list = list.filter(a => ['Calf', 'Weaner steer', 'Steer', 'Weaner heifer', 'Heifer'].includes(a.type))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.tag.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        (a.breed?.toLowerCase().includes(q) ?? false)
      )
    }
    return list
  }, [animals, tab, search])

  const stats = useMemo(() => ({
    total: animals.length,
    active: animals.filter(a => a.status === 'active').length,
    inCalf: animals.filter(a => a.status === 'in_calf').length,
    male: animals.filter(a => a.gender === 'M').length,
    female: animals.filter(a => a.gender === 'F').length,
  }), [animals])

  // ── Form handlers ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(emptyForm())
    setEditId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(a: EnrichedAnimal) {
    setForm({
      tag: fmt(a.tag),
      gender: a.gender,
      isBull: a.isBull,
      dob: a.dob ?? '',
      status: a.status,
      group: a.group ?? '',
      motherId: a.motherId ?? '',
      owner: a.owner ?? '',
      breed: a.breed ?? '',
      paddockId: a.paddockId ?? '',
      notes: a.notes ?? '',
    })
    setEditId(a.id)
    setFormError(null)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    const payload = {
      tag: form.tag,
      gender: form.gender,
      isBull: form.gender === 'M' && form.isBull,
      dob: form.dob || null,
      status: form.status,
      group: form.group || null,
      motherId: form.motherId || null,
      owner: form.owner || null,
      breed: form.breed || null,
      paddockId: form.paddockId || null,
      notes: form.notes || null,
      active: true,
    }
    try {
      if (editId) {
        await updateDoc(doc(db, 'cattle', editId), payload)
      } else {
        await addDoc(collection(db, 'cattle'), { ...payload, created_at: Timestamp.now() })
      }
      setShowForm(false)
      fetchAll(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred')
    }
    setSubmitting(false)
  }

  async function handleRemove() {
    if (!editId) return
    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'cattle', editId), { active: false })
      setShowForm(false)
      fetchAll(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred')
    }
    setSubmitting(false)
  }

  // ── Health record handlers ─────────────────────────────────────────────────

  async function recordDip() {
    if (!detailAnimal) return
    await addDoc(collection(db, 'dip_records'), {
      animalId: detailAnimal.id,
      date: dipDate,
      sessionId: null,
      createdAt: Timestamp.now().toDate().toISOString(),
    })
    setShowDipForm(false)
    openDetail({ ...detailAnimal, lastDipDate: dipDate, dipStatus: getDipStatus(dipDate) })
    fetchAll(true)
  }

  async function recordVaccination() {
    if (!detailAnimal || !vaccType) return
    await addDoc(collection(db, 'vaccination_records'), {
      animalId: detailAnimal.id,
      date: vaccDate,
      type: vaccType,
      vaccineUsed: vaccineUsed || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    })
    setShowVaccForm(false)
    setVaccType('')
    setVaccineUsed('')
    openDetail(detailAnimal)
  }

  async function recordWeight() {
    if (!detailAnimal || !weightKg) return
    const kg = parseFloat(weightKg)
    if (isNaN(kg)) return
    await addDoc(collection(db, 'weight_records'), {
      animalId: detailAnimal.id,
      date: weightDate,
      weightKg: kg,
      createdAt: Timestamp.now().toDate().toISOString(),
    })
    setShowWeightForm(false)
    setWeightKg('')
    openDetail(detailAnimal)
    fetchAll(true)
  }

  // ── Batch dip ──────────────────────────────────────────────────────────────

  async function submitBatchDip() {
    if (!batchDipTags.size) return
    const sessionId = `session_${Date.now()}`
    const targets = animals.filter(a => batchDipTags.has(a.id))
    await Promise.all(targets.map(a =>
      addDoc(collection(db, 'dip_records'), {
        animalId: a.id,
        date: batchDipDate,
        sessionId,
        createdAt: Timestamp.now().toDate().toISOString(),
      })
    ))
    setShowBatchDip(false)
    setBatchDipTags(new Set())
    fetchAll(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Livestock</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowBatchDip(true)}
              className="text-xs bg-[#3B6D11]/10 text-[#3B6D11] px-3 py-1.5 rounded-full font-medium hover:bg-[#3B6D11]/20 transition-colors cursor-pointer">
              Record Dip
            </button>
            <button onClick={() => fetchAll(true)}
              className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer">
              <SyncIcon spinning={syncing} />
            </button>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center">Offline — changes saved locally.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'In Calf', value: stats.inCalf },
            { label: 'Female', value: stats.female },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-zinc-100 p-3 shadow-sm text-center">
              <p className="text-lg font-bold text-zinc-900">{loading ? '—' : s.value}</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tag, type or breed…"
            className="w-full bg-white border border-zinc-100 rounded-2xl pl-9 pr-4 py-3 text-sm text-zinc-700 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20" />
        </div>

        {/* Tab chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap border transition-colors cursor-pointer ${
                tab === t.key ? 'bg-[#3B6D11] text-white border-[#3B6D11]' : 'bg-white text-zinc-500 border-zinc-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Animal list */}
        <div className="space-y-2">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-zinc-100" />
            ))
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-400 text-sm py-16">
              {animals.length === 0 ? 'No animals recorded yet.' : 'No results.'}
            </p>
          ) : filtered.map(a => (
            <button key={a.id} onClick={() => openDetail(a)}
              className="w-full bg-white rounded-2xl border border-zinc-100 px-4 py-3.5 flex items-center justify-between shadow-sm hover:border-zinc-300 hover:shadow-md active:scale-[0.99] transition-all text-left cursor-pointer">
              <div className="min-w-0 mr-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-zinc-900 font-[family-name:var(--font-dm-mono)]">
                    {fmt(a.tag)}
                  </span>
                  <span className="text-xs text-zinc-500">{a.type}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[a.status]}`}>
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">
                  {[a.breed, a.group ? `Group ${a.group}` : null, a.ageYears ? `${a.ageYears.toFixed(1)}y` : null, a.lastWeightKg ? `${a.lastWeightKg}kg` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${DIP_CLASS[a.dipStatus]}`}>
                  {DIP_LABEL[a.dipStatus]}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* FAB */}
      <button onClick={openAdd}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ── Add / Edit modal ──────────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Animal' : 'Add Animal'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tag" required>
              <input required value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })}
                placeholder="e.g. 0042" className={input} />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as AnimalGender })} className={sel}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </Field>
          </div>

          {form.gender === 'M' && (
            <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
              <input type="checkbox" checked={form.isBull}
                onChange={e => setForm({ ...form, isBull: e.target.checked })}
                className="rounded" />
              Mark as Bull
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as AnimalStatus })} className={sel}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Group">
              <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} className={sel}>
                <option value="">None</option>
                {GROUP_OPTS.map(g => <option key={g} value={g}>Group {g}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of Birth">
              <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className={input} />
            </Field>
            <Field label="Paddock">
              <select value={form.paddockId} onChange={e => setForm({ ...form, paddockId: e.target.value })} className={sel}>
                <option value="">None</option>
                {paddocks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Breed">
            <input value={form.breed} onChange={e => setForm({ ...form, breed: e.target.value })}
              placeholder="e.g. Brahman, Nguni" className={input} />
          </Field>

          <Field label="Owner">
            <select value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} className={sel}>
              <option value="">Unknown</option>
              {OWNER_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className={`${input} resize-none`} placeholder="Optional…" />
          </Field>

          {formError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{formError}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {submitting ? 'Saving…' : editId ? 'Save Changes' : 'Add Animal'}
          </button>
          {editId && (
            <button type="button" onClick={handleRemove} disabled={submitting}
              className="w-full text-red-500 text-sm py-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer">
              Remove from registry
            </button>
          )}
        </form>
      </Modal>

      {/* ── Animal detail modal ───────────────────────────────────────────── */}
      <Modal open={!!detailAnimal} onClose={() => setDetailAnimal(null)} title={detailAnimal ? `Tag ${fmt(detailAnimal.tag)}` : ''}>
        {detailAnimal && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex bg-zinc-100 rounded-full p-0.5">
              {(['info', 'health', 'history'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer capitalize ${
                    detailTab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                  }`}>{t}</button>
              ))}
            </div>

            {detailTab === 'info' && (
              <div className="space-y-3">
                <InfoRow label="Type" value={detailAnimal.type} />
                <InfoRow label="Gender" value={detailAnimal.gender === 'M' ? 'Male' : 'Female'} />
                <InfoRow label="Status" value={<span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[detailAnimal.status]}`}>{detailAnimal.status.replace('_', ' ')}</span>} />
                {detailAnimal.ageYears != null && <InfoRow label="Age" value={`${detailAnimal.ageYears.toFixed(1)} years`} />}
                {detailAnimal.breed && <InfoRow label="Breed" value={detailAnimal.breed} />}
                {detailAnimal.group && <InfoRow label="Group" value={`Group ${detailAnimal.group}`} />}
                {detailAnimal.owner && <InfoRow label="Owner" value={detailAnimal.owner} />}
                {detailAnimal.notes && <InfoRow label="Notes" value={detailAnimal.notes} />}
                <div className="pt-2">
                  <button onClick={() => openEdit(detailAnimal)}
                    className="w-full border border-zinc-200 text-zinc-700 text-sm py-2.5 rounded-full hover:bg-zinc-50 transition-colors cursor-pointer">
                    Edit Details
                  </button>
                </div>
              </div>
            )}

            {detailTab === 'health' && (
              <div className="space-y-4">
                {/* Dip */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide">Dipping</p>
                    <button onClick={() => setShowDipForm(true)}
                      className="text-xs text-[#3B6D11] font-medium cursor-pointer">+ Record</button>
                  </div>
                  {showDipForm && (
                    <div className="bg-zinc-50 rounded-xl p-3 space-y-2 mb-2">
                      <input type="date" value={dipDate} onChange={e => setDipDate(e.target.value)} className={input} />
                      <button onClick={recordDip} className="w-full bg-[#3B6D11] text-white text-xs py-2 rounded-full cursor-pointer">Save</button>
                    </div>
                  )}
                  {detailAnimal.dips?.length ? (
                    detailAnimal.dips.slice(0, 5).map(d => (
                      <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
                        <span className="text-sm text-zinc-700">{d.date}</span>
                        <span className="text-xs text-green-600">Dipped</span>
                      </div>
                    ))
                  ) : <p className="text-xs text-zinc-400">No dip records.</p>}
                </div>

                {/* Vaccinations */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide">Vaccinations</p>
                    <button onClick={() => setShowVaccForm(true)} className="text-xs text-[#3B6D11] font-medium cursor-pointer">+ Record</button>
                  </div>
                  {showVaccForm && (
                    <div className="bg-zinc-50 rounded-xl p-3 space-y-2 mb-2">
                      <input type="date" value={vaccDate} onChange={e => setVaccDate(e.target.value)} className={input} />
                      <input value={vaccType} onChange={e => setVaccType(e.target.value)} placeholder="Vaccination type" className={input} />
                      <input value={vaccineUsed} onChange={e => setVaccineUsed(e.target.value)} placeholder="Vaccine product (optional)" className={input} />
                      <button onClick={recordVaccination} className="w-full bg-[#3B6D11] text-white text-xs py-2 rounded-full cursor-pointer">Save</button>
                    </div>
                  )}
                  {detailAnimal.vaccinations?.length ? (
                    detailAnimal.vaccinations.slice(0, 5).map(v => (
                      <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
                        <span className="text-sm text-zinc-700">{v.type}</span>
                        <span className="text-xs text-zinc-400">{v.date}</span>
                      </div>
                    ))
                  ) : <p className="text-xs text-zinc-400">No vaccinations recorded.</p>}
                </div>

                {/* Weights */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide">Weights</p>
                    <button onClick={() => setShowWeightForm(true)} className="text-xs text-[#3B6D11] font-medium cursor-pointer">+ Record</button>
                  </div>
                  {showWeightForm && (
                    <div className="bg-zinc-50 rounded-xl p-3 space-y-2 mb-2">
                      <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} className={input} />
                      <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="Weight (kg)" className={input} />
                      <button onClick={recordWeight} className="w-full bg-[#3B6D11] text-white text-xs py-2 rounded-full cursor-pointer">Save</button>
                    </div>
                  )}
                  {detailAnimal.weights?.length ? (
                    detailAnimal.weights.slice(0, 5).map(w => (
                      <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
                        <span className="text-sm font-medium text-zinc-900">{w.weightKg} kg</span>
                        <span className="text-xs text-zinc-400">{w.date}</span>
                      </div>
                    ))
                  ) : <p className="text-xs text-zinc-400">No weight records.</p>}
                </div>
              </div>
            )}

            {detailTab === 'history' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide mb-2">Status History</p>
                {detailAnimal.statusChanges?.length ? (
                  detailAnimal.statusChanges.map(sc => (
                    <div key={sc.id} className="bg-zinc-50 rounded-xl px-3 py-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-700">
                          {sc.fromStatus ? `${sc.fromStatus.replace('_',' ')} → ` : ''}{sc.toStatus.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-zinc-400">{sc.date}</span>
                      </div>
                      {sc.notes && <p className="text-xs text-zinc-500 mt-0.5">{sc.notes}</p>}
                    </div>
                  ))
                ) : <p className="text-xs text-zinc-400">No status changes recorded.</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Batch dip modal ────────────────────────────────────────────────── */}
      <Modal open={showBatchDip} onClose={() => setShowBatchDip(false)} title="Record Dipping Session">
        <div className="space-y-4">
          <Field label="Dip Date">
            <input type="date" value={batchDipDate} onChange={e => setBatchDipDate(e.target.value)} className={input} />
          </Field>
          <p className="text-xs text-zinc-500">Select animals that were dipped ({batchDipTags.size} selected):</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {animals.filter(a => a.status === 'active' || a.status === 'in_calf').map(a => (
              <label key={a.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-zinc-50 cursor-pointer">
                <input type="checkbox" checked={batchDipTags.has(a.id)}
                  onChange={e => {
                    const next = new Set(batchDipTags)
                    e.target.checked ? next.add(a.id) : next.delete(a.id)
                    setBatchDipTags(next)
                  }} className="rounded" />
                <span className="font-[family-name:var(--font-dm-mono)] text-sm">{fmt(a.tag)}</span>
                <span className="text-xs text-zinc-400">{a.type}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${DIP_CLASS[a.dipStatus]}`}>{DIP_LABEL[a.dipStatus]}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBatchDipTags(new Set(animals.filter(a => a.status === 'active' || a.status === 'in_calf').map(a => a.id)))}
              className="flex-1 text-xs border border-zinc-200 py-2 rounded-full cursor-pointer">Select All</button>
            <button onClick={() => setBatchDipTags(new Set())}
              className="flex-1 text-xs border border-zinc-200 py-2 rounded-full cursor-pointer">Clear</button>
          </div>
          <button onClick={submitBatchDip} disabled={!batchDipTags.size}
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            Record {batchDipTags.size} Animal{batchDipTags.size !== 1 ? 's' : ''} Dipped
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyForm() {
  return { tag: '', gender: 'F' as AnimalGender, isBull: false, dob: '', status: 'active' as AnimalStatus, group: '', motherId: '', owner: '', breed: '', paddockId: '', notes: '' }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'
const sel = `${input}`

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-800 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-50">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={spinning ? 'animate-spin' : ''} width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}
