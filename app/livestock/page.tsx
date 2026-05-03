'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

type Paddock = { id: string; name: string }
type EnrichedAnimal = Animal & {
  type: string
  ageYears: number | null
  lastDipDate: string | null
  dipStatus: DipStatus
  lastWeightKg: number | null
  hasOffspring: boolean
  dips?: DipRecord[]
  vaccinations?: VaccinationRecord[]
  weights?: WeightRecord[]
  statusChanges?: StatusChange[]
}

const ARCHIVED_STATUSES: AnimalStatus[] = ['sold', 'lost', 'deceased']

const STATUS_LABEL: Record<AnimalStatus, string> = {
  active: 'Active',
  in_calf: 'In Calf',
  sick: 'Sick',
  sold: 'Sold',
  lost: 'Lost',
  deceased: 'Deceased',
}

const STATUS_CLASS: Record<AnimalStatus, string> = {
  active:   'bg-green-50 text-green-700',
  in_calf:  'bg-blue-50 text-blue-700',
  sick:     'bg-orange-50 text-orange-700',
  sold:     'bg-zinc-100 text-zinc-500',
  lost:     'bg-amber-50 text-amber-700',
  deceased: 'bg-red-50 text-red-600',
}

const DIP_LABEL: Record<DipStatus, string> = { ok: 'Dipped', due: 'Due soon', overdue: 'Overdue' }
const DIP_CLASS: Record<DipStatus, string> = {
  ok:      'bg-green-50 text-green-700',
  due:     'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
}

