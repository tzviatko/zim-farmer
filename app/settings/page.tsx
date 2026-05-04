'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'

type Item = { id: string; name: string }

const input = 'w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#3B6D11]/20 bg-white'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`text-zinc-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function SectionManager({
  title,
  items,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  items: Item[]
  loading: boolean
  onAdd: (name: string) => void
  onEdit: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [nameVal, setNameVal] = useState('')

  function submitAdd() {
    if (!nameVal.trim()) return
    onAdd(nameVal.trim())
    setNameVal('')
    setAddOpen(false)
  }

  function submitEdit() {
    if (!editItem || !nameVal.trim()) return
    onEdit(editItem.id, nameVal.trim())
    setEditItem(null)
    setNameVal('')
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          {!loading && (
            <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">
              {items.length}
            </span>
          )}
        </div>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="border-t border-zinc-50">
          {loading ? (
            <div className="px-4 py-4 space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-10 bg-zinc-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {items.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">None added yet.</p>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-zinc-800">{item.name}</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditItem(item); setNameVal(item.name) }}
                          className="text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-50 cursor-pointer">
                          Edit
                        </button>
                        <button onClick={() => onDelete(item.id)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-3 border-t border-zinc-50">
                <button onClick={() => { setNameVal(''); setAddOpen(true) }}
                  className="w-full text-xs text-[#3B6D11] bg-[#3B6D11]/5 hover:bg-[#3B6D11]/10 py-2 rounded-full font-medium transition-colors cursor-pointer">
                  + Add {title.replace(/s$/, '')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`Add ${title.replace(/s$/, '')}`}>
        <div className="space-y-4">
          <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
            placeholder="Name"
            className={input}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitAdd() } }}
          />
          <button disabled={!nameVal.trim()} onClick={submitAdd}
            className="w-full bg-[#3B6D11] text-white text-sm font-medium py-3 rounded-full disabled:opacity-50 cursor-pointer">
            Add
          </button>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setNameVal('') }} title={`Edit ${title.replace(/s$/, '')}`}>
        <div className="space-y-4">
          <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
            placeholder="Name"
            className={input}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitEdit() } }}
          />
          <div className="flex gap-2">
            <button onClick={() => { setEditItem(null); setNameVal('') }}
              className="flex-1 border border-zinc-200 text-zinc-700 text-sm py-2.5 rounded-full cursor-pointer">
              Cancel
            </button>
            <button disabled={!nameVal.trim()} onClick={submitEdit}
              className="flex-1 bg-[#3B6D11] text-white text-sm font-medium py-2.5 rounded-full disabled:opacity-50 cursor-pointer">
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function SettingsPage() {
  const [isOnline, setIsOnline] = useState(true)
  const [loading, setLoading] = useState(true)

  const [locations, setLocations] = useState<Item[]>([])
  const [breeds, setBreeds] = useState<Item[]>([])
  const [groups, setGroups] = useState<Item[]>([])
  const [owners, setOwners] = useState<Item[]>([])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [locSnap, breedSnap, groupSnap, ownerSnap] = await Promise.all([
        getDocs(collection(db, 'paddocks')),
        getDocs(collection(db, 'breeds')),
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'owners')),
      ])
      const toList = (snap: typeof locSnap) =>
        snap.docs.map(d => ({ id: d.id, name: d.data().name as string })).sort((a, b) => a.name.localeCompare(b.name))
      setLocations(toList(locSnap))
      setBreeds(toList(breedSnap))
      setGroups(toList(groupSnap))
      setOwners(toList(ownerSnap))
    } catch (err) {
      console.error('Settings load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  async function addItem(collName: string, name: string, setter: React.Dispatch<React.SetStateAction<Item[]>>) {
    const ref = await addDoc(collection(db, collName), { name, createdAt: Timestamp.now().toDate().toISOString() })
    setter(prev => [...prev, { id: ref.id, name }].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function editItem(collName: string, id: string, name: string, setter: React.Dispatch<React.SetStateAction<Item[]>>) {
    await updateDoc(doc(db, collName, id), { name })
    setter(prev => prev.map(i => i.id === id ? { ...i, name } : i).sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function deleteItem(collName: string, id: string, setter: React.Dispatch<React.SetStateAction<Item[]>>) {
    await deleteDoc(doc(db, collName, id))
    setter(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Settings</h1>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3B6D11]' : 'bg-zinc-400'}`} />
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Locations · Breeds · Groups · Owners</p>
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
        <SectionManager
          title="Locations"
          items={locations}
          loading={loading}
          onAdd={name => addItem('paddocks', name, setLocations)}
          onEdit={(id, name) => editItem('paddocks', id, name, setLocations)}
          onDelete={id => deleteItem('paddocks', id, setLocations)}
        />
        <SectionManager
          title="Breeds"
          items={breeds}
          loading={loading}
          onAdd={name => addItem('breeds', name, setBreeds)}
          onEdit={(id, name) => editItem('breeds', id, name, setBreeds)}
          onDelete={id => deleteItem('breeds', id, setBreeds)}
        />
        <SectionManager
          title="Groups"
          items={groups}
          loading={loading}
          onAdd={name => addItem('groups', name, setGroups)}
          onEdit={(id, name) => editItem('groups', id, name, setGroups)}
          onDelete={id => deleteItem('groups', id, setGroups)}
        />
        <SectionManager
          title="Owners"
          items={owners}
          loading={loading}
          onAdd={name => addItem('owners', name, setOwners)}
          onEdit={(id, name) => editItem('owners', id, name, setOwners)}
          onDelete={id => deleteItem('owners', id, setOwners)}
        />

        {/* Users placeholder */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-zinc-900">Users</p>
              <span className="text-xs bg-zinc-100 text-zinc-400 px-2 py-0.5 rounded-full font-medium">Coming soon</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className="text-zinc-300 shrink-0">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
