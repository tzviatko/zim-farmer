'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { computeAnimalType, getDipStatus } from '../lib/types'
import { seedTestData } from '../lib/seed'
import { prefetchAllCollections } from '../lib/prefetch'

type Stats = {
  animals: number
  active: number
  inCalf: number
  sold: number
  lost: number
  deceased: number
  dipOverdue: number
  staff: number
  inventoryAlerts: number
  vehicles: number
  vehicleAlerts: number
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
        const [cattleSnap, dipSnap, staffSnap, inventorySnap, txSnap, vehicleSnap, mileageSnap, maintenanceSnap] =
          await Promise.all([
            getDocs(query(collection(db, 'cattle'), where('active', '==', true))),
            getDocs(collection(db, 'dip_records')),
            getDocs(query(collection(db, 'staff'), where('active', '==', true))),
            getDocs(query(collection(db, 'inventory_items'), where('active', '==', true))),
            getDocs(collection(db, 'inventory_transactions')),
            getDocs(query(collection(db, 'vehicles'), where('active', '==', true))),
            getDocs(collection(db, 'mileage_logs')),
            getDocs(collection(db, 'maintenance_records')),
          ])

        // Last dip per animal
        const lastDip = new Map<string, string>()
        dipSnap.docs.forEach(d => {
          const data = d.data()
          const animalId = data.animalId as string
          const date = data.date as string
          if (!lastDip.has(animalId) || date > lastDip.get(animalId)!) lastDip.set(animalId, date)
        })

        const animals = cattleSnap.docs
        let active = 0, inCalf = 0, sold = 0, lost = 0, deceased = 0, dipOverdue = 0
        animals.forEach(d => {
          const data = d.data()
          const status = (data.status ?? (data.active ? 'active' : 'sold')) as string
          if (status === 'active') active++
          if (status === 'in_calf') inCalf++
          if (status === 'sold') sold++
          if (status === 'lost') lost++
          if (status === 'deceased') deceased++
          const dipStatus = getDipStatus(lastDip.get(d.id) ?? null)
          if (dipStatus === 'overdue') dipOverdue++
        })

        // Inventory alerts
        const balanceMap = new Map<string, number>()
        txSnap.docs.forEach(d => {
          const data = d.data()
          const itemId = data.itemId as string
          const delta = (data.quantityIn ?? 0) - (data.quantityOut ?? 0)
          balanceMap.set(itemId, (balanceMap.get(itemId) ?? 0) + delta)
        })
        let inventoryAlerts = 0
        inventorySnap.docs.forEach(d => {
          const data = d.data()
          const parLevel = data.parLevel as number | null
          if (!parLevel) return
          const bal = balanceMap.get(d.id) ?? 0
          if (bal <= parLevel) inventoryAlerts++
        })

        // Vehicle service alerts
        const mileageByVehicle = new Map<string, number>()
        mileageSnap.docs.forEach(d => {
          const data = d.data()
          const vid = data.vehicleId as string
          const m = data.recordedMileage as number
          if (m > (mileageByVehicle.get(vid) ?? 0)) mileageByVehicle.set(vid, m)
        })
        const maintenanceByVehicle = new Map<string, { type: string; mileage: number }[]>()
        maintenanceSnap.docs.forEach(d => {
          const data = d.data()
          const vid = data.vehicleId as string
          const list = maintenanceByVehicle.get(vid) ?? []
          list.push({ type: data.serviceType as string, mileage: data.recordedMileage as number })
          maintenanceByVehicle.set(vid, list)
        })
        let vehicleAlerts = 0
        vehicleSnap.docs.forEach(d => {
          const data = d.data()
          const currentMileage = mileageByVehicle.get(d.id) ?? 0
          const interval = (data.serviceIntervalKm as number) ?? 10000
          const mainRecords = maintenanceByVehicle.get(d.id) ?? []
          const fullServices = mainRecords
            .filter(r => r.type === 'Full Service' && r.mileage)
            .map(r => r.mileage)
            .sort((a, b) => b - a)
          const lastService = fullServices[0] ?? 0
          const nextService = lastService + interval
          if (currentMileage >= nextService - 500) vehicleAlerts++
        })

        setStats({
          animals: animals.length,
          active,
          inCalf,
          sold,
          lost,
          deceased,
          dipOverdue,
          staff: staffSnap.size,
          inventoryAlerts,
          vehicles: vehicleSnap.size,
          vehicleAlerts,
        })

        // Warm the cache for all other pages in the background so they're
        // available offline even if never visited while online
        prefetchAllCollections().catch(() => {})
      } catch (err) {
        console.error('Dashboard load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      {/* Header */}
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

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Module cards */}
        <div className="grid grid-cols-2 gap-3">
          <ModuleCard
            href="/livestock"
            label="Livestock"
            icon="🐄"
            primary={loading ? '—' : String(stats!.animals)}
            sub={loading ? '' : [
              stats!.active > 0 && `${stats!.active} active`,
              stats!.inCalf > 0 && `${stats!.inCalf} in calf`,
              stats!.sold > 0 && `${stats!.sold} sold`,
              stats!.lost > 0 && `${stats!.lost} lost`,
              stats!.deceased > 0 && `${stats!.deceased} deceased`,
            ].filter(Boolean).join(' · ')}
            alert={!loading && stats!.dipOverdue > 0 ? `${stats!.dipOverdue} dip overdue` : null}
          />
          <ModuleCard
            href="/inventory"
            label="Inventory"
            icon="📦"
            primary={loading ? '—' : `${stats!.inventoryAlerts}`}
            sub={loading ? '' : stats!.inventoryAlerts === 1 ? '1 item low stock' : stats!.inventoryAlerts > 0 ? `${stats!.inventoryAlerts} items low stock` : 'all stocked'}
            alert={!loading && stats!.inventoryAlerts > 0 ? 'Low stock' : null}
          />
          <ModuleCard
            href="/hr"
            label="Staff"
            icon="👷"
            primary={loading ? '—' : String(stats!.staff)}
            sub="active staff"
            alert={null}
          />
          <ModuleCard
            href="/vehicles"
            label="Vehicles"
            icon="🚜"
            primary={loading ? '—' : String(stats!.vehicles)}
            sub={loading ? '' : stats!.vehicleAlerts > 0 ? `${stats!.vehicleAlerts} service due` : 'all up to date'}
            alert={!loading && stats!.vehicleAlerts > 0 ? `${stats!.vehicleAlerts} service due` : null}
          />
        </div>

        {/* Quick nav */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <p className="text-xs text-zinc-400 uppercase tracking-widest px-4 pt-4 pb-2">Quick access</p>
          {[
            { href: '/livestock', label: 'Livestock registry', desc: 'Animals, dips, vaccinations, weights' },
            { href: '/inventory', label: 'Inventory', desc: 'Salt, diesel, feed — In/Out log' },
            { href: '/hr', label: 'Staff & HR', desc: 'Salary, loans, safety equipment' },
            { href: '/more', label: 'Equipment & Vehicles', desc: 'Usage logs, service schedule' },
            { href: '/finance', label: 'Finance', desc: 'Revenue & expenses' },
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href}
              className="flex items-center justify-between px-4 py-3.5 border-t border-zinc-50 hover:bg-zinc-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-zinc-900">{label}</p>
                <p className="text-xs text-zinc-400">{desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" className="text-zinc-300">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </div>

        {/* Dev seed — only shown in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-center pb-2">
            <button
              onClick={async () => {
                await seedTestData()
                window.location.reload()
              }}
              className="text-xs text-zinc-300 underline">
              Seed sample data
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModuleCard({
  href, label, icon, primary, sub, alert,
}: {
  href: string; label: string; icon: string; primary: string; sub: string; alert: string | null
}) {
  return (
    <Link href={href}
      className="bg-white rounded-2xl border border-zinc-100 p-4 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all block">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {alert && (
          <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{alert}</span>
        )}
      </div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{primary}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1">{sub}</p>}
    </Link>
  )
}
