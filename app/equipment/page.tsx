'use client'

import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import { Equipment, EquipmentCondition, EquipmentStatus, EquipmentType, EquipmentUseLog } from '../../lib/types'

type Staff = { id: string; fullName: string }
type Location = { id: string; name: string }

const CONDITIONS: EquipmentCondition[] = ['Good', 'Needs Attention', 'Poor']
const STATUSES: EquipmentStatus[] = ['In Service', 'In Use', 'Minimal Usage only']
const TYPES: EquipmentType[] = ['AMV', 'Personal']

const COND_CLASS: Record<EquipmentCondition, string> = {
  'Good':           'bg-green-50 text-green-700',
  'Needs Attention':'bg-amber-50 text-amber-700',
  'Poor':           'bg-red-50 text-red-600',
}

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'
const sel = input

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-zinc-800 mb-1.5">{label}</label>{children}</div>
}

function today() { return new Date().toISOString().slice(0, 10) }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [useLogs, setUseLogs] = useState<EquipmentUseLog[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)

  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)

  const [showEquipForm, setShowEquipForm] = useState(false)
  const [editEquipId, setEditEquipId] = useState<string | null>(null)
  const [equipForm, setEquipForm] = useState({ name: '', description: '', condition: 'Good' as EquipmentCondition, quantity: '', locationId: '', status: 'In Service' as EquipmentStatus, type: 'AMV' as EquipmentType })
  const [equipSubmitting, setEquipSubmitting] = useState(false)
  const [equipError, setEquipError] = useState<string | null>(null)

  const [showCheckoutForm, setShowCheckoutForm] = useState(false)
  const [checkoutForm, setCheckoutForm] = useState({ equipmentId: '', reason: '', givenToId: '', checkoutTime: `${today()} ${nowTime()}`, date: today() })
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const [showReturnForm, setShowReturnForm] = useState(false)
  const [selectedLog, setSelectedLog] = useState<EquipmentUseLog | null>(null)
  const [returnForm, setReturnForm] = useState({ returnedById: '', returnTime: `${today()} ${nowTime()}`, returnedCondition: 'Good' as EquipmentCondition })
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true); const down = () => setIsOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      const [equipSnap, logSnap, staffSnap, locSnap] = await Promise.all([
        getDocs(query(collection(db, 'equipment'), where('active', '==', true))),
        getDocs(collection(db, 'equipment_use_log')),
        getDocs(query(collection(db, 'staff'), where('active', '==', true))),
        getDocs(collection(db, 'paddocks')),
      ])

      setStaff(staffSnap.docs.map(d => ({ id: d.id, fullName: d.data().fullName as string })).sort((a, b) => a.fullName.localeCompare(b.fullName)))
      setLocations(locSnap.docs.map(d => ({ id: d.id, name: d.data().name as string })))

      setUseLogs(logSnap.docs.map(d => ({
        id: d.id,
        equipmentId: d.data().equipmentId as string,
        date: d.data().date as string,
        reasonForUse: d.data().reasonForUse as string | null,
        givenToId: d.data().givenToId as string | null,
        checkoutTime: d.data().checkoutTime as string | null,
        returnedById: d.data().returnedById as string | null,
        returnTime: d.data().returnTime as string | null,
        returnedCondition: d.data().returnedCondition as EquipmentCondition | null,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => b.date.localeCompare(a.date)))

      setEquipment(equipSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name as string,
        description: d.data().description as string | null,
        condition: d.data().condition as EquipmentCondition | null,
        quantity: d.data().quantity as number | null,
        locationId: d.data().locationId as string | null,
        status: d.data().status as EquipmentStatus | null,
        type: d.data().type as EquipmentType | null,
        active: true,
        createdAt: d.data().createdAt as string ?? '',
      })).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const equipmentLogs = useMemo(() =>
    selectedEquipment ? useLogs.filter(l => l.equipmentId === selectedEquipment.id) : [],
    [useLogs, selectedEquipment]
  )

  const staffMap = useMemo(() => new Map(staff.map(s => [s.id, s.fullName])), [staff])
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleEquipSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: equipForm.name,
      description: equipForm.description || null,
      condition: equipForm.condition,
      quantity: equipForm.quantity ? parseFloat(equipForm.quantity) : null,
      locationId: equipForm.locationId || null,
      status: equipForm.status,
      type: equipForm.type,
      active: true,
    }
    if (editEquipId) {
      updateDoc(doc(db, 'equipment', editEquipId), payload).catch(console.error)
    } else {
      addDoc(collection(db, 'equipment'), { ...payload, createdAt: Timestamp.now().toDate().toISOString() }).catch(console.error)
    }
    setShowEquipForm(false)
    fetchAll(true)
  }

  function handleCheckout(e: React.FormEvent) {
    e.preventDefault()
    addDoc(collection(db, 'equipment_use_log'), {
      equipmentId: checkoutForm.equipmentId,
      date: checkoutForm.date,
      reasonForUse: checkoutForm.reason || null,
      givenToId: checkoutForm.givenToId || null,
      checkoutTime: checkoutForm.checkoutTime || null,
      returnedById: null,
      returnTime: null,
      returnedCondition: null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setShowCheckoutForm(false)
    fetchAll(true)
  }

  function handleReturn() {
    if (!selectedLog) return
    updateDoc(doc(db, 'equipment_use_log', selectedLog.id), {
      returnedById: returnForm.returnedById || null,
      returnTime: returnForm.returnTime || null,
      returnedCondition: returnForm.returnedCondition,
    }).catch(console.error)
    setShowReturnForm(false)
    setSelectedLog(null)
    fetchAll(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">Equipment</h1>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Check-out · Returns · Condition tracking</p>
          </div>
          <button onClick={() => { setCheckoutForm({ equipmentId: '', reason: '', givenToId: '', checkoutTime: `${today()} ${nowTime()}`, date: today() }); setShowCheckoutForm(true) }}
            className="text-xs bg-[#3B6D11]/10 text-[#3B6D11] px-3 py-1.5 rounded-full font-medium cursor-pointer hover:bg-[#3B6D11]/20 transition-colors">Check Out</button>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-2">
        {loading ? [...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-zinc-100" />) :
          equipment.length === 0 ? <p className="text-center text-zinc-400 text-sm py-16">No equipment recorded yet.</p> :
          equipment.map(e => {
            const openLogs = useLogs.filter(l => l.equipmentId === e.id && !l.returnTime)
            const isInUse = openLogs.length > 0
            return (
              <button key={e.id} onClick={() => setSelectedEquipment(e)}
                className="w-full bg-white rounded-2xl border border-zinc-100 px-4 py-3.5 text-left shadow-sm hover:shadow-md hover:border-zinc-300 active:scale-[0.99] transition-all cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 text-sm">{e.name}</span>
                      {e.type && <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{e.type}</span>}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">{[locationMap.get(e.locationId ?? '') ?? null, e.quantity ? `Qty: ${e.quantity}` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isInUse && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">In Use</span>}
                    {e.condition && <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${COND_CLASS[e.condition]}`}>{e.condition}</span>}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </div>
              </button>
            )
          })
        }
      </div>

      {/* FAB */}
      <button onClick={() => { setEquipForm({ name: '', description: '', condition: 'Good', quantity: '', locationId: '', status: 'In Service', type: 'AMV' }); setEditEquipId(null); setEquipError(null); setShowEquipForm(true) }}
        className="fixed bottom-[106px] right-4 w-14 h-14 bg-[#3B6D11] rounded-full shadow-xl flex items-center justify-center text-white z-30 hover:bg-[#2d5409] active:scale-95 transition-all cursor-pointer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {/* ── Equipment detail ──────────────────────────────────────────────── */}
      <Modal open={!!selectedEquipment} onClose={() => setSelectedEquipment(null)} title={selectedEquipment?.name ?? ''}>
        {selectedEquipment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {selectedEquipment.condition && <div className="bg-zinc-50 rounded-xl p-3 text-center"><p className={`text-xs font-medium ${COND_CLASS[selectedEquipment.condition]}`}>{selectedEquipment.condition}</p><p className="text-[10px] text-zinc-400 mt-0.5">Condition</p></div>}
              {selectedEquipment.status && <div className="bg-zinc-50 rounded-xl p-3 text-center"><p className="text-xs font-medium text-zinc-700">{selectedEquipment.status}</p><p className="text-[10px] text-zinc-400 mt-0.5">Status</p></div>}
            </div>
            {selectedEquipment.description && <p className="text-sm text-zinc-600">{selectedEquipment.description}</p>}

            <div className="flex gap-2">
              <button onClick={() => { setCheckoutForm({ equipmentId: selectedEquipment.id, reason: '', givenToId: '', checkoutTime: `${today()} ${nowTime()}`, date: today() }); setSelectedEquipment(null); setShowCheckoutForm(true) }}
                className="flex-1 bg-[#3B6D11]/10 text-[#3B6D11] text-sm font-medium py-2.5 rounded-full cursor-pointer hover:bg-[#3B6D11]/20 transition-colors">Check Out</button>
              <button onClick={() => { setEquipForm({ name: selectedEquipment.name, description: selectedEquipment.description ?? '', condition: selectedEquipment.condition ?? 'Good', quantity: selectedEquipment.quantity?.toString() ?? '', locationId: selectedEquipment.locationId ?? '', status: selectedEquipment.status ?? 'In Service', type: selectedEquipment.type ?? 'AMV' }); setEditEquipId(selectedEquipment.id); setEquipError(null); setSelectedEquipment(null); setShowEquipForm(true) }}
                className="px-4 border border-zinc-200 text-zinc-600 text-sm py-2.5 rounded-full cursor-pointer hover:bg-zinc-50 transition-colors">Edit</button>
            </div>

            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Usage Log</p>
            {equipmentLogs.length === 0 ? <p className="text-sm text-zinc-400 text-center py-4">No usage recorded.</p> :
              equipmentLogs.slice(0, 10).map(l => (
                <div key={l.id} className="bg-zinc-50 rounded-xl px-3 py-2.5 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-zinc-900">{l.reasonForUse ?? 'Used'}</span>
                    <span className="text-xs text-zinc-400">{l.date}</span>
                  </div>
                  {l.givenToId && <p className="text-xs text-zinc-500">Given to: {staffMap.get(l.givenToId) ?? l.givenToId}</p>}
                  {l.returnTime ? (
                    <p className="text-xs text-green-600">Returned · Condition: {l.returnedCondition}</p>
                  ) : (
                    <button onClick={() => { setSelectedLog(l); setReturnForm({ returnedById: '', returnTime: `${today()} ${nowTime()}`, returnedCondition: 'Good' }); setSelectedEquipment(null); setShowReturnForm(true) }}
                      className="text-xs text-amber-600 font-medium cursor-pointer">⚠ Mark returned</button>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </Modal>

      {/* ── Add/edit equipment ───────────────────────────────────────────────── */}
      <Modal open={showEquipForm} onClose={() => setShowEquipForm(false)} title={editEquipId ? 'Edit Equipment' : 'Add Equipment'}>
        <form onSubmit={handleEquipSubmit} className="space-y-4">
          <Field label="Name"><input required value={equipForm.name} onChange={e => setEquipForm({ ...equipForm, name: e.target.value })} className={input} /></Field>
          <Field label="Description"><input value={equipForm.description} onChange={e => setEquipForm({ ...equipForm, description: e.target.value })} className={input} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <select value={equipForm.condition} onChange={e => setEquipForm({ ...equipForm, condition: e.target.value as EquipmentCondition })} className={sel}>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={equipForm.status} onChange={e => setEquipForm({ ...equipForm, status: e.target.value as EquipmentStatus })} className={sel}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={equipForm.type} onChange={e => setEquipForm({ ...equipForm, type: e.target.value as EquipmentType })} className={sel}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Quantity"><input type="number" value={equipForm.quantity} onChange={e => setEquipForm({ ...equipForm, quantity: e.target.value })} className={input} /></Field>
          </div>
          <Field label="Location">
            <select value={equipForm.locationId} onChange={e => setEquipForm({ ...equipForm, locationId: e.target.value })} className={sel}>
              <option value="">None</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          {equipError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{equipError}</p>}
          <button type="submit" disabled={equipSubmitting} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {equipSubmitting ? 'Saving…' : editEquipId ? 'Save Changes' : 'Add Equipment'}
          </button>
        </form>
      </Modal>

      {/* ── Checkout form ─────────────────────────────────────────────────── */}
      <Modal open={showCheckoutForm} onClose={() => setShowCheckoutForm(false)} title="Check Out Equipment">
        <form onSubmit={handleCheckout} className="space-y-4">
          <Field label="Equipment">
            <select required value={checkoutForm.equipmentId} onChange={e => setCheckoutForm({ ...checkoutForm, equipmentId: e.target.value })} className={sel}>
              <option value="">Select…</option>
              {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" required value={checkoutForm.date} onChange={e => setCheckoutForm({ ...checkoutForm, date: e.target.value })} className={input} /></Field>
          <Field label="Reason for use"><input value={checkoutForm.reason} onChange={e => setCheckoutForm({ ...checkoutForm, reason: e.target.value })} placeholder="e.g. Field work" className={input} /></Field>
          <Field label="Given to">
            <select value={checkoutForm.givenToId} onChange={e => setCheckoutForm({ ...checkoutForm, givenToId: e.target.value })} className={sel}>
              <option value="">Select staff…</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </Field>
          {checkoutError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{checkoutError}</p>}
          <button type="submit" disabled={checkoutSubmitting} className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {checkoutSubmitting ? 'Saving…' : 'Record Check Out'}
          </button>
        </form>
      </Modal>

      {/* ── Return form ───────────────────────────────────────────────────── */}
      <Modal open={showReturnForm} onClose={() => setShowReturnForm(false)} title="Record Return">
        <div className="space-y-4">
          <Field label="Returned by">
            <select value={returnForm.returnedById} onChange={e => setReturnForm({ ...returnForm, returnedById: e.target.value })} className={sel}>
              <option value="">Select staff…</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </Field>
          <Field label="Condition on return">
            <select value={returnForm.returnedCondition} onChange={e => setReturnForm({ ...returnForm, returnedCondition: e.target.value as EquipmentCondition })} className={sel}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <button onClick={handleReturn} disabled={returnSubmitting}
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full hover:bg-[#2d5409] transition-colors disabled:opacity-50 cursor-pointer">
            {returnSubmitting ? 'Saving…' : 'Record Return'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