const OWNER_OPTS: AnimalOwner[] = ['Amaval', 'Tsinda - Cornelia', 'Tsinda - Other']
const GROUP_OPTS: AnimalGroup[] = ['A', 'B']
const PIE_COLORS = ['#3B6D11','#6aaa2a','#a3d977','#c9e9a0','#e8f5d0','#1a3d06','#92c25d','#d4edaa']

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDoc(id: string, d: Record<string, unknown>): Animal {
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

function today() { return new Date().toISOString().slice(0, 10) }

function fmtAge(years: number | null): string {
  if (years === null) return ''
  if (years < 1) return `${Math.round(years * 12)}mo`
  return `${years.toFixed(1)}y`
}

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'
const sel = input

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
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LivestockPage() {
  const [allAnimals, setAllAnimals] = useState<EnrichedAnimal[]>([]) // includes archived
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [loading, setLoading] = useState(true)
  const [statFilter, setStatFilter] = useState<AnimalStatus | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  // Add/edit modal
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  // Birth form
  const [showBirthForm, setShowBirthForm] = useState(false)
  const [birthTag, setBirthTag] = useState('')
  const [birthGender, setBirthGender] = useState<'M' | 'F'>('F')
  const [birthDate, setBirthDate] = useState(today())

  // Detail modal
  const [detailAnimal, setDetailAnimal] = useState<EnrichedAnimal | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'history' | 'dips' | 'weights' | 'vaccinations'>('info')

  // Record modals (top-level, opened from detail header)
  const [showDipModal, setShowDipModal] = useState(false)
  const [showVaccModal, setShowVaccModal] = useState(false)
  const [showWeightModal, setShowWeightModal] = useState(false)
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

  // Batch vaccination
  const [showBatchVacc, setShowBatchVacc] = useState(false)
  const [batchVaccDate, setBatchVaccDate] = useState(today())
  const [batchVaccType, setBatchVaccType] = useState('')
  const [batchVaccineUsed, setBatchVaccineUsed] = useState('')
  const [batchVaccTags, setBatchVaccTags] = useState<Set<string>>(new Set())

  // Batch weight
  const [showBatchWeight, setShowBatchWeight] = useState(false)
  const [batchWeightDate, setBatchWeightDate] = useState(today())
  const [batchWeights, setBatchWeights] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll(quiet = false) {
    if (!quiet) setLoading(true)
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

      const lastDipMap = new Map<string, string>()
      dipSnap.docs.forEach(d => {
        const data = d.data()
        const aid = data.animalId as string
        const date = data.date as string
        if (!lastDipMap.has(aid) || date > lastDipMap.get(aid)!) lastDipMap.set(aid, date)
      })

      const lastWeightMap = new Map<string, number>()
      weightSnap.docs.forEach(d => {
        const data = d.data()
        const aid = data.animalId as string
        lastWeightMap.set(aid, Math.max(lastWeightMap.get(aid) ?? 0, data.weightKg as number))
      })

      const rawAnimals = cattleSnap.docs.map(d => mapDoc(d.id, d.data() as Record<string, unknown>))
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
      setAllAnimals(enriched)
    } catch (err) {
      console.error('fetchAll failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Load sub-records lazily when opening an animal detail
  async function openDetail(animal: EnrichedAnimal) {
    setDetailAnimal(animal)
    setDetailTab('info')
    setShowBirthForm(false)
    const [dipSnap, vaccSnap, weightSnap, statusSnap] = await Promise.all([
      getDocs(query(collection(db, 'dip_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'vaccination_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'weight_records'), where('animalId', '==', animal.id))),
      getDocs(query(collection(db, 'status_changes'), where('animalId', '==', animal.id))),
    ])
    setDetailAnimal({
      ...animal,
      dips: dipSnap.docs.map(d => ({
        id: d.id, animalId: animal.id,
        date: d.data().date as string,
        sessionId: d.data().sessionId as string | null ?? null,
      })).sort((a, b) => b.date.localeCompare(a.date)),
      vaccinations: vaccSnap.docs.map(d => ({
        id: d.id, animalId: animal.id,
        date: d.data().date as string,
        type: d.data().type as string,
        vaccineUsed: d.data().vaccineUsed as string | null ?? null,
      })).sort((a, b) => b.date.localeCompare(a.date)),
      weights: weightSnap.docs.map(d => ({
        id: d.id, animalId: animal.id,
        date: d.data().date as string,
        weightKg: d.data().weightKg as number,
      })).sort((a, b) => a.date.localeCompare(b.date)), // ascending for chart
      statusChanges: statusSnap.docs.map(d => ({
        id: d.id, animalId: animal.id,
        date: d.data().date as string,
        fromStatus: d.data().fromStatus as AnimalStatus | null ?? null,
        toStatus: d.data().toStatus as AnimalStatus,
        notes: d.data().notes as string | null ?? null,
      })).sort((a, b) => b.date.localeCompare(a.date)),
    })
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const activeAnimals = useMemo(() =>
    allAnimals.filter(a => !ARCHIVED_STATUSES.includes(a.status)),
    [allAnimals])

  const archivedAnimals = useMemo(() =>
    allAnimals.filter(a => ARCHIVED_STATUSES.includes(a.status)),
    [allAnimals])

  const stats = useMemo(() => ({
    total: activeAnimals.length,
    active: activeAnimals.filter(a => a.status === 'active').length,
    inCalf: activeAnimals.filter(a => a.status === 'in_calf').length,
    sick: activeAnimals.filter(a => a.status === 'sick').length,
  }), [activeAnimals])

  // Pie chart data — type breakdown of active animals
  const pieData = useMemo(() => {
    const map = new Map<string, number>()
    activeAnimals.forEach(a => map.set(a.type, (map.get(a.type) ?? 0) + 1))
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [activeAnimals])

  // Analytics charts data
  const groupData = useMemo(() => {
    const map = new Map<string, number>()
    activeAnimals.forEach(a => {
      const g = a.group ? `Group ${a.group}` : 'None'
      map.set(g, (map.get(g) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [activeAnimals])

  const locationData = useMemo(() => {
    const map = new Map<string, number>()
    activeAnimals.forEach(a => {
      const loc = paddocks.find(p => p.id === a.paddockId)?.name ?? 'Unknown'
      map.set(loc, (map.get(loc) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [activeAnimals, paddocks])

  const breedData = useMemo(() => {
    const map = new Map<string, number>()
    activeAnimals.forEach(a => {
      const b = a.breed ?? 'Unknown'
      map.set(b, (map.get(b) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [activeAnimals])

  const ownerData = useMemo(() => {
    const map = new Map<string, number>()
    activeAnimals.forEach(a => {
      const o = a.owner ?? 'Unknown'
      map.set(o, (map.get(o) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [activeAnimals])

  const filtered = useMemo(() => {
    let list = activeAnimals
    if (statFilter) list = list.filter(a => a.status === statFilter)
    if (typeFilter) list = list.filter(a => a.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.tag.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        (a.breed?.toLowerCase().includes(q) ?? false)
      )
    }
    return list
  }, [activeAnimals, statFilter, typeFilter, search])

  // ── Form handlers ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(emptyForm()); setEditId(null); setFormError(null); setShowForm(true)
  }

  function openEdit(a: EnrichedAnimal) {
    setForm({
      tag: fmt(a.tag),
      gender: a.gender,
      isBull: a.isBull,
      dob: a.dob ?? '',
      status: a.status === 'in_calf' ? 'active' : a.status,
      inCalf: a.status === 'in_calf',
      group: a.group ?? '',
      motherId: a.motherId ?? '',
      owner: a.owner ?? '',
      breed: a.breed ?? '',
      paddockId: a.paddockId ?? '',
      notes: a.notes ?? '',
    })
    setEditId(a.id); setFormError(null); setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const status: AnimalStatus = (form.gender === 'F' && form.inCalf) ? 'in_calf' : form.status as AnimalStatus
    const payload = {
      tag: form.tag, gender: form.gender,
      isBull: form.gender === 'M' && form.isBull,
      dob: form.dob || null, status,
      group: form.group || null,
      motherId: form.motherId || null,
      owner: form.owner || null,
      breed: form.breed || null,
      paddockId: form.paddockId || null,
      notes: form.notes || null,
      active: true,
    }
    if (editId) {
      updateDoc(doc(db, 'cattle', editId), payload).catch(console.error)
    } else {
      addDoc(collection(db, 'cattle'), { ...payload, created_at: Timestamp.now() }).catch(console.error)
    }
    setShowForm(false)
    fetchAll(true)
  }

  function handleRemove() {
    if (!editId) return
    updateDoc(doc(db, 'cattle', editId), { active: false }).catch(console.error)
    setShowForm(false)
    fetchAll(true)
  }

  function changeStatus(animal: EnrichedAnimal, s: AnimalStatus) {
    updateDoc(doc(db, 'cattle', animal.id), { status: s }).catch(console.error)
    addDoc(collection(db, 'status_changes'), {
      animalId: animal.id,
      date: today(),
      fromStatus: animal.status,
      toStatus: s,
      notes: null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    const updated = { ...animal, status: s }
    setDetailAnimal(updated)
    setAllAnimals(prev => prev.map(a => a.id === animal.id ? { ...a, status: s } : a))
  }

  // ── Health record handlers ─────────────────────────────────────────────────

  function recordDip(animalId: string, date: string, cb?: () => void) {
    addDoc(collection(db, 'dip_records'), {
      animalId, date, sessionId: null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    fetchAll(true)
    cb?.()
  }

  function recordVacc(animalId: string, date: string, type: string, vaccine: string, cb?: () => void) {
    if (!type) return
    addDoc(collection(db, 'vaccination_records'), {
      animalId, date, type, vaccineUsed: vaccine || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    cb?.()
  }

  function recordWeight(animalId: string, date: string, kg: string, cb?: () => void) {
    const n = parseFloat(kg)
    if (isNaN(n)) return
    addDoc(collection(db, 'weight_records'), {
      animalId, date, weightKg: n,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    fetchAll(true)
    cb?.()
  }

  // ── Batch handlers ─────────────────────────────────────────────────────────

  function submitBatchDip() {
    if (!batchDipTags.size) return
    const sessionId = `session_${Date.now()}`
    allAnimals.filter(a => batchDipTags.has(a.id)).forEach(a =>
      addDoc(collection(db, 'dip_records'), {
        animalId: a.id, date: batchDipDate, sessionId,
        createdAt: Timestamp.now().toDate().toISOString(),
      }).catch(console.error)
    )
    setShowBatchDip(false); setBatchDipTags(new Set()); fetchAll(true)
  }

  function submitBatchVacc() {
    if (!batchVaccTags.size || !batchVaccType) return
    allAnimals.filter(a => batchVaccTags.has(a.id)).forEach(a =>
      addDoc(collection(db, 'vaccination_records'), {
        animalId: a.id, date: batchVaccDate, type: batchVaccType,
        vaccineUsed: batchVaccineUsed || null,
        createdAt: Timestamp.now().toDate().toISOString(),
      }).catch(console.error)
    )
    setShowBatchVacc(false); setBatchVaccTags(new Set()); setBatchVaccType(''); setBatchVaccineUsed('')
  }

  function submitBatchWeight() {
    const eligible = allAnimals.filter(a => a.status === 'active' || a.status === 'in_calf' || a.status === 'sick')
    eligible.forEach(a => {
      const kg = batchWeights.get(a.id)
      if (kg) recordWeight(a.id, batchWeightDate, kg)
    })
    setShowBatchWeight(false); setBatchWeights(new Map())
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const eligibleForBatch = allAnimals.filter(a => a.status === 'active' || a.status === 'in_calf' || a.status === 'sick')

  // Female status options depend on age
  function femaleStatusOpts(animal: EnrichedAnimal | null): AnimalStatus[] {
    if (!animal) return ['active', 'in_calf', 'sick', 'sold', 'lost', 'deceased']
    const isUnderOneYear = animal.ageYears !== null && animal.ageYears < 1
    if (isUnderOneYear) return ['active', 'sick', 'sold', 'lost', 'deceased']
    return ['active', 'in_calf', 'sick', 'sold', 'lost', 'deceased']
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">Livestock</h1>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Animals · Health · Records</p>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">

        {/* Stats row — interactive */}
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Total',   value: stats.total,   filter: null },
            { label: 'Active',  value: stats.active,  filter: 'active' as AnimalStatus },
            { label: 'In Calf', value: stats.inCalf,  filter: 'in_calf' as AnimalStatus },
            { label: 'Sick',    value: stats.sick,    filter: 'sick' as AnimalStatus },
          ]).map(s => (
            <button key={s.label}
              onClick={() => setStatFilter(prev => prev === s.filter ? null : s.filter)}
              className={`rounded-xl border p-3 shadow-sm text-center transition-all cursor-pointer ${
                statFilter === s.filter
                  ? 'bg-[#3B6D11] border-[#3B6D11] text-white'
                  : 'bg-white border-zinc-100 text-zinc-900'
              }`}>
              <p className="text-lg font-bold">{loading ? '—' : s.value}</p>
              <p className={`text-[10px] uppercase tracking-wide ${statFilter === s.filter ? 'text-white/70' : 'text-zinc-400'}`}>{s.label}</p>
            </button>
          ))}
        </div>

        {/* Pie chart — interactive type filter */}
        {!loading && activeAnimals.length > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">By Type</p>
            <div className="flex items-center gap-4">
              <div style={{ width: 130, height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie dataKey="value" data={pieData} cx="50%" cy="50%" outerRadius={55}
                      onClick={(entry) => setTypeFilter(prev => prev === entry.name ? null : entry.name as string)}>
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]}
                          opacity={typeFilter && typeFilter !== entry.name ? 0.3 : 1} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {pieData.map((entry, i) => (
                  <button key={entry.name}
                    onClick={() => setTypeFilter(prev => prev === entry.name ? null : entry.name)}
                    className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1 transition-colors cursor-pointer ${
                      typeFilter === entry.name ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-zinc-700 flex-1">{entry.name}</span>
                    <span className="text-xs font-medium text-zinc-900">{entry.value}</span>
                  </button>
                ))}
              </div>
            </div>
            {typeFilter && (
              <button onClick={() => setTypeFilter(null)}
                className="mt-2 text-xs text-zinc-400 underline w-full text-center cursor-pointer">
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Analytics charts — collapsible */}
        {!loading && activeAnimals.length > 0 && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <button onClick={() => setShowCharts(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Analytics</p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-zinc-400 transition-transform ${showCharts ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showCharts && (
              <div className="px-4 pb-4 space-y-5 border-t border-zinc-50">
                <MiniBarChart title="By Group" data={groupData} />
                <MiniBarChart title="By Location" data={locationData} />
                <MiniBarChart title="By Breed" data={breedData} />
                <MiniBarChart title="By Owner" data={ownerData} />
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={() => setShowBatchDip(true)}
            className="flex-1 text-xs bg-[#3B6D11]/10 text-[#3B6D11] px-3 py-2 rounded-full font-medium hover:bg-[#3B6D11]/20 transition-colors cursor-pointer">
            Record Dip
          </button>
          <button onClick={() => setShowBatchVacc(true)}
            className="flex-1 text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-full font-medium hover:bg-blue-100 transition-colors cursor-pointer">
            Record Vaccination
          </button>
          <button onClick={() => setShowBatchWeight(true)}
            className="flex-1 text-xs bg-purple-50 text-purple-700 px-3 py-2 rounded-full font-medium hover:bg-purple-100 transition-colors cursor-pointer">
            Record Weight
          </button>
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

        {/* Animal list */}
        <div className="space-y-2">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-zinc-100" />
            ))
          ) : filtered.length === 0 ? (
            <p className="text-center text-zinc-400 text-sm py-16">
              {activeAnimals.length === 0 ? 'No animals recorded yet.' : 'No results.'}
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
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                  {[a.breed, a.group ? `Group ${a.group}` : null, a.ageYears ? fmtAge(a.ageYears) : null, a.lastWeightKg ? `${a.lastWeightKg}kg` : null].filter(Boolean).join(' · ')}
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

        {/* Archive toggle */}
        {!loading && archivedAnimals.length > 0 && (
          <div className="text-center py-2">
            <button onClick={() => setShowArchive(p => !p)}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
              {showArchive ? 'Hide archive' : `Archive (${archivedAnimals.length})`}
            </button>
          </div>
        )}

        {/* Archived animals */}
        {showArchive && archivedAnimals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide px-1">Archived</p>
            {archivedAnimals.map(a => (
              <button key={a.id} onClick={() => openDetail(a)}
                className="w-full bg-zinc-50 rounded-2xl border border-zinc-200 px-4 py-3 flex items-center justify-between text-left cursor-pointer opacity-70 hover:opacity-100 transition-all">
                <div className="min-w-0 mr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-600 font-[family-name:var(--font-dm-mono)]">
                      {fmt(a.tag)}
                    </span>
                    <span className="text-xs text-zinc-400">{a.type}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {[a.breed, a.group ? `Group ${a.group}` : null, a.ageYears ? fmtAge(a.ageYears) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button onClick={openAdd}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ── Animal detail modal ──────────────────────────────────────────────── */}
      <Modal open={!!detailAnimal} onClose={() => { setDetailAnimal(null); setShowBirthForm(false) }}
        title={detailAnimal ? `Tag ${fmt(detailAnimal.tag)}` : ''} minContentHeight="380px">
        {detailAnimal && (
          <div className="space-y-3">

            {/* Quick-record buttons at top */}
            <div className="flex gap-2">
              <button onClick={() => { setDipDate(today()); setShowDipModal(true) }}
                className="flex-1 text-xs bg-[#3B6D11]/10 text-[#3B6D11] py-2 rounded-full font-medium cursor-pointer hover:bg-[#3B6D11]/20 transition-colors">
                Dip
              </button>
              <button onClick={() => { setWeightDate(today()); setWeightKg(''); setShowWeightModal(true) }}
                className="flex-1 text-xs bg-purple-50 text-purple-700 py-2 rounded-full font-medium cursor-pointer hover:bg-purple-100 transition-colors">
                Weight
              </button>
              <button onClick={() => { setVaccDate(today()); setVaccType(''); setVaccineUsed(''); setShowVaccModal(true) }}
                className="flex-1 text-xs bg-blue-50 text-blue-700 py-2 rounded-full font-medium cursor-pointer hover:bg-blue-100 transition-colors">
                Vaccination
              </button>
              {detailAnimal.status === 'in_calf' && (
                <button onClick={() => setShowBirthForm(true)}
                  className="flex-1 text-xs bg-pink-50 text-pink-700 py-2 rounded-full font-medium cursor-pointer hover:bg-pink-100 transition-colors">
                  Birth
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex bg-zinc-100 rounded-full p-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {(['info', 'history', 'dips', 'weights', 'vaccinations'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer capitalize whitespace-nowrap px-2 ${
                    detailTab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
                  }`}>{t}</button>
              ))}
            </div>

            {/* ── Info tab ── */}
            {detailTab === 'info' && (
              <div className="space-y-3">
                <InfoRow label="Tag" value={
                  <span className="font-[family-name:var(--font-dm-mono)]">{fmt(detailAnimal.tag)}</span>
                } />
                <InfoRow label="Type" value={detailAnimal.type} />
                <InfoRow label="Gender" value={detailAnimal.gender === 'M' ? 'Male' : 'Female'} />
                {detailAnimal.ageYears != null && <InfoRow label="Age" value={`${detailAnimal.ageYears.toFixed(1)} years`} />}
                {detailAnimal.dob && <InfoRow label="Date of Birth" value={detailAnimal.dob} />}
                {detailAnimal.breed && <InfoRow label="Breed" value={detailAnimal.breed} />}
                {detailAnimal.group && <InfoRow label="Group" value={`Group ${detailAnimal.group}`} />}
                {detailAnimal.owner && <InfoRow label="Owner" value={detailAnimal.owner} />}
                {detailAnimal.paddockId && <InfoRow label="Location" value={paddocks.find(p => p.id === detailAnimal.paddockId)?.name ?? detailAnimal.paddockId} />}
                {detailAnimal.lastWeightKg && <InfoRow label="Last Weight" value={`${detailAnimal.lastWeightKg} kg`} />}
                {detailAnimal.notes && <InfoRow label="Notes" value={detailAnimal.notes} />}

                {/* Status pills */}
                <div className="flex items-start justify-between py-2 border-b border-zinc-50">
                  <span className="text-xs text-zinc-500 mt-1">Status</span>
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-[220px]">
                    {(detailAnimal.gender === 'M'
                      ? ['active', 'sick', 'sold', 'lost', 'deceased'] as AnimalStatus[]
                      : femaleStatusOpts(detailAnimal)
                    ).map(s => (
                      <button key={s} onClick={() => changeStatus(detailAnimal, s)}
                        className={`text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                          detailAnimal.status === s
                            ? 'bg-[#3B6D11] text-white'
                            : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}>
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Birth form */}
                {(detailAnimal.status === 'in_calf' && showBirthForm) && (
                  <div className="bg-zinc-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-medium text-zinc-700">New Calf Details</p>
                    <input required value={birthTag} onChange={e => setBirthTag(e.target.value)}
                      placeholder="Calf tag (required)" className={input} />
                    <select value={birthGender} onChange={e => setBirthGender(e.target.value as 'M' | 'F')} className={sel}>
                      <option value="F">Female</option>
                      <option value="M">Male</option>
                    </select>
                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={input} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowBirthForm(false)}
                        className="flex-1 border border-zinc-200 text-zinc-600 text-xs py-2 rounded-full cursor-pointer">
                        Cancel
                      </button>
                      <button disabled={!birthTag.trim()} onClick={() => {
                        if (!birthTag.trim()) return
                        addDoc(collection(db, 'cattle'), {
                          tag: birthTag, gender: birthGender, isBull: false, dob: birthDate,
                          status: 'active', group: detailAnimal.group, motherId: detailAnimal.id,
                          owner: detailAnimal.owner, breed: detailAnimal.breed,
                          paddockId: detailAnimal.paddockId, notes: null, active: true,
                          created_at: Timestamp.now(),
                        }).catch(console.error)
                        changeStatus(detailAnimal, 'active')
                        setShowBirthForm(false); setBirthTag(''); setBirthGender('F'); setBirthDate(today())
                        fetchAll(true)
                      }}
                        className="flex-1 bg-[#3B6D11] text-white text-xs py-2 rounded-full cursor-pointer disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Mother info */}
                {detailAnimal.motherId && (() => {
                  const mother = allAnimals.find(a => a.id === detailAnimal.motherId)
                  if (!mother) return null
                  return (
                    <div className="bg-zinc-50 rounded-xl p-3">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Mother</p>
                      <button onClick={() => openDetail(mother)}
                        className="w-full flex items-center justify-between cursor-pointer">
                        <div>
                          <span className="text-sm font-medium text-zinc-900 font-[family-name:var(--font-dm-mono)]">{fmt(mother.tag)}</span>
                          <span className="text-xs text-zinc-500 ml-2">{mother.type}</span>
                          {mother.breed && <span className="text-xs text-zinc-400 ml-2">{mother.breed}</span>}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  )
                })()}

                {/* Offspring */}
                {detailAnimal.hasOffspring && (() => {
                  const offspring = allAnimals.filter(a => a.motherId === detailAnimal.id)
                  if (!offspring.length) return null
                  return (
                    <div className="bg-zinc-50 rounded-xl p-3">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Offspring ({offspring.length})</p>
                      <div className="space-y-1">
                        {offspring.map(calf => (
                          <button key={calf.id} onClick={() => openDetail(calf)}
                            className="w-full flex items-center justify-between cursor-pointer py-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-900 font-[family-name:var(--font-dm-mono)]">{fmt(calf.tag)}</span>
                              <span className="text-xs text-zinc-500">{calf.type}</span>
                              {calf.ageYears !== null && <span className="text-xs text-zinc-400">{fmtAge(calf.ageYears)}</span>}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_CLASS[calf.status]}`}>
                                {STATUS_LABEL[calf.status]}
                              </span>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                <div className="pt-1">
                  <button onClick={() => openEdit(detailAnimal)}
                    className="w-full border border-zinc-200 text-zinc-700 text-sm py-2.5 rounded-full hover:bg-zinc-50 transition-colors cursor-pointer">
                    Edit Details
                  </button>
                </div>
              </div>
            )}

            {/* ── History tab ── */}
            {detailTab === 'history' && (
              <div className="space-y-2">
                {(() => {
                  // Merge all records into a unified timeline
                  const events: { date: string; label: string; detail?: string }[] = []
                  detailAnimal.dips?.forEach(d => events.push({ date: d.date, label: 'Dipped' }))
                  detailAnimal.vaccinations?.forEach(v => events.push({ date: v.date, label: `Vaccination: ${v.type}`, detail: v.vaccineUsed ?? undefined }))
                  const weightsSorted = [...(detailAnimal.weights ?? [])].sort((a, b) => b.date.localeCompare(a.date))
                  weightsSorted.forEach(w => events.push({ date: w.date, label: `Weight: ${w.weightKg} kg` }))
                  detailAnimal.statusChanges?.forEach(sc => events.push({
                    date: sc.date,
                    label: `Status: ${sc.fromStatus ? `${STATUS_LABEL[sc.fromStatus]} → ` : ''}${STATUS_LABEL[sc.toStatus]}`,
                    detail: sc.notes ?? undefined,
                  }))
                  events.sort((a, b) => b.date.localeCompare(a.date))
                  if (!events.length) return <p className="text-xs text-zinc-400 py-8 text-center">No records yet.</p>
                  return events.map((ev, i) => (
                    <div key={i} className="bg-zinc-50 rounded-xl px-3 py-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-800">{ev.label}</span>
                        <span className="text-xs text-zinc-400">{ev.date}</span>
                      </div>
                      {ev.detail && <p className="text-xs text-zinc-500 mt-0.5">{ev.detail}</p>}
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* ── Dips tab ── */}
            {detailTab === 'dips' && (
              <div className="space-y-1">
                {!detailAnimal.dips?.length
                  ? <p className="text-xs text-zinc-400 py-8 text-center">No dip records.</p>
                  : detailAnimal.dips.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-zinc-50">
                      <span className="text-sm text-zinc-700">{d.date}</span>
                      <span className="text-xs text-green-600">Dipped</span>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── Weights tab ── */}
            {detailTab === 'weights' && (
              <div className="space-y-3">
                {!detailAnimal.weights?.length
                  ? <p className="text-xs text-zinc-400 py-8 text-center">No weight records.</p>
                  : (
                    <>
                      {detailAnimal.weights.length > 1 && (
                        <div style={{ height: 140 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={detailAnimal.weights} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f4" />
                              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                              <YAxis tick={{ fontSize: 9 }} unit="kg" />
                              <Tooltip />
                              <Line type="monotone" dataKey="weightKg" stroke="#3B6D11" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {[...detailAnimal.weights].reverse().map(w => (
                        <div key={w.id} className="flex items-center justify-between py-2 border-b border-zinc-50">
                          <span className="text-sm font-medium text-zinc-900">{w.weightKg} kg</span>
                          <span className="text-xs text-zinc-400">{w.date}</span>
                        </div>
                      ))}
                    </>
                  )
                }
              </div>
            )}

            {/* ── Vaccinations tab ── */}
            {detailTab === 'vaccinations' && (
              <div className="space-y-1">
                {!detailAnimal.vaccinations?.length
                  ? <p className="text-xs text-zinc-400 py-8 text-center">No vaccination records.</p>
                  : detailAnimal.vaccinations.map(v => (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-zinc-50">
                      <div>
                        <span className="text-sm text-zinc-800">{v.type}</span>
                        {v.vaccineUsed && <p className="text-xs text-zinc-400">{v.vaccineUsed}</p>}
                      </div>
                      <span className="text-xs text-zinc-400">{v.date}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Record Dip (single animal) ─────────────────────────────────────── */}
      <Modal open={showDipModal} onClose={() => setShowDipModal(false)} title="Record Dip">
        <div className="space-y-4">
          <Field label="Date">
            <input type="date" value={dipDate} onChange={e => setDipDate(e.target.value)} className={input} />
          </Field>
          <button onClick={() => {
            if (!detailAnimal) return
            recordDip(detailAnimal.id, dipDate, () => {
              setShowDipModal(false)
              openDetail({ ...detailAnimal, lastDipDate: dipDate, dipStatus: getDipStatus(dipDate) })
            })
          }} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full cursor-pointer">
            Save
          </button>
        </div>
      </Modal>

      {/* ── Record Weight (single animal) ─────────────────────────────────── */}
      <Modal open={showWeightModal} onClose={() => setShowWeightModal(false)} title="Record Weight">
        <div className="space-y-4">
          <Field label="Date">
            <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} className={input} />
          </Field>
          <Field label="Weight (kg)">
            <input type="number" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)}
              placeholder="e.g. 350" className={input} />
          </Field>
          <button onClick={() => {
            if (!detailAnimal) return
            recordWeight(detailAnimal.id, weightDate, weightKg, () => {
              setShowWeightModal(false)
              openDetail(detailAnimal)
            })
          }} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full cursor-pointer">
            Save
          </button>
        </div>
      </Modal>

      {/* ── Record Vaccination (single animal) ────────────────────────────── */}
      <Modal open={showVaccModal} onClose={() => setShowVaccModal(false)} title="Record Vaccination">
        <div className="space-y-4">
          <Field label="Date">
            <input type="date" value={vaccDate} onChange={e => setVaccDate(e.target.value)} className={input} />
          </Field>
          <Field label="Vaccination type" required>
            <input value={vaccType} onChange={e => setVaccType(e.target.value)} placeholder="e.g. Anthrax, FMD" className={input} />
          </Field>
          <Field label="Vaccine product (optional)">
            <input value={vaccineUsed} onChange={e => setVaccineUsed(e.target.value)} placeholder="Brand/product name" className={input} />
          </Field>
          <button disabled={!vaccType} onClick={() => {
            if (!detailAnimal) return
            recordVacc(detailAnimal.id, vaccDate, vaccType, vaccineUsed, () => {
              setShowVaccModal(false)
              openDetail(detailAnimal)
            })
          }} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full cursor-pointer disabled:opacity-50">
            Save
          </button>
        </div>
      </Modal>

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
                onChange={e => setForm({ ...form, isBull: e.target.checked })} className="rounded" />
              Mark as Bull
            </label>
          )}

          {form.gender === 'F' && (() => {
            const dobVal = form.dob
            const isUnder1 = dobVal
              ? (Date.now() - new Date(dobVal).getTime()) / (365.25 * 86_400_000) < 1
              : false
            return !isUnder1 ? (
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input type="checkbox" checked={form.inCalf}
                  onChange={e => setForm({ ...form, inCalf: e.target.checked })} className="rounded" />
                In calf
              </label>
            ) : null
          })()}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as AnimalStatus })} className={sel}>
                {(['active', 'sick', 'sold', 'lost', 'deceased'] as AnimalStatus[]).map(s =>
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                )}
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

          <button type="submit"
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors cursor-pointer">
            {editId ? 'Save Changes' : 'Add Animal'}
          </button>
          {editId && (
            <button type="button" onClick={handleRemove}
              className="w-full text-red-500 text-sm py-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer">
              Remove from registry
            </button>
          )}
        </form>
      </Modal>

      {/* ── Batch Dip modal ────────────────────────────────────────────────── */}
      <Modal open={showBatchDip} onClose={() => setShowBatchDip(false)} title="Record Dipping Session">
        <div className="space-y-4">
          <Field label="Dip Date">
            <input type="date" value={batchDipDate} onChange={e => setBatchDipDate(e.target.value)} className={input} />
          </Field>
          <p className="text-xs text-zinc-500">Select animals dipped ({batchDipTags.size} selected):</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {eligibleForBatch.map(a => (
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
            <button onClick={() => setBatchDipTags(new Set(eligibleForBatch.map(a => a.id)))}
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

      {/* ── Batch Vaccination modal ────────────────────────────────────────── */}
      <Modal open={showBatchVacc} onClose={() => setShowBatchVacc(false)} title="Record Vaccination Session">
        <div className="space-y-4">
          <Field label="Date">
            <input type="date" value={batchVaccDate} onChange={e => setBatchVaccDate(e.target.value)} className={input} />
          </Field>
          <Field label="Vaccination type" required>
            <input value={batchVaccType} onChange={e => setBatchVaccType(e.target.value)}
              placeholder="e.g. Anthrax, FMD" className={input} />
          </Field>
          <Field label="Vaccine product (optional)">
            <input value={batchVaccineUsed} onChange={e => setBatchVaccineUsed(e.target.value)}
              placeholder="Brand/product name" className={input} />
          </Field>
          <p className="text-xs text-zinc-500">Select animals ({batchVaccTags.size} selected):</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {eligibleForBatch.map(a => (
              <label key={a.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-zinc-50 cursor-pointer">
                <input type="checkbox" checked={batchVaccTags.has(a.id)}
                  onChange={e => {
                    const next = new Set(batchVaccTags)
                    e.target.checked ? next.add(a.id) : next.delete(a.id)
                    setBatchVaccTags(next)
                  }} className="rounded" />
                <span className="font-[family-name:var(--font-dm-mono)] text-sm">{fmt(a.tag)}</span>
                <span className="text-xs text-zinc-400">{a.type}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBatchVaccTags(new Set(eligibleForBatch.map(a => a.id)))}
              className="flex-1 text-xs border border-zinc-200 py-2 rounded-full cursor-pointer">Select All</button>
            <button onClick={() => setBatchVaccTags(new Set())}
              className="flex-1 text-xs border border-zinc-200 py-2 rounded-full cursor-pointer">Clear</button>
          </div>
          <button onClick={submitBatchVacc} disabled={!batchVaccTags.size || !batchVaccType}
            className="w-full bg-blue-600 text-white text-sm font-medium py-3 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer">
            Record {batchVaccTags.size} Vaccination{batchVaccTags.size !== 1 ? 's' : ''}
          </button>
        </div>
      </Modal>

      {/* ── Batch Weight modal ─────────────────────────────────────────────── */}
      <Modal open={showBatchWeight} onClose={() => setShowBatchWeight(false)} title="Record Weights">
        <div className="space-y-4">
          <Field label="Date">
            <input type="date" value={batchWeightDate} onChange={e => setBatchWeightDate(e.target.value)} className={input} />
          </Field>
          <p className="text-xs text-zinc-500">Enter weight for each animal (leave blank to skip):</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {eligibleForBatch.map(a => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="font-[family-name:var(--font-dm-mono)] text-sm text-zinc-700 w-12">{fmt(a.tag)}</span>
                <span className="text-xs text-zinc-400 flex-1">{a.type}</span>
                <input type="number" step="0.1" placeholder="kg"
                  value={batchWeights.get(a.id) ?? ''}
                  onChange={e => {
                    const next = new Map(batchWeights)
                    e.target.value ? next.set(a.id, e.target.value) : next.delete(a.id)
                    setBatchWeights(next)
                  }}
                  className="w-24 border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#3B6D11]/20" />
              </div>
            ))}
          </div>
          <button onClick={submitBatchWeight} disabled={!batchWeights.size}
            className="w-full bg-purple-600 text-white text-sm font-medium py-3 rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer">
            Save {batchWeights.size} Weight{batchWeights.size !== 1 ? 's' : ''}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ── Mini bar chart helper ─────────────────────────────────────────────────────

function MiniBarChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data.length) return null
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">{title}</p>
      <div style={{ height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: -20 }} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f4" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#3B6D11" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    tag: '', gender: 'F' as AnimalGender, isBull: false, dob: '',
    status: 'active' as AnimalStatus, inCalf: false,
    group: '', motherId: '', owner: '', breed: '', paddockId: '', notes: '',
  }
}
