import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

let prefetched = false

// Silently warm the Firestore IndexedDB cache for every collection used across
// the app. Called once per session from the dashboard after its own data loads.
// This ensures all pages have offline data even if never visited while online.
export async function prefetchAllCollections() {
  if (prefetched || !navigator.onLine) return
  prefetched = true

  const collections = [
    // Livestock page (cattle + dip already fetched by dashboard)
    getDocs(collection(db, 'weight_records')),
    getDocs(collection(db, 'vaccination_records')),
    getDocs(collection(db, 'status_changes')),

    // Shared reference data
    getDocs(collection(db, 'paddocks')),

    // HR page (staff already fetched by dashboard)
    getDocs(collection(db, 'loan_records')),
    getDocs(collection(db, 'salary_payments')),
    getDocs(collection(db, 'safety_equipment_given')),

    // Equipment page
    getDocs(query(collection(db, 'equipment'), where('active', '==', true))),
    getDocs(collection(db, 'equipment_use_log')),

    // Finance page
    getDocs(collection(db, 'revenue_entries')),
    getDocs(collection(db, 'expense_entries')),
  ]

  await Promise.allSettled(collections)
}
