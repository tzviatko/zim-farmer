'use client'

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
    href: '/locations',
    label: 'Locations',
    icon: '📍',
    desc: 'Paddocks, camps, sites',
  },
]

export default function MorePage() {
  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">More</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Equipment · Vehicles · Finance · Crops · Locations</p>
        </div>
      </header>

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
