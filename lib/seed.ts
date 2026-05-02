import {
  collection,
  addDoc,
  getDocs,
  query,
  limit,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const isEmpty = async (coll: string) =>
  (await getDocs(query(collection(db, coll), limit(1)))).empty

// Call seedTestData() from the dev button on the dashboard.
// Each module is checked independently — already-populated collections are skipped.
export async function seedTestData() {
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const now = () => Timestamp.now().toDate().toISOString()
  const thisMonth = new Date().toISOString().slice(0, 7)
  const lastMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7)
  })()

  // ── Paddocks (always ensure at least 4 exist) ────────────────────────────────
  let north: { id: string }, south: { id: string }, river: { id: string }, home: { id: string }
  if (await isEmpty('paddocks')) {
    ;[north, south, river, home] = await Promise.all([
      addDoc(collection(db, 'paddocks'), { name: 'North Camp' }),
      addDoc(collection(db, 'paddocks'), { name: 'South Camp' }),
      addDoc(collection(db, 'paddocks'), { name: 'River Camp' }),
      addDoc(collection(db, 'paddocks'), { name: 'Home Block' }),
    ])
    console.log('Seeded: paddocks')
  } else {
    const snap = await getDocs(collection(db, 'paddocks'))
    const docs = snap.docs
    north = docs[0] ?? { id: '' }
    south = docs[1] ?? { id: '' }
    river = docs[2] ?? { id: '' }
    home  = docs[3] ?? { id: '' }
    console.log('Paddocks: using existing')
  }

  // ── Cattle ───────────────────────────────────────────────────────────────────
  if (await isEmpty('cattle')) {
    const cattleData = [
      { tag: '0001', gender: 'F', isBull: false, breed: 'Brahman',  paddockId: north.id, dob: '2019-03-15', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 5,    group: 'A' },
      { tag: '0002', gender: 'M', isBull: true,  breed: 'Hereford', paddockId: south.id, dob: '2018-07-22', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 18,   group: 'A' },
      { tag: '0003', gender: 'F', isBull: false, breed: 'Nguni',    paddockId: north.id, dob: '2020-01-10', status: 'in_calf', owner: 'Tsinda - Cornelia', dippedDaysAgo: 3,    group: 'B' },
      { tag: '0004', gender: 'F', isBull: false, breed: 'Brahman',  paddockId: river.id, dob: '2022-09-05', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 25,   group: 'A' },
      { tag: '0005', gender: 'M', isBull: false, breed: 'Angus',    paddockId: river.id, dob: '2022-11-20', status: 'active',  owner: 'Tsinda - Other',    dippedDaysAgo: 12,   group: 'B' },
      { tag: '0006', gender: 'F', isBull: false, breed: 'Nguni',    paddockId: home.id,  dob: '2019-06-18', status: 'in_calf', owner: 'Amaval',            dippedDaysAgo: 8,    group: 'A' },
      { tag: '0007', gender: 'M', isBull: true,  breed: 'Brahman',  paddockId: south.id, dob: '2017-04-30', status: 'active',  owner: 'Tsinda - Cornelia', dippedDaysAgo: null, group: 'A' },
      { tag: '0008', gender: 'F', isBull: false, breed: 'Hereford', paddockId: home.id,  dob: '2023-02-14', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 30,   group: 'B' },
      { tag: '0009', gender: 'M', isBull: false, breed: 'Nguni',    paddockId: north.id, dob: '2023-05-07', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 7,    group: 'B' },
      { tag: '0010', gender: 'F', isBull: false, breed: 'Angus',    paddockId: south.id, dob: '2020-08-12', status: 'active',  owner: 'Tsinda - Cornelia', dippedDaysAgo: 16,   group: 'A' },
      { tag: '0011', gender: 'F', isBull: false, breed: 'Brahman',  paddockId: north.id, dob: '2021-04-02', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 6,    group: 'A' },
      { tag: '0012', gender: 'F', isBull: false, breed: 'Nguni',    paddockId: river.id, dob: '2024-01-15', status: 'active',  owner: 'Amaval',            dippedDaysAgo: 9,    group: 'B' },
    ] as const
    const sessionId = `batch-${Date.now()}`
    for (const animal of cattleData) {
      const { dippedDaysAgo, ...fields } = animal
      const ref = await addDoc(collection(db, 'cattle'), { ...fields, motherId: null, notes: null, active: true, createdAt: now() })
      if (dippedDaysAgo !== null) {
        await addDoc(collection(db, 'dip_records'), { animalId: ref.id, date: daysAgo(dippedDaysAgo), sessionId, createdAt: now() })
      }
      if (['0001', '0002', '0003', '0004'].includes(fields.tag)) {
        await addDoc(collection(db, 'weight_records'), { animalId: ref.id, date: daysAgo(60), weightKg: 280 + Math.floor(Math.random() * 80), createdAt: now() })
        await addDoc(collection(db, 'weight_records'), { animalId: ref.id, date: daysAgo(10), weightKg: 300 + Math.floor(Math.random() * 80), createdAt: now() })
      }
    }
    console.log('Seeded: cattle')
  } else {
    console.log('Cattle: skipping (already exists)')
  }

  // ── Inventory ────────────────────────────────────────────────────────────────
  {
    const invItemsData = [
      { name: 'Cattle salt lick', metric: 'kg',    parLevel: 50  },
      { name: 'Diesel',           metric: 'L',     parLevel: 200 },
      { name: 'Game feed mix',    metric: 'kg',    parLevel: 100 },
      { name: 'Dip chemical',     metric: 'L',     parLevel: 10  },
      { name: 'Ear tags',         metric: 'units', parLevel: 20  },
      { name: 'Baling twine',     metric: 'units', parLevel: 5   },
    ] as const
    const existingSnap = await getDocs(collection(db, 'inventory_items'))
    const existingNames = new Set(existingSnap.docs.map(d => d.data().name as string))
    let invAdded = 0
    for (const item of invItemsData) {
      if (existingNames.has(item.name)) continue
      const ref = await addDoc(collection(db, 'inventory_items'), { ...item, locationId: home.id, active: true, createdAt: now() })
      await addDoc(collection(db, 'inventory_transactions'), { itemId: ref.id, date: daysAgo(30), description: 'Opening stock', quantityIn: item.parLevel * 2, quantityOut: null, createdAt: now() })
      await addDoc(collection(db, 'inventory_transactions'), { itemId: ref.id, date: daysAgo(10), description: 'Weekly usage', quantityIn: null, quantityOut: Math.round(item.parLevel * 1.2), createdAt: now() })
      invAdded++
    }
    if (invAdded > 0) console.log(`Seeded: inventory (added ${invAdded} items)`)
    else console.log('Inventory: all items already exist')
  }

  // ── Equipment ────────────────────────────────────────────────────────────────
  if (await isEmpty('equipment')) {
    const equipData = [
      { name: 'Chainsaw',         condition: 'Good',            quantity: 1, type: 'AMV'      },
      { name: 'Angle grinder',    condition: 'Needs Attention', quantity: 2, type: 'AMV'      },
      { name: 'Generator (5kVA)', condition: 'Good',            quantity: 1, type: 'AMV'      },
      { name: 'Water pump',       condition: 'Good',            quantity: 1, type: 'AMV'      },
      { name: 'Fence pliers',     condition: 'Good',            quantity: 4, type: 'Personal' },
      { name: 'Spade',            condition: 'Good',            quantity: 6, type: 'Personal' },
    ] as const
    for (const equip of equipData) {
      await addDoc(collection(db, 'equipment'), { ...equip, description: null, locationId: home.id, status: 'In Service', active: true, createdAt: now() })
    }
    console.log('Seeded: equipment')
  } else {
    console.log('Equipment: skipping (already exists)')
  }

  // ── Vehicles ─────────────────────────────────────────────────────────────────
  if (await isEmpty('vehicles')) {
    const [bakkie, tractor, quad] = await Promise.all([
      addDoc(collection(db, 'vehicles'), { yearMakeModel: '2018 Toyota Hilux D4D',  engine: 'Diesel',  serviceIntervalKm: 10000, locationId: home.id,  active: true, createdAt: now() }),
      addDoc(collection(db, 'vehicles'), { yearMakeModel: '2015 John Deere 5075E',  engine: 'Diesel',  serviceIntervalKm: 250,   locationId: north.id, active: true, createdAt: now() }),
      addDoc(collection(db, 'vehicles'), { yearMakeModel: '2020 Honda TRX420',      engine: 'Petrol',  serviceIntervalKm: 3000,  locationId: home.id,  active: true, createdAt: now() }),
    ])
    for (const [vid, mileages] of [[bakkie.id, [98200, 99100, 99850]], [tractor.id, [1820, 1960, 2080]], [quad.id, [12300, 12800, 13100]]] as [string, number[]][]) {
      for (let i = 0; i < mileages.length; i++) {
        await addDoc(collection(db, 'mileage_logs'), { vehicleId: vid, date: daysAgo(30 - i * 10), recordedMileage: mileages[i], notes: null, createdAt: now() })
      }
    }
    await addDoc(collection(db, 'maintenance_records'), { vehicleId: bakkie.id, serviceDate: daysAgo(90), serviceType: 'Full Service', recordedMileage: 90200, notes: 'Oil, filter, plugs', createdAt: now() })
    console.log('Seeded: vehicles')
  } else {
    console.log('Vehicles: skipping (already exists)')
  }

  // ── Staff ────────────────────────────────────────────────────────────────────
  if (await isEmpty('staff')) {
    const staffRows = [
      { fullName: 'Moses Dube',     role: 'Herd Manager',   salary: 450, idNumber: '63-1234567A00' },
      { fullName: 'Grace Moyo',     role: 'General Worker', salary: 300, idNumber: '72-2345678B10' },
      { fullName: 'Blessing Ncube', role: 'Driver',         salary: 380, idNumber: '85-3456789C20' },
      { fullName: 'Tapiwa Mutasa',  role: 'General Worker', salary: 280, idNumber: '90-4567890D30' },
      { fullName: 'Ruth Zimba',     role: 'Cook',           salary: 260, idNumber: '78-5678901E40' },
    ]
    const [mosesRef, , blessingRef] = await Promise.all(
      staffRows.map(s => addDoc(collection(db, 'staff'), {
        ...s, dateStarted: daysAgo(365), dob: null, address: null, phone: null,
        emergencyContactName: null, emergencyContactRelation: null, emergencyContactPhone: null,
        locationId: home.id, active: true, createdAt: now(),
      }))
    )
    for (let i = 3; i >= 1; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      await addDoc(collection(db, 'salary_payments'), { staffId: mosesRef.id, date: d.toISOString().slice(0, 10), amountDue: 450, subtractLoanRepayment: false, groceryBasketGiven: true, notes: null, createdAt: now() })
    }
    await addDoc(collection(db, 'loan_records'), { staffId: blessingRef.id, date: daysAgo(60), loanAmountGiven: 500, loanRepaymentAmount: null, repaymentPeriodMonths: 5, notes: 'School fees', createdAt: now() })
    await addDoc(collection(db, 'loan_records'), { staffId: blessingRef.id, date: daysAgo(30), loanAmountGiven: null, loanRepaymentAmount: 100, repaymentPeriodMonths: null, notes: 'Salary deduction', createdAt: now() })
    await addDoc(collection(db, 'safety_equipment_given'), { staffId: mosesRef.id, date: daysAgo(180), items: ['Safety shoes', 'Work suit', 'Gloves'], createdAt: now() })
    console.log('Seeded: staff')
  } else {
    console.log('Staff: skipping (already exists)')
  }

  // ── Finance ──────────────────────────────────────────────────────────────────
  if (await isEmpty('revenue_entries')) {
    await Promise.all([
      addDoc(collection(db, 'revenue_entries'), { description: 'Sold 2 oxen to local buyer', category: 'Cattle sale',       amount: 1400, date: `${lastMonth}-15`, createdAt: now() }),
      addDoc(collection(db, 'revenue_entries'), { description: 'Maize crop sale',             category: 'Crop sale',         amount: 620,  date: `${thisMonth}-03`, createdAt: now() }),
      addDoc(collection(db, 'expense_entries'), { description: 'Monthly diesel purchase',     category: 'Fuel & lubricants', amount: 280,  date: `${thisMonth}-02`, createdAt: now() }),
      addDoc(collection(db, 'expense_entries'), { description: 'Vet visit — herd check',      category: 'Veterinary',        amount: 150,  date: `${thisMonth}-05`, createdAt: now() }),
      addDoc(collection(db, 'expense_entries'), { description: 'Staff wages',                 category: 'Labour',            amount: 1670, date: `${thisMonth}-01`, createdAt: now() }),
      addDoc(collection(db, 'expense_entries'), { description: 'Dipping chemical restock',    category: 'Dipping chemicals', amount: 95,   date: `${lastMonth}-20`, createdAt: now() }),
    ])
    console.log('Seeded: finance')
  } else {
    console.log('Finance: skipping (already exists)')
  }

  console.log('Seed run complete.')
}
