'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const modules = [
  {
    href: '/vehicles',
    label: 'Vehicles',
    icon: '🚜',
    desc: 'Mileage logs, service schedule',
  },
  {
    href: '/equipment',
    label: 'Equipment',
    icon: '🔧',
    desc: 'Check-out, returns, condition tracking',
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: '💰',
    desc: 'Revenue, expenses, P&L',
  },
  {
    href: '/crops',
    label: 'Crops',
    icon: '🌾',
    desc: 'Planting, harvests, paddock records',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: '⚙️',
    desc: 'Locations, Breeds, Groups, Owners',
  },
]

export default function MorePage() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">More</h1>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Vehicles · Equipment · Finance · Crops · Settings</p>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          {modules.map(({ href, label, icon, desc }) => (
            <Link key={href} href={href}
              className="flex items-center gap-4 px-4 py-4 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors">
              <span className="text-2xl w-8 text-center">{icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-zinc-900">{label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" className="text-zinc-300 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
