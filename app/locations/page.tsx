'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'

interface Location {
  id: string
  name: string
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  async function load() {
    const snap = await getDocs(collection(db, 'paddocks'))
    setLocations(snap.docs.map(d => ({ id: d.id, name: d.data().name as string }))
      .sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function save() {
    if (!name.trim()) return
    addDoc(collection(db, 'paddocks'), {
      name: name.trim(),
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setName('')
    setAddOpen(false)
    load()
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Locations</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Paddocks, camps, sites</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        <button onClick={() => setAddOpen(true)}
          className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold">
          + Add Location
        </button>

        {!loading && locations.length === 0 && (
          <p className="text-center text-sm text-zinc-400 py-8">No locations yet.</p>
        )}

        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          {locations.map((loc, i) => (
            <div key={loc.id}
              className={`px-4 py-3.5 flex items-center gap-3 ${i > 0 ? 'border-t border-zinc-50' : ''}`}>
              <span className="text-lg">📍</span>
              <p className="text-sm font-medium text-zinc-900">{loc.name}</p>
            </div>
          ))}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Location">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Location name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              placeholder="e.g. North Camp" />
          </div>
          <button onClick={save} disabled={!name.trim()}
            className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
            Add Location
          </button>
        </div>
      </Modal>
    </div>
  )
}
