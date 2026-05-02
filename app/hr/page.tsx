'use client'

import { useState, useEffect, useRef } from 'react'
import {
  collection, getDocs, addDoc, updateDoc, doc, query, where, Timestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Modal from '../../components/Modal'
import {
  StaffMember, SalaryPayment, LoanRecord, SafetyEquipmentGiven,
  SAFETY_ITEMS, SafetyEquipmentItem,
  computeLoanBalance, computeMonthlyRepayment,
} from '../../lib/types'

type Tab = 'staff' | 'loans'

type StaffTab = 'info' | 'salary' | 'loans' | 'safety'

interface StaffWithStats extends StaffMember {
  loanBalance: number
  monthlyRepayment: number
}

const ROLES = ['Farm Manager', 'Herd Manager', 'Driver', 'General Worker', 'Security', 'Cook', 'Other']

export default function HRPage() {
  const [staff, setStaff] = useState<StaffWithStats[]>([])
  const [loans, setLoans] = useState<LoanRecord[]>([])
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([])
  const [safetyRecords, setSafetyRecords] = useState<SafetyEquipmentGiven[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('staff')

  // Modals
  const [addStaffOpen, setAddStaffOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffWithStats | null>(null)
  const [staffTab, setStaffTab] = useState<StaffTab>('info')
  const [salaryModalOpen, setSalaryModalOpen] = useState(false)
  const [loanModalOpen, setLoanModalOpen] = useState(false)
  const [safetyModalOpen, setSafetyModalOpen] = useState(false)
  const [editStaffOpen, setEditStaffOpen] = useState(false)

  async function load() {
    const [staffSnap, loanSnap, salarySnap, safetySnap] = await Promise.all([
      getDocs(query(collection(db, 'staff'), where('active', '==', true))),
      getDocs(collection(db, 'loan_records')),
      getDocs(collection(db, 'salary_payments')),
      getDocs(collection(db, 'safety_equipment_given')),
    ])

    const loanData: LoanRecord[] = loanSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoanRecord))
    const salaryData: SalaryPayment[] = salarySnap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryPayment))
    const safetyData: SafetyEquipmentGiven[] = safetySnap.docs.map(d => ({ id: d.id, ...d.data() } as SafetyEquipmentGiven))

    const staffData: StaffWithStats[] = staffSnap.docs.map(d => {
      const m = { id: d.id, ...d.data() } as StaffMember
      return {
        ...m,
        loanBalance: computeLoanBalance(loanData, d.id),
        monthlyRepayment: computeMonthlyRepayment(loanData, d.id),
      }
    }).sort((a, b) => a.fullName.localeCompare(b.fullName))

    setStaff(staffData)
    setLoans(loanData)
    setSalaryPayments(salaryData)
    setSafetyRecords(safetyData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const totalSalary = staff.reduce((s, m) => s + (m.salary ?? 0), 0)
  const totalLoans = staff.reduce((s, m) => s + m.loanBalance, 0)

  function openStaff(s: StaffWithStats) {
    setSelectedStaff(s)
    setStaffTab('info')
  }

  async function refreshSelected(staffId: string) {
    await load()
    setSelectedStaff(prev => {
      if (!prev || prev.id !== staffId) return prev
      return null // will be re-set from fresh data below — handled in load()
    })
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-[family-name:var(--font-syne)] pb-[100px]">
      <header className="sticky top-0 z-40 bg-white border-b border-zinc-100 px-4 py-3.5">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Staff & HR</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Salary · Loans · Safety equipment</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Staff', value: loading ? '—' : String(staff.length) },
            { label: 'Monthly wages', value: loading ? '—' : `$${totalSalary.toLocaleString()}` },
            { label: 'Loans outstanding', value: loading ? '—' : `$${totalLoans.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-zinc-100 p-3 text-center">
              <p className="text-lg font-bold text-zinc-900">{value}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-zinc-100 p-1">
          {([['staff', 'Staff list'], ['loans', 'Loan ledger']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-[#3B6D11] text-white' : 'text-zinc-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Add staff button */}
        {tab === 'staff' && (
          <button onClick={() => setAddStaffOpen(true)}
            className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold active:opacity-80 transition-opacity">
            + Add Staff Member
          </button>
        )}

        {/* Staff list */}
        {tab === 'staff' && !loading && (
          <div className="space-y-2">
            {staff.length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No active staff — add someone above.</p>
            )}
            {staff.map(s => (
              <button key={s.id} onClick={() => openStaff(s)}
                className="w-full bg-white rounded-2xl border border-zinc-100 p-4 text-left hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{s.fullName}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{s.role ?? 'No role set'}</p>
                  </div>
                  <div className="text-right">
                    {s.salary != null && (
                      <p className="text-sm font-bold text-zinc-900">${s.salary.toLocaleString()}<span className="text-xs font-normal text-zinc-400">/mo</span></p>
                    )}
                    {s.loanBalance > 0 && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Owes ${s.loanBalance.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Loan ledger */}
        {tab === 'loans' && !loading && (
          <div className="space-y-3">
            {staff.filter(s => s.loanBalance > 0).length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-8">No outstanding loans.</p>
            )}
            {staff.filter(s => s.loanBalance > 0).map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-zinc-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-zinc-900">{s.fullName}</p>
                  <p className="text-sm font-bold text-amber-700">${s.loanBalance.toLocaleString()} owed</p>
                </div>
                {s.monthlyRepayment > 0 && (
                  <p className="text-xs text-zinc-400">${s.monthlyRepayment.toLocaleString()}/mo repayment</p>
                )}
                <div className="mt-3 space-y-1">
                  {loans.filter(l => l.staffId === s.id).sort((a, b) => b.date.localeCompare(a.date)).map(l => (
                    <div key={l.id} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{l.date}</span>
                      {l.loanAmountGiven ? (
                        <span className="text-red-600 font-medium">-${l.loanAmountGiven.toLocaleString()} given</span>
                      ) : (
                        <span className="text-green-700 font-medium">+${l.loanRepaymentAmount?.toLocaleString()} repaid</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      <AddStaffModal
        open={addStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        onSaved={() => { setAddStaffOpen(false); load() }}
      />

      {/* Staff Detail Modal */}
      {selectedStaff && (
        <Modal open title={selectedStaff.fullName} onClose={() => setSelectedStaff(null)}>
          {/* Sub-tabs */}
          <div className="flex gap-1 bg-zinc-50 rounded-xl p-1 mb-4">
            {([['info', 'Info'], ['salary', 'Salary'], ['loans', 'Loans'], ['safety', 'Safety']] as [StaffTab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setStaffTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${staffTab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'}`}>
                {label}
              </button>
            ))}
          </div>

          {staffTab === 'info' && (
            <StaffInfoTab
              staff={selectedStaff}
              onEdit={() => setEditStaffOpen(true)}
            />
          )}
          {staffTab === 'salary' && (
            <SalaryTab
              staff={selectedStaff}
              payments={salaryPayments.filter(p => p.staffId === selectedStaff.id)}
              onRecord={() => setSalaryModalOpen(true)}
            />
          )}
          {staffTab === 'loans' && (
            <LoansTab
              staff={selectedStaff}
              loans={loans.filter(l => l.staffId === selectedStaff.id)}
              onRecord={() => setLoanModalOpen(true)}
            />
          )}
          {staffTab === 'safety' && (
            <SafetyTab
              staff={selectedStaff}
              records={safetyRecords.filter(r => r.staffId === selectedStaff.id)}
              onGive={() => setSafetyModalOpen(true)}
            />
          )}
        </Modal>
      )}

      {/* Edit Staff Modal */}
      {selectedStaff && (
        <EditStaffModal
          open={editStaffOpen}
          staff={selectedStaff}
          onClose={() => setEditStaffOpen(false)}
          onSaved={async () => {
            setEditStaffOpen(false)
            await load()
          }}
        />
      )}

      {/* Salary Payment Modal */}
      {selectedStaff && (
        <SalaryModal
          open={salaryModalOpen}
          staff={selectedStaff}
          onClose={() => setSalaryModalOpen(false)}
          onSaved={async () => {
            setSalaryModalOpen(false)
            await load()
          }}
        />
      )}

      {/* Loan Modal */}
      {selectedStaff && (
        <LoanModal
          open={loanModalOpen}
          staff={selectedStaff}
          onClose={() => setLoanModalOpen(false)}
          onSaved={async () => {
            setLoanModalOpen(false)
            await load()
            setSelectedStaff(prev => staff.find(s => s.id === prev?.id) ?? prev)
          }}
        />
      )}

      {/* Safety Modal */}
      {selectedStaff && (
        <SafetyModal
          open={safetyModalOpen}
          staff={selectedStaff}
          onClose={() => setSafetyModalOpen(false)}
          onSaved={async () => {
            setSafetyModalOpen(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

// ── Sub-tab panels ─────────────────────────────────────────────────────────────

function StaffInfoTab({ staff, onEdit }: { staff: StaffWithStats; onEdit: () => void }) {
  const rows = [
    ['Role', staff.role],
    ['ID Number', staff.idNumber],
    ['Date of birth', staff.dob],
    ['Date started', staff.dateStarted],
    ['Salary', staff.salary != null ? `$${staff.salary.toLocaleString()}/month` : null],
    ['Phone', staff.phone],
    ['Address', staff.address],
    ['Emergency contact', staff.emergencyContactName
      ? `${staff.emergencyContactName} (${staff.emergencyContactRelation ?? ''}) — ${staff.emergencyContactPhone ?? ''}`
      : null],
  ]
  return (
    <div>
      <div className="space-y-3">
        {rows.map(([label, value]) => value ? (
          <div key={label as string}>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest">{label}</p>
            <p className="text-sm text-zinc-900 mt-0.5">{value}</p>
          </div>
        ) : null)}
      </div>
      <button onClick={onEdit}
        className="mt-6 w-full border border-zinc-200 text-zinc-700 rounded-xl py-2.5 text-sm font-medium">
        Edit Info
      </button>
    </div>
  )
}

function SalaryTab({ staff, payments, onRecord }: {
  staff: StaffWithStats; payments: SalaryPayment[]; onRecord: () => void
}) {
  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div>
      <button onClick={onRecord}
        className="w-full bg-[#3B6D11] text-white rounded-xl py-2.5 text-sm font-semibold mb-4">
        Record Salary Payment
      </button>
      {sorted.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">No salary payments recorded.</p>}
      <div className="space-y-2">
        {sorted.map(p => {
          const deduction = p.subtractLoanRepayment ? staff.monthlyRepayment : 0
          const amountGiven = p.amountDue - deduction
          return (
            <div key={p.id} className="bg-zinc-50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">{p.date}</p>
                <p className="text-sm font-bold text-zinc-900">${amountGiven.toLocaleString()} paid</p>
              </div>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] text-zinc-500">Due: ${p.amountDue.toLocaleString()}</span>
                {deduction > 0 && <span className="text-[10px] text-amber-700">−${deduction.toLocaleString()} loan</span>}
                {p.groceryBasketGiven && <span className="text-[10px] text-zinc-500">+ Grocery basket</span>}
              </div>
              {p.notes && <p className="text-xs text-zinc-400 mt-1">{p.notes}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoansTab({ staff, loans, onRecord }: {
  staff: StaffWithStats; loans: LoanRecord[]; onRecord: () => void
}) {
  const sorted = [...loans].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-zinc-400">Balance outstanding</p>
          <p className={`text-2xl font-bold ${staff.loanBalance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            ${staff.loanBalance.toLocaleString()}
          </p>
        </div>
        <button onClick={onRecord}
          className="bg-[#3B6D11] text-white rounded-xl px-4 py-2 text-sm font-semibold">
          + Record
        </button>
      </div>
      {sorted.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">No loan records.</p>}
      <div className="space-y-2">
        {sorted.map(l => (
          <div key={l.id} className="bg-zinc-50 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">{l.date}</p>
              {l.loanAmountGiven ? (
                <p className="text-sm font-bold text-red-600">−${l.loanAmountGiven.toLocaleString()} given</p>
              ) : (
                <p className="text-sm font-bold text-green-700">+${l.loanRepaymentAmount?.toLocaleString()} repaid</p>
              )}
            </div>
            {l.loanAmountGiven && l.repaymentPeriodMonths && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Repay over {l.repaymentPeriodMonths} months
                (${(l.loanAmountGiven / l.repaymentPeriodMonths).toFixed(2)}/mo)
              </p>
            )}
            {l.notes && <p className="text-xs text-zinc-400 mt-1">{l.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SafetyTab({ staff, records, onGive }: {
  staff: StaffWithStats; records: SafetyEquipmentGiven[]; onGive: () => void
}) {
  const allGiven = records.flatMap(r => r.items)
  const latestByItem = new Map<SafetyEquipmentItem, string>()
  records.forEach(r => r.items.forEach(item => {
    if (!latestByItem.has(item) || r.date > latestByItem.get(item)!) {
      latestByItem.set(item, r.date)
    }
  }))

  return (
    <div>
      <button onClick={onGive}
        className="w-full bg-[#3B6D11] text-white rounded-xl py-2.5 text-sm font-semibold mb-4">
        Issue Equipment
      </button>
      <div className="space-y-2 mb-4">
        {SAFETY_ITEMS.map(item => {
          const lastDate = latestByItem.get(item)
          return (
            <div key={item} className="flex items-center justify-between bg-zinc-50 rounded-xl px-4 py-3">
              <p className="text-sm text-zinc-800">{item}</p>
              {lastDate
                ? <span className="text-[10px] text-zinc-400">Last: {lastDate}</span>
                : <span className="text-[10px] text-amber-700">Never issued</span>}
            </div>
          )
        })}
      </div>
      {records.length > 0 && (
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-2">History</p>
          <div className="space-y-1">
            {[...records].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
              <div key={r.id} className="text-xs text-zinc-500 flex justify-between">
                <span>{r.date}</span>
                <span>{r.items.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────────

function AddStaffModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void
}) {
  const empty = {
    fullName: '', idNumber: '', role: '', dateStarted: '', salary: '',
    dob: '', address: '', phone: '',
    emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  }
  const [form, setForm] = useState(empty)
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function save() {
    if (!form.fullName.trim()) return
    addDoc(collection(db, 'staff'), {
      fullName: form.fullName.trim(),
      idNumber: form.idNumber.trim() || null,
      role: form.role || null,
      dateStarted: form.dateStarted || null,
      salary: form.salary ? Number(form.salary) : null,
      dob: form.dob || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      emergencyContactName: form.emergencyContactName.trim() || null,
      emergencyContactRelation: form.emergencyContactRelation.trim() || null,
      emergencyContactPhone: form.emergencyContactPhone.trim() || null,
      active: true,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setForm(empty)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Member">
      <StaffForm form={form} set={set} />
      <button onClick={save} disabled={!form.fullName.trim()}
        className="mt-4 w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
        Add Staff Member
      </button>
    </Modal>
  )
}

function EditStaffModal({ open, staff, onClose, onSaved }: {
  open: boolean; staff: StaffWithStats; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    fullName: staff.fullName,
    idNumber: staff.idNumber ?? '',
    role: staff.role ?? '',
    dateStarted: staff.dateStarted ?? '',
    salary: staff.salary != null ? String(staff.salary) : '',
    dob: staff.dob ?? '',
    address: staff.address ?? '',
    phone: staff.phone ?? '',
    emergencyContactName: staff.emergencyContactName ?? '',
    emergencyContactRelation: staff.emergencyContactRelation ?? '',
    emergencyContactPhone: staff.emergencyContactPhone ?? '',
  })
  useEffect(() => {
    setForm({
      fullName: staff.fullName,
      idNumber: staff.idNumber ?? '',
      role: staff.role ?? '',
      dateStarted: staff.dateStarted ?? '',
      salary: staff.salary != null ? String(staff.salary) : '',
      dob: staff.dob ?? '',
      address: staff.address ?? '',
      phone: staff.phone ?? '',
      emergencyContactName: staff.emergencyContactName ?? '',
      emergencyContactRelation: staff.emergencyContactRelation ?? '',
      emergencyContactPhone: staff.emergencyContactPhone ?? '',
    })
  }, [staff.id])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function save() {
    if (!form.fullName.trim()) return
    updateDoc(doc(db, 'staff', staff.id), {
      fullName: form.fullName.trim(),
      idNumber: form.idNumber.trim() || null,
      role: form.role || null,
      dateStarted: form.dateStarted || null,
      salary: form.salary ? Number(form.salary) : null,
      dob: form.dob || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      emergencyContactName: form.emergencyContactName.trim() || null,
      emergencyContactRelation: form.emergencyContactRelation.trim() || null,
      emergencyContactPhone: form.emergencyContactPhone.trim() || null,
    }).catch(console.error)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Staff Member">
      <StaffForm form={form} set={set} />
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 border border-zinc-200 text-zinc-700 rounded-xl py-3 text-sm font-medium">Cancel</button>
        <button onClick={save} disabled={!form.fullName.trim()}
          className="flex-1 bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          Save
        </button>
      </div>
    </Modal>
  )
}

function StaffForm({ form, set }: { form: Record<string, string>; set: (k: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Full name *" value={form.fullName} onChange={v => set('fullName', v)} />
      <Field label="ID number" value={form.idNumber} onChange={v => set('idNumber', v)} />
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">Role</label>
        <select value={form.role} onChange={e => set('role', e.target.value)}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value="">Select role</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <Field label="Date started" type="date" value={form.dateStarted} onChange={v => set('dateStarted', v)} />
      <Field label="Monthly salary ($)" type="number" value={form.salary} onChange={v => set('salary', v)} />
      <Field label="Date of birth" type="date" value={form.dob} onChange={v => set('dob', v)} />
      <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} />
      <Field label="Address" value={form.address} onChange={v => set('address', v)} />
      <p className="text-xs text-zinc-400 uppercase tracking-widest pt-1">Emergency Contact</p>
      <Field label="Name" value={form.emergencyContactName} onChange={v => set('emergencyContactName', v)} />
      <Field label="Relation" value={form.emergencyContactRelation} onChange={v => set('emergencyContactRelation', v)} />
      <Field label="Phone" value={form.emergencyContactPhone} onChange={v => set('emergencyContactPhone', v)} />
    </div>
  )
}

function SalaryModal({ open, staff, onClose, onSaved }: {
  open: boolean; staff: StaffWithStats; onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [amountDue, setAmountDue] = useState(String(staff.salary ?? ''))
  const [subtractLoan, setSubtractLoan] = useState(staff.loanBalance > 0)
  const [groceryBasket, setGroceryBasket] = useState(false)
  const [notes, setNotes] = useState('')
  useEffect(() => {
    setAmountDue(String(staff.salary ?? ''))
    setSubtractLoan(staff.loanBalance > 0)
  }, [staff.id, staff.salary, staff.loanBalance])

  const due = Number(amountDue) || 0
  const deduction = subtractLoan ? staff.monthlyRepayment : 0
  const netAmount = due - deduction

  function save() {
    if (!amountDue) return
    addDoc(collection(db, 'salary_payments'), {
      staffId: staff.id,
      date,
      amountDue: due,
      subtractLoanRepayment: subtractLoan,
      groceryBasketGiven: groceryBasket,
      notes: notes.trim() || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    if (subtractLoan && deduction > 0) {
      addDoc(collection(db, 'loan_records'), {
        staffId: staff.id,
        date,
        loanAmountGiven: null,
        loanRepaymentAmount: deduction,
        repaymentPeriodMonths: null,
        notes: 'Auto-deducted from salary',
        createdAt: Timestamp.now().toDate().toISOString(),
      }).catch(console.error)
    }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Salary Payment">
      <div className="space-y-3">
        <Field label="Date" type="date" value={date} onChange={setDate} />
        <Field label="Amount due ($)" type="number" value={amountDue} onChange={setAmountDue} />

        {staff.loanBalance > 0 && (
          <label className="flex items-center gap-3 bg-amber-50 rounded-xl px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={subtractLoan} onChange={e => setSubtractLoan(e.target.checked)}
              className="rounded" />
            <div>
              <p className="text-sm font-medium text-amber-800">Subtract loan repayment</p>
              <p className="text-xs text-amber-600">−${deduction.toLocaleString()}/mo (balance: ${staff.loanBalance.toLocaleString()})</p>
            </div>
          </label>
        )}

        <label className="flex items-center gap-3 bg-zinc-50 rounded-xl px-4 py-3 cursor-pointer">
          <input type="checkbox" checked={groceryBasket} onChange={e => setGroceryBasket(e.target.checked)}
            className="rounded" />
          <p className="text-sm text-zinc-700">Grocery basket given</p>
        </label>

        <div className="bg-[#3B6D11]/5 rounded-xl px-4 py-3">
          <p className="text-xs text-zinc-400">Net amount to pay</p>
          <p className="text-2xl font-bold text-[#3B6D11]">${netAmount.toLocaleString()}</p>
        </div>

        <Field label="Notes (optional)" value={notes} onChange={setNotes} />
        <button onClick={save} disabled={!amountDue}
          className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          Record Payment
        </button>
      </div>
    </Modal>
  )
}

function LoanModal({ open, staff, onClose, onSaved }: {
  open: boolean; staff: StaffWithStats; onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<'give' | 'repay'>('give')
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [repaymentMonths, setRepaymentMonths] = useState('')
  const [notes, setNotes] = useState('')
  function save() {
    if (!amount) return
    addDoc(collection(db, 'loan_records'), {
      staffId: staff.id,
      date,
      loanAmountGiven: mode === 'give' ? Number(amount) : null,
      loanRepaymentAmount: mode === 'repay' ? Number(amount) : null,
      repaymentPeriodMonths: mode === 'give' && repaymentMonths ? Number(repaymentMonths) : null,
      notes: notes.trim() || null,
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setAmount('')
    setRepaymentMonths('')
    setNotes('')
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Loan Record">
      <div className="space-y-3">
        <div className="flex gap-1 bg-zinc-50 rounded-xl p-1">
          {(['give', 'repay'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400'}`}>
              {m === 'give' ? 'Give loan' : 'Record repayment'}
            </button>
          ))}
        </div>
        <Field label="Date" type="date" value={date} onChange={setDate} />
        <Field label={mode === 'give' ? 'Loan amount ($)' : 'Repayment amount ($)'}
          type="number" value={amount} onChange={setAmount} />
        {mode === 'give' && (
          <Field label="Repayment period (months)" type="number" value={repaymentMonths} onChange={setRepaymentMonths} />
        )}
        {mode === 'give' && amount && repaymentMonths && (
          <div className="bg-amber-50 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700">Monthly repayment: ${(Number(amount) / Number(repaymentMonths)).toFixed(2)}</p>
          </div>
        )}
        <Field label="Notes (optional)" value={notes} onChange={setNotes} />
        <button onClick={save} disabled={!amount}
          className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          {mode === 'give' ? 'Record Loan' : 'Record Repayment'}
        </button>
      </div>
    </Modal>
  )
}

function SafetyModal({ open, staff, onClose, onSaved }: {
  open: boolean; staff: StaffWithStats; onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [selected, setSelected] = useState<Set<SafetyEquipmentItem>>(new Set())
  function toggle(item: SafetyEquipmentItem) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(item) ? next.delete(item) : next.add(item)
      return next
    })
  }

  function save() {
    if (selected.size === 0) return
    addDoc(collection(db, 'safety_equipment_given'), {
      staffId: staff.id,
      date,
      items: Array.from(selected),
      createdAt: Timestamp.now().toDate().toISOString(),
    }).catch(console.error)
    setSelected(new Set())
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Issue Safety Equipment">
      <div className="space-y-3">
        <Field label="Date" type="date" value={date} onChange={setDate} />
        <div className="space-y-2">
          {SAFETY_ITEMS.map(item => (
            <label key={item} className="flex items-center gap-3 bg-zinc-50 rounded-xl px-4 py-3 cursor-pointer">
              <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} className="rounded" />
              <p className="text-sm text-zinc-800">{item}</p>
            </label>
          ))}
        </div>
        <button onClick={save} disabled={selected.size === 0}
          className="w-full bg-[#3B6D11] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          {`Issue ${selected.size > 0 ? selected.size : ''} Item${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Modal>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange }: {
  label: string; type?: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
    </div>
  )
}
