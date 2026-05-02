'use client'

export default function CropsPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Crops</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Planting, harvests, paddock records</p>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 pt-12 text-center">
        <p className="text-4xl mb-4">🌾</p>
        <p className="text-sm font-semibold text-zinc-700">Coming soon</p>
        <p className="text-xs text-zinc-400 mt-1">Crop records will be available in a future update.</p>
      </div>
    </div>
  )
}
