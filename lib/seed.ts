import {
  collection,
  addDoc,
  getDocs,
  query,
  limit,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// Call seedTestData() from the browser console or a dev button to populate
// the database with sample paddocks, cattle, and dipping records.
export async function seedTestData() {
  // Guard: don't seed if cattle already exist
  const existing = await getDocs(query(collection(db, 'cattle'), limit(1)))
  if (!existing.empty) {
    console.log('Database already has data — skipping seed.')
    return
  }

  // 1. Paddocks
  const paddockRefs = await Promise.all([
    addDoc(collection(db, 'paddocks'), { name: 'North Paddock' }),
    addDoc(collection(db, 'paddocks'), { name: 'South Paddock' }),
    addDoc(collection(db, 'paddocks'), { name: 'River Paddock' }),
    addDoc(collection(db, 'paddocks'), { name: 'Home Paddock' }),
  ])

  const [north, south, river, home] = paddockRefs

  // Helper: ISO date string N days ago
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }

  // 2. Cattle with dipping records
  const cattleData = [
    { tag: 'ZF-001', sex: 'cow',    breed: 'Brahman',  paddock_id: north.id, dob: '2019-03-15', dippedDaysAgo: 5 },
    { tag: 'ZF-002', sex: 'bull',   breed: 'Hereford', paddock_id: south.id, dob: '2018-07-22', dippedDaysAgo: 18 },
    { tag: 'ZF-003', sex: 'cow',    breed: 'Nguni',    paddock_id: north.id, dob: '2020-01-10', dippedDaysAgo: 3 },
    { tag: 'ZF-004', sex: 'heifer', breed: 'Brahman',  paddock_id: river.id, dob: '2022-09-05', dippedDaysAgo: 25 },
    { tag: 'ZF-005', sex: 'steer',  breed: 'Angus',    paddock_id: river.id, dob: '2022-11-20', dippedDaysAgo: 12 },
    { tag: 'ZF-006', sex: 'cow',    breed: 'Nguni',    paddock_id: home.id,  dob: '2019-06-18', dippedDaysAgo: 8 },
    { tag: 'ZF-007', sex: 'bull',   breed: 'Brahman',  paddock_id: south.id, dob: '2017-04-30', dippedDaysAgo: null },
    { tag: 'ZF-008', sex: 'heifer', breed: 'Hereford', paddock_id: home.id,  dob: '2023-02-14', dippedDaysAgo: 30 },
    { tag: 'ZF-009', sex: 'steer',  breed: 'Nguni',    paddock_id: north.id, dob: '2023-05-07', dippedDaysAgo: 7 },
    { tag: 'ZF-010', sex: 'cow',    breed: 'Angus',    paddock_id: south.id, dob: '2020-08-12', dippedDaysAgo: 16 },
  ]

  for (const animal of cattleData) {
    const { dippedDaysAgo, ...fields } = animal
    const cattleRef = await addDoc(collection(db, 'cattle'), {
      ...fields,
      breed: fields.breed ?? null,
      notes: null,
      active: true,
      created_at: Timestamp.now(),
    })

    if (dippedDaysAgo !== null) {
      await addDoc(collection(db, 'cattle', cattleRef.id, 'dipping_records'), {
        session_date: daysAgo(dippedDaysAgo),
      })
    }
  }

  console.log('Seed complete: 4 paddocks, 10 cattle.')
}
