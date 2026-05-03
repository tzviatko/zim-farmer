'use client'

import { useState, useEffect } from 'react'

export default function CropsPage() {
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
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Crops</h1>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Planting, harvests, paddock records</p>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-xs text-amber-700 text-center max-w-lg mx-auto">Offline — changes are saved locally and will sync when you reconnect.</p>
        </div>
      )}
      <div className="max-w-lg mx-auto px-4 pt-12 text-center">
        <p className="text-4xl mb-4">🌾</p>
        <p className="text-sm font-semibold text-zinc-700">Coming soon</p>
        <p className="text-xs text-zinc-400 mt-1">Crop records will be available in a future update.</p>
      </div>
    </div>
  )
}
