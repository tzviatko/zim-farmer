'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Cattle = {
  id: string
  tag: string
  breed: string
  sex: string
  paddock: string
  date_of_birth: string | null
  notes: string | null
  created_at: string
}

type FormData = {
  tag: string
  sex: string
  breed: string
  paddock: string
  date_of_birth: string
  notes: string
}

const emptyForm: FormData = {
  tag: '',
  sex: 'cow',
  breed: '',
  paddock: 'A',
  date_of_birth: '',
  notes: '',
}

export default function Home() {
  const [cattle, setCattle] = useState<Cattle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)

  async function fetchCattle() {
    const { data, error } = await supabase
      .from('cattle')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setCattle(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchCattle()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      ...form,
      date_of_birth: form.date_of_birth || null,
      notes: form.notes || null,
    }
    const { error } = await supabase.from('cattle').insert([payload])
    if (!error) {
      setShowForm(false)
      setForm(emptyForm)
      fetchCattle()
    }
    setSubmitting(false)
  }

  function closeForm() {
    setShowForm(false)
    setForm(emptyForm)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-zinc-200 px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-syne)]">
              ZIM FARMER
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">Cattle Registry</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            + Add
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-zinc-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : cattle.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-sm">No cattle recorded yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-sm text-black underline underline-offset-4 cursor-pointer"
            >
              Add your first animal
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-zinc-400 mb-4 uppercase tracking-widest">
              {cattle.length} {cattle.length === 1 ? 'animal' : 'animals'}
            </p>
            <div className="space-y-2">
              {cattle.map((animal) => (
                <div
                  key={animal.id}
                  className="border border-zinc-200 rounded-xl px-4 py-3.5 flex items-center justify-between"
                >
                  <div>
                    <span className="text-base font-medium tracking-tight font-[family-name:var(--font-dm-mono)]">
                      {animal.tag}
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5 capitalize">
                      {animal.breed} · {animal.sex} · Paddock {animal.paddock}
                    </p>
                  </div>
                  {animal.date_of_birth && (
                    <span className="text-xs text-zinc-400 font-[family-name:var(--font-dm-mono)]">
                      {new Date(animal.date_of_birth).getFullYear()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeForm()}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm tracking-tight">Add Cattle</h2>
              <button
                onClick={closeForm}
                className="text-zinc-400 hover:text-zinc-700 text-xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Tag Number
                </label>
                <input
                  required
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  placeholder="e.g. TAG-001"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm font-[family-name:var(--font-dm-mono)] focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">Sex</label>
                  <select
                    value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
                  >
                    <option value="cow">Cow</option>
                    <option value="bull">Bull</option>
                    <option value="heifer">Heifer</option>
                    <option value="steer">Steer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">Paddock</label>
                  <select
                    value={form.paddock}
                    onChange={(e) => setForm({ ...form, paddock: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 bg-white"
                  >
                    <option value="A">Paddock A</option>
                    <option value="B">Paddock B</option>
                    <option value="C">Paddock C</option>
                    <option value="D">Paddock D</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Breed</label>
                <input
                  required
                  value={form.breed}
                  onChange={(e) => setForm({ ...form, breed: e.target.value })}
                  placeholder="e.g. Angus, Hereford"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-black text-white text-sm font-medium py-2.5 rounded-full hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving…' : 'Save Animal'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
