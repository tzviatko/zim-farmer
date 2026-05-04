'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getDipStatus, computeNextServiceMileage, getServiceStatus } from '../lib/types'
import { seedTestData, clearAndReseedCattle } from '../lib/seed'
import { prefetchAllCollections } from '../lib/prefetch'

type Stats = {
  livestock: number
  dipOverdue: number
  inputsTotal: number
  inputsLowStock: number
  staff: number
  staffSalaryTotal: number
  vehicles: number
  vehicleServiceNeeded: number
  equipmentTotal: number
  equipmentInUse: number
  cropTypes: number
}

function daysUntilFirst(): number {
  const now = new Date()
  const next1st = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.round((next1st.getTime() - now.getTime()) / 86_400_000)
}

function currentMonthPrefix(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const monthPrefix = currentMonthPrefix()

        const [
          cattleSnap, staffSnap, inventorySnap, txSnap,
          vehicleSnap, equipmentSnap, equipUseSnap,
          cropsSnap,
          dipSnap, mileageSnap, maintenanceSnap,
        ] = await Promise.all([
          getDocs(query(collection(db, 'cattle'), where('active', '==', true))),
          getDocs(query(collection(db, 'staff'), where('active', '==', true))),
          getDocs(query(collection(db, 'inventory_items'), where('active', '==', true))),
          getDocs(collection(db, 'inventory_transactions')),
          getDocs(query(collection(db, 'vehicles'), where('active', '==', true))),
          getDocs(query(collection(db, 'equipment'), where('active', '==', true))),
          getDocs(collection(db, 'equipment_use_log')),
          getDocs(collection(db, 'crops')),
          getDocs(collection(db, 'dip_records')),
          getDocs(collection(db, 'mileage_logs')),
          getDocs(collection(db, 'maintenance_records')),
        ])

        const ARCHIVED_STATUSES = new Set(['sold', 'lost', 'deceased'])
        let livestock = 0
        cattleSnap.docs.forEach(d => {
          const status = (d.data().status ?? 'active') as string
          if (!ARCHIVED_STATUSES.has(status)) livestock++
        })

        const lastDipMap = new Map<string, string>()
        dipSnap.docs.forEach(d => {
          const data = d.data()
          const aid = data.animalId as string
          const date = data.date as string
          if (!lastDipMap.has(aid) || date > lastDipMap.get(aid)!) lastDipMap.set(aid, date)
        })
        let dipOverdue = 0
        cattleSnap.docs.forEach(d => {
          const status = (d.data().status ?? 'active') as string
          if (ARCHIVED_STATUSES.has(status)) return
          const lastDip = lastDipMap.get(d.id) ?? null
          if (getDipStatus(lastDip) === 'overdue') dipOverdue++
        })

        const vehicleMileageMap = new Map<string, number>()
        mileageSnap.docs.forEach(d => {
          const data = d.data()
          const vid = data.vehicleId as string
          const km = data.recordedMileage as number
          if (km > (vehicleMileageMap.get(vid) ?? -Infinity)) vehicleMileageMap.set(vid, km)
        })
        const vehicleMaintMap = new Map<string, Array<{ serviceType: string; recordedMileage: number | null }>>()
        maintenanceSnap.docs.forEach(d => {
          const data = d.data()
          const vid = data.vehicleId as string
          if (!vehicleMaintMap.has(vid)) vehicleMaintMap.set(vid, [])
          vehicleMaintMap.get(vid)!.push({ serviceType: data.serviceType as string, recordedMileage: data.recordedMileage as number | null })
        })
        let vehicleServiceNeeded = 0
        vehicleSnap.docs.forEach(d => {
          const data = d.data()
          const intervalKm = data.serviceIntervalKm as number | null
          if (!intervalKm) return
          const currentKm = vehicleMileageMap.get(d.id) ?? 0
          const maint = (vehicleMaintMap.get(d.id) ?? []).map(r => ({
            id: '', vehicleId: d.id, serviceDate: '', notes: null, createdAt: '',
            serviceType: r.serviceType as import('../lib/types').ServiceType,
            recordedMileage: r.recordedMileage,
          }))
          const nextKm = computeNextServiceMileage(currentKm, intervalKm, maint)
          const status = getServiceStatus(currentKm, nextKm)
          if (status === 'overdue' || status === 'soon') vehicleServiceNeeded++
        })

        const balanceMap = new Map<string, number>()
        txSnap.docs.forEach(d => {
          const data = d.data()
          balanceMap.set(data.itemId as string,
            (balanceMap.get(data.itemId as string) ?? 0) + (data.quantityIn ?? 0) - (data.quantityOut ?? 0))
        })
        let inputsLowStock = 0
        inventorySnap.docs.forEach(d => {
          const parLevel = d.data().parLevel as number | null
          if (!parLevel) return
          if ((balanceMap.get(d.id) ?? 0) <= parLevel) inputsLowStock++
        })

        let staffSalaryTotal = 0
        staffSnap.docs.forEach(d => {
          staffSalaryTotal += (d.data().salary as number | null) ?? 0
        })

        const inUseSet = new Set<string>()
        equipUseSnap.docs.forEach(d => {
          const data = d.data()
          if (!data.returnTime) inUseSet.add(data.equipmentId as string)
        })

        const cropTypeSet = new Set<string>()
        cropsSnap.docs.forEach(d => {
          const t = d.data().type as string | undefined
          if (t) cropTypeSet.add(t)
        })

        setStats({
          livestock,
          dipOverdue,
          inputsTotal: inventorySnap.size,
          inputsLowStock,
          staff: staffSnap.size,
          staffSalaryTotal,
          vehicles: vehicleSnap.size,
          vehicleServiceNeeded,
          equipmentTotal: equipmentSnap.size,
          equipmentInUse: inUseSet.size,
          cropTypes: cropTypeSet.size,
        })

        prefetchAllCollections().catch(() => {})
      } catch (err) {
        console.error('Dashboard load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const daysLeft = daysUntilFirst()
  const fmt$ = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">ZIM FARMER</h1>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Farm overview</p>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">
            Offline — changes are saved locally and will sync when you reconnect.
          </p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* Primary stat cards — 6 items */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard href="/livestock" label="Livestock" icon="🐄"
            primary={loading ? '—' : String(stats!.livestock)}
            alert={!loading && stats!.dipOverdue > 0 ? `${stats!.dipOverdue} dip overdue` : null} />

          <StatCard href="/inventory" label="Inputs" icon="📦"
            primary={loading ? '—' : String(stats!.inputsTotal)}
            alert={!loading && stats!.inputsLowStock > 0 ? `${stats!.inputsLowStock} low stock` : null} />

          <StatCard href="/hr" label="Staff" icon="👷"
            primary={loading ? '—' : String(stats!.staff)}
            alert={!loading && stats!.staff > 0 ? `${fmt$(stats!.staffSalaryTotal)} due in ${daysLeft}d` : null} />

          <StatCard href="/vehicles" label="Vehicles" icon="🚜"
            primary={loading ? '—' : String(stats!.vehicles)}
            alert={!loading && stats!.vehicleServiceNeeded > 0 ? `${stats!.vehicleServiceNeeded} need service` : null} />

          <StatCard href="/equipment" label="Equipment" icon="🔧"
            primary={loading ? '—' : String(stats!.equipmentTotal)}
            alert={!loading && stats!.equipmentInUse > 0 ? `${stats!.equipmentInUse} in use` : null} />

          <StatCard href="/crops" label="Crops" icon="🌾"
            primary={loading ? '—' : String(stats!.cropTypes)}
            alert={null} />
        </div>

        {/* Plain navigation cards — Finance & Settings */}
        <div className="grid grid-cols-2 gap-3">
          <NavCard href="/finance" label="Finance" icon="💰" />
          <NavCard href="/settings" label="Settings" icon="⚙️" />
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="text-center pb-2">
            <button
              onClick={async () => { await seedTestData(); window.location.reload() }}
              className="text-xs text-zinc-300 underline">
              Seed sample data
            </button>
          </div>
        )}
        <div className="text-center mt-2 pb-4">
          <button
            onClick={async () => {
              if (!confirm('This will delete all cattle, dip records, and weight records, then reseed 212 animals. Continue?')) return
              await clearAndReseedCattle()
              window.location.reload()
            }}
            className="text-xs text-amber-400 underline">
            Clear &amp; reseed cattle
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  href, label, icon, primary, alert,
}: {
  href: string
  label: string
  icon: string
  primary: string
  alert: string | null
}) {
  return (
    <Link href={href}
      className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all block">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {alert && (
          <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium leading-tight text-right max-w-[80px] break-words">
            {alert}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{primary}</p>
    </Link>
  )
}

function NavCard({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href}
      className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-semibold text-zinc-700">{label}</span>
    </Link>
  )
}
