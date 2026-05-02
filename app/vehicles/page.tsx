'use client'

import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import {
  Vehicle, MileageLog, MaintenanceRecord, VehicleEngine, ServiceType, ServiceStatus,
  computeNextServiceMileage, getServiceStatus,
} from '../../lib/types'

type Location = { id: string; name: string }

const SERVICE_TYPES: ServiceType[] = ['Full Service', 'Oil Change', 'Tyres', 'Other']
const ENGINES: VehicleEngine[] = ['Petrol', 'Diesel']

const STATUS_LABEL: Record<ServiceStatus, string> = { ok: '✅ Up to date', soon: '🟧 Service soon', overdue: '🔴 Service overdue' }
const STATUS_CLASS: Record<ServiceStatus, string> = {
  ok:      'bg-green-50 text-green-700',
  soon:    'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-600',
}

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'
const sel = input

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-zinc-800 mb-1.5">{label}</label>{children}</div>
}

function today() { return new Date().toISOString().slice(0, 10) }

type EnrichedVehicle = Vehicle & {
  currentMileage: number
  nextServiceMileage: number
  serviceStatus: ServiceStatus
  locationName: string | null
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<EnrichedVehicle[]>([])
  const [mileageLogs, setMileageLogs] = useState<MileageLog[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  const [selectedVehicle, setSelectedVehicle] = useState<EnrichedVehicle | null>(null)
  const [vehicleTab, setVehicleTab] = useState<'mileage' | 'maintenance'>('mileage')

  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null)
  const [vehicleForm, setVehicleForm] = useState({ yearMakeModel: '', locationId: '', engine: 'Diesel' as VehicleEngine, serviceIntervalKm: '10000' })
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false)
  const [vehicleError, setVehicleError] = useState<string | null>(null)

  const [showMileageForm, setShowMileageForm] = useState(false)
  const [mileageForm, setMileageForm] = useState({ vehicleId: '', date: today(), recordedMileage: '', notes: '' })
  const [mileageSubmitting, setMileageSubmitting] = useState(false)
  const [mileageError, setMileageError] = useState<string | null>(null)

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceForm, setMaintenanceForm] = useState({ vehicleId: '', serviceDate: today(), serviceType: 'Full Service' as ServiceType, recordedMileage: '', notes: '' })
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true); const down = () => setIsOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll(quiet = false) {
    quiet ? setSyncing(true) : setLoading(true)
    try {
      const [vehicleSnap, mileageSnap, maintenanceSnap, locSnap] = await Promise.all([
        getDocs(query(collection(db, 'vehicles'), where('active', '==', true))),
        getDocs(collection(db, 'mileage_logs')),
        getDocs(collection(db, 'maintenance_records')),
        getDocs(collection(db, 'paddocks')),
      ])

      const locList: Location[] = locSnap.docs.map(d => ({ id: d.id, name: d.data().name as string }))
      setLocations(locList)
      const locMap = new Map(locList.map(l => [l.id, l.name]))

      const mileageList: MileageLog[] = mileageSnap.docs.map(d => ({
        id: d.id,
        vehicleId: d.data().vehicleId as string,
        date: d.data().date as string,
        recordedMileage: d.data().recordedMileage as number,
        notes: (d.data().notes ?? null) as string | null,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => b.date.localeCompare(a.date))

      const maintenanceList: MaintenanceRecord[] = maintenanceSnap.docs.map(d => ({
        id: d.id,
        vehicleId: d.data().vehicleId as string,
        serviceDate: d.data().serviceDate as string,
        serviceType: d.data().serviceType as ServiceType,
        recordedMileage: (d.data().recordedMileage ?? null) as number | null,
        notes: (d.data().notes ?? null) as string | null,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))

      // Max mileage per vehicle
      const maxMileage = new Map<string, number>()
      mileageList.forEach(l => {
        if (l.recordedMileage > (maxMileage.get(l.vehicleId) ?? 0)) maxMileage.set(l.vehicleId, l.recordedMileage)
      })

      const enriched: EnrichedVehicle[] = vehicleSnap.docs.map(d => {
        const data = d.data()
        const id = d.id
        const vid: Vehicle = {
          id,
          yearMakeModel: data.yearMakeModel as string,
          locationId: (data.locationId ?? null) as string | null,
          engine: (data.engine ?? null) as VehicleEngine | null,
          serviceIntervalKm: (data.serviceIntervalKm ?? null) as number | null,
          active: true,
          createdAt: data.createdAt as string ?? '',
        }
        const currentMileage = maxMileage.get(id) ?? 0
        const vMaintenance = maintenanceList.filter(m => m.vehicleId === id)
        const interval = vid.serviceIntervalKm ?? 10000
        const nextServiceMileage = computeNextServiceMileage(currentMileage, interval, vMaintenance)
        return {
          ...vid,
          currentMileage,
          nextServiceMileage,
          serviceStatus: getServiceStatus(currentMileage, nextServiceMileage),
          locationName: vid.locationId ? locMap.get(vid.locationId) ?? null : null,
        }
      })

      setMileageLogs(mileageList)
      setMaintenance(maintenanceList)
      setVehicles(enriched)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const vehicleMileage = useMemo(() => selectedVehicle ? mileageLogs.filter(l => l.vehicleId === selectedVehicle.id) : [], [mileageLogs, selectedVehicle])
  const vehicleMaintenance = useMemo(() => selectedVehicle ? maintenance.filter(m => m.vehicleId === selectedVehicle.id) : [], [maintenance, selectedVehicle])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleVehicleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      yearMakeModel: vehicleForm.yearMakeModel,
      locationId: vehicleForm.locationId || null,
      engine: vehicleForm.engine,
      serviceIntervalKm: vehicleForm.serviceIntervalKm ? parseInt(vehicleForm.serviceIntervalKm) : null,
      active: true,
    }
    if (editVehicleId) {
      updateDoc(doc(db, 'vehicles', editVehicleId), payload).catch(console.error)
    } else {
      addDoc(collection(db, 'vehicles'), { ...payload, createdAt: Timestamp.now().toDate().toISOString() }).catch(console.error)
    }
    setShowVehicleForm(false)
    fetchAll(true)
  }

  function handleMileageSubmit(e: React.FormEvent) {
    e.preventDefault()
    const km = parseInt(mileageForm.recordedMileage)
    if (isNaN(km)) return
    addDoc(collection(db, 'mileage_logs'), {
      vehicleId: mileageForm.vehicleId,
      date: mileageForm.date,
      recordedMileage: km,
      notes: mileageForm.notes || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setShowMileageForm(false)
    fetchAll(true)
  }

  function handleMaintenanceSubmit(e: React.FormEvent) {
    e.preventDefault()
    addDoc(collection(db, 'maintenance_records'), {
      vehicleId: maintenanceForm.vehicleId,
      serviceDate: maintenanceForm.serviceDate,
      serviceType: maintenanceForm.serviceType,
      recordedMileage: maintenanceForm.recordedMileage ? parseInt(maintenanceForm.recordedMileage) : null,
      notes: maintenanceForm.notes || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setShowMaintenanceForm(false)
    fetchAll(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const serviceAlerts = vehicles.filter(v => v.serviceStatus !== 'ok').length

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Vehicles</h1>
          <div className="flex gap-2">
            <button onClick={() => { setMileageForm({ vehicleId: '', date: today(), recordedMileage: '', notes: '' }); setMileageError(null); setShowMileageForm(true) }}
              className="text-xs bg-[#3B6D11]/10 text-[#3B6D11] px-3 py-1.5 rounded-full font-medium cursor-pointer hover:bg-[#3B6D11]/20 transition-colors">Log Mileage</button>
            <button onClick={() => fetchAll(true)} className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer">
              <SyncIcon spinning={syncing} />
            </button>
          </div>
        </div>
      </header>

      {!isOnline && <div className="bg-amber-50 border-b border-amber-200 px-4 py-2"><p className="text-xs text-amber-700 text-center">Offline — changes saved locally.</p></div>}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {serviceAlerts > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <p className="text-sm text-amber-800 font-medium">{serviceAlerts} vehicle{serviceAlerts !== 1 ? 's' : ''} need attention</p>
          </div>
        )}

        {loading ? [...Array(3)].map((_, i) => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-zinc-100" />) :
          vehicles.length === 0 ? <p className="text-center text-zinc-400 text-sm py-16">No vehicles recorded yet.</p> :
          vehicles.map(v => (
            <button key={v.id} onClick={() => { setSelectedVehicle(v); setVehicleTab('mileage') }}
              className="w-full bg-white rounded-2xl border border-zinc-100 px-4 py-4 text-left shadow-sm hover:shadow-md hover:border-zinc-300 active:scale-[0.99] transition-all cursor-pointer">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-zinc-900 text-sm">{v.yearMakeModel}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{[v.engine, v.locationName].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASS[v.serviceStatus]}`}>
                  {STATUS_LABEL[v.serviceStatus]}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-zinc-400">Current km</p>
                  <p className="text-base font-bold text-zinc-900">{v.currentMileage.toLocaleString()}</p>
                </div>
                <div className="bg-zinc-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-zinc-400">Next service</p>
                  <p className="text-base font-bold text-zinc-900">{v.nextServiceMileage.toLocaleString()}</p>
                </div>
              </div>
            </button>
          ))
        }
      </div>

      {/* FAB */}
      <button onClick={() => { setVehicleForm({ yearMakeModel: '', locationId: '', engine: 'Diesel', serviceIntervalKm: '10000' }); setEditVehicleId(null); setVehicleError(null); setShowVehicleForm(true) }}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {/* ── Vehicle detail ────────────────────────────────────────────────── */}
      <Modal open={!!selectedVehicle} onClose={() => setSelectedVehicle(null)} title={selectedVehicle?.yearMakeModel ?? ''}>
        {selectedVehicle && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${STATUS_CLASS[selectedVehicle.serviceStatus]}`}>
                {STATUS_LABEL[selectedVehicle.serviceStatus]}
              </span>
              <span className="text-xs text-zinc-400">Interval: {selectedVehicle.serviceIntervalKm?.toLocaleString()} km</span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setMileageForm({ vehicleId: selectedVehicle.id, date: today(), recordedMileage: '', notes: '' }); setSelectedVehicle(null); setMileageError(null); setShowMileageForm(true) }}
                className="flex-1 bg-[#3B6D11]/10 text-[#3B6D11] text-sm font-medium py-2.5 rounded-full cursor-pointer hover:bg-[#3B6D11]/20 transition-colors">Log Mileage</button>
              <button onClick={() => { setMaintenanceForm({ vehicleId: selectedVehicle.id, serviceDate: today(), serviceType: 'Full Service', recordedMileage: String(selectedVehicle.currentMileage), notes: '' }); setSelectedVehicle(null); setMaintenanceError(null); setShowMaintenanceForm(true) }}
                className="flex-1 border border-zinc-200 text-zinc-700 text-sm font-medium py-2.5 rounded-full cursor-pointer hover:bg-zinc-50 transition-colors">Record Service</button>
            </div>

            {/* Tabs */}
            <div className="flex bg-zinc-100 rounded-full p-0.5">
              {(['mileage', 'maintenance'] as const).map(t => (
                <button key={t} onClick={() => setVehicleTab(t)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer capitalize ${vehicleTab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>{t}</button>
              ))}
            </div>

            {vehicleTab === 'mileage' && (
              vehicleMileage.length === 0 ? <p className="text-sm text-zinc-400 text-center py-6">No mileage logged.</p> :
              <div className="space-y-2">
                {vehicleMileage.slice(0, 15).map(l => (
                  <div key={l.id} className="flex items-center justify-between py-2 border-b border-zinc-50">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{l.recordedMileage.toLocaleString()} km</p>
                      {l.notes && <p className="text-xs text-zinc-400">{l.notes}</p>}
                    </div>
                    <span className="text-xs text-zinc-400">{l.date}</span>
                  </div>
                ))}
              </div>
            )}

            {vehicleTab === 'maintenance' && (
              vehicleMaintenance.length === 0 ? <p className="text-sm text-zinc-400 text-center py-6">No maintenance recorded.</p> :
              <div className="space-y-2">
                {vehicleMaintenance.slice(0, 10).map(m => (
                  <div key={m.id} className="bg-zinc-50 rounded-xl px-3 py-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-zinc-900">{m.serviceType}</span>
                      <span className="text-xs text-zinc-400">{m.serviceDate}</span>
                    </div>
                    {m.recordedMileage && <p className="text-xs text-zinc-500 mt-0.5">{m.recordedMileage.toLocaleString()} km</p>}
                    {m.notes && <p className="text-xs text-zinc-400">{m.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Add vehicle ────────────────────────────────────────────────────── */}
      <Modal open={showVehicleForm} onClose={() => setShowVehicleForm(false)} title={editVehicleId ? 'Edit Vehicle' : 'Add Vehicle'}>
        <form onSubmit={handleVehicleSubmit} className="space-y-4">
          <Field label="Year, Make and Model"><input required value={vehicleForm.yearMakeModel} onChange={e => setVehicleForm({ ...vehicleForm, yearMakeModel: e.target.value })} placeholder="e.g. 2018 Toyota Land Cruiser" className={input} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Engine">
              <select value={vehicleForm.engine} onChange={e => setVehicleForm({ ...vehicleForm, engine: e.target.value as VehicleEngine })} className={sel}>
                {ENGINES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Service interval (km)"><input type="number" value={vehicleForm.serviceIntervalKm} onChange={e => setVehicleForm({ ...vehicleForm, serviceIntervalKm: e.target.value })} className={input} /></Field>
          </div>
          <Field label="Location">
            <select value={vehicleForm.locationId} onChange={e => setVehicleForm({ ...vehicleForm, locationId: e.target.value })} className={sel}>
              <option value="">None</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          {vehicleError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{vehicleError}</p>}
          <button type="submit" disabled={vehicleSubmitting} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {vehicleSubmitting ? 'Saving…' : editVehicleId ? 'Save Changes' : 'Add Vehicle'}
          </button>
        </form>
      </Modal>

      {/* ── Log mileage ─────────────────────────────────────────────────────── */}
      <Modal open={showMileageForm} onClose={() => setShowMileageForm(false)} title="Log Mileage">
        <form onSubmit={handleMileageSubmit} className="space-y-4">
          <Field label="Vehicle">
            <select required value={mileageForm.vehicleId} onChange={e => setMileageForm({ ...mileageForm, vehicleId: e.target.value })} className={sel}>
              <option value="">Select vehicle…</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.yearMakeModel}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" required value={mileageForm.date} onChange={e => setMileageForm({ ...mileageForm, date: e.target.value })} className={input} /></Field>
            <Field label="Mileage (km)"><input type="number" required value={mileageForm.recordedMileage} onChange={e => setMileageForm({ ...mileageForm, recordedMileage: e.target.value })} placeholder="0" className={input} /></Field>
          </div>
          <Field label="Notes (optional)"><input value={mileageForm.notes} onChange={e => setMileageForm({ ...mileageForm, notes: e.target.value })} className={input} /></Field>
          {mileageError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{mileageError}</p>}
          <button type="submit" disabled={mileageSubmitting} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {mileageSubmitting ? 'Saving…' : 'Save Mileage'}
          </button>
        </form>
      </Modal>

      {/* ── Record service ──────────────────────────────────────────────────── */}
      <Modal open={showMaintenanceForm} onClose={() => setShowMaintenanceForm(false)} title="Record Service">
        <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
          <Field label="Vehicle">
            <select required value={maintenanceForm.vehicleId} onChange={e => setMaintenanceForm({ ...maintenanceForm, vehicleId: e.target.value })} className={sel}>
              <option value="">Select vehicle…</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.yearMakeModel}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service date"><input type="date" required value={maintenanceForm.serviceDate} onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceDate: e.target.value })} className={input} /></Field>
            <Field label="Service type">
              <select value={maintenanceForm.serviceType} onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceType: e.target.value as ServiceType })} className={sel}>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Mileage at service (km)"><input type="number" value={maintenanceForm.recordedMileage} onChange={e => setMaintenanceForm({ ...maintenanceForm, recordedMileage: e.target.value })} placeholder="0" className={input} /></Field>
          <Field label="Notes"><input value={maintenanceForm.notes} onChange={e => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} className={input} /></Field>
          {maintenanceError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{maintenanceError}</p>}
          <button type="submit" disabled={maintenanceSubmitting} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {maintenanceSubmitting ? 'Saving…' : 'Record Service'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return <svg className={spinning ? 'animate-spin' : ''} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
}
