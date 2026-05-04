// ── Livestock ─────────────────────────────────────────────────────────────────

export type AnimalGender = 'M' | 'F'
export type AnimalStatus = 'active' | 'sold' | 'lost' | 'in_calf' | 'deceased' | 'sick'
export type AnimalGroup = 'A' | 'B'
export type AnimalOwner = 'Amaval' | 'Tsinda - Cornelia' | 'Tsinda - Other'

export interface Animal {
  id: string
  tag: string
  gender: AnimalGender
  isBull: boolean
  dob: string | null
  status: AnimalStatus
  group: AnimalGroup | null
  motherId: string | null
  owner: AnimalOwner | null
  breed: string | null
  notes: string | null
  paddockId: string | null
  active: boolean
  createdAt: string
}

export interface DipRecord {
  id: string
  animalId: string
  date: string
  sessionId: string | null
}

export interface VaccinationRecord {
  id: string
  animalId: string
  date: string
  type: string
  vaccineUsed: string | null
}

export interface WeightRecord {
  id: string
  animalId: string
  date: string
  weightKg: number
}

export interface StatusChange {
  id: string
  animalId: string
  date: string
  fromStatus: AnimalStatus | null
  toStatus: AnimalStatus
  notes: string | null
}

export type DipStatus = 'ok' | 'due' | 'overdue'

export function getDipStatus(lastDipDate: string | null): DipStatus {
  if (!lastDipDate) return 'overdue'
  const days = (Date.now() - new Date(lastDipDate).getTime()) / 86_400_000
  if (days <= 14) return 'ok'
  if (days <= 21) return 'due'
  return 'overdue'
}

export function computeAnimalType(
  gender: AnimalGender,
  isBull: boolean,
  dobStr: string | null,
  hasOffspring: boolean,
): string {
  if (isBull) return 'Bull'
  if (!dobStr) return gender === 'M' ? 'Male' : 'Female'
  const ageYears = (Date.now() - new Date(dobStr).getTime()) / (365.25 * 86_400_000)
  if (ageYears < 0.5) return 'Calf'
  if (gender === 'M') {
    if (ageYears < 1) return 'Weaner steer'
    if (ageYears < 2) return 'Steer'
    return 'Ox'
  }
  if (hasOffspring || ageYears > 2) return 'Cow'
  if (ageYears < 1) return 'Weaner heifer'
  return 'Heifer'
}

export function computeAgeYears(dobStr: string | null): number | null {
  if (!dobStr) return null
  return (Date.now() - new Date(dobStr).getTime()) / (365.25 * 86_400_000)
}

// ── Locations ─────────────────────────────────────────────────────────────────

export interface Location {
  id: string
  name: string
}

export interface Breed {
  id: string
  name: string
}

export interface Group {
  id: string
  name: string
}

export interface Owner {
  id: string
  name: string
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export type InventoryMetric = 'kg' | 'L' | 'units'

export interface InventoryItem {
  id: string
  name: string
  metric: InventoryMetric
  locationId: string | null
  parLevel: number | null
  active: boolean
  createdAt: string
}

export interface InventoryTransaction {
  id: string
  itemId: string
  date: string
  description: string | null
  quantityIn: number | null
  quantityOut: number | null
  createdAt: string
}

export function computeBalance(
  transactions: InventoryTransaction[],
  itemId: string,
): number {
  return transactions
    .filter(t => t.itemId === itemId)
    .reduce((sum, t) => sum + (t.quantityIn ?? 0) - (t.quantityOut ?? 0), 0)
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export type EquipmentCondition = 'Good' | 'Needs Attention' | 'Poor'
export type EquipmentStatus = 'In Service' | 'In Use' | 'Minimal Usage only'
export type EquipmentType = 'AMV' | 'Personal'

export interface Equipment {
  id: string
  name: string
  description: string | null
  condition: EquipmentCondition | null
  quantity: number | null
  locationId: string | null
  status: EquipmentStatus | null
  type: EquipmentType | null
  active: boolean
  createdAt: string
}

export interface EquipmentUseLog {
  id: string
  equipmentId: string
  date: string
  reasonForUse: string | null
  givenToId: string | null
  checkoutTime: string | null
  returnedById: string | null
  returnTime: string | null
  returnedCondition: EquipmentCondition | null
  createdAt: string
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

export type VehicleEngine = 'Petrol' | 'Diesel'
export type ServiceType = 'Full Service' | 'Oil Change' | 'Tyres' | 'Other'
export type ServiceStatus = 'ok' | 'soon' | 'overdue'

export interface Vehicle {
  id: string
  yearMakeModel: string
  locationId: string | null
  engine: VehicleEngine | null
  serviceIntervalKm: number | null
  active: boolean
  createdAt: string
}

export interface MileageLog {
  id: string
  vehicleId: string
  date: string
  recordedMileage: number
  notes: string | null
  createdAt: string
}

export interface MaintenanceRecord {
  id: string
  vehicleId: string
  serviceDate: string
  serviceType: ServiceType
  recordedMileage: number | null
  notes: string | null
  createdAt: string
}

export function computeNextServiceMileage(
  currentMileage: number,
  serviceIntervalKm: number,
  maintenanceRecords: MaintenanceRecord[],
): number {
  const fullServices = maintenanceRecords
    .filter(r => r.serviceType === 'Full Service' && r.recordedMileage != null)
    .map(r => r.recordedMileage!)
    .sort((a, b) => a - b)

  if (fullServices.length === 0) return serviceIntervalKm

  // Find the most recent full service within range
  const lastService = fullServices
    .filter(m => m <= currentMileage && m >= currentMileage - serviceIntervalKm)
    .at(-1)

  if (lastService != null) return lastService + serviceIntervalKm

  const anyLastService = fullServices.at(-1)!
  return anyLastService + serviceIntervalKm
}

export function getServiceStatus(
  currentMileage: number,
  nextServiceMileage: number,
): ServiceStatus {
  if (currentMileage >= nextServiceMileage) return 'overdue'
  if (nextServiceMileage - currentMileage <= 500) return 'soon'
  return 'ok'
}

// ── HR ────────────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string
  fullName: string
  idNumber: string | null
  role: string | null
  dateStarted: string | null
  salary: number | null
  locationId: string | null
  dob: string | null
  address: string | null
  phone: string | null
  emergencyContactName: string | null
  emergencyContactRelation: string | null
  emergencyContactPhone: string | null
  photoUrl: string | null
  active: boolean
  createdAt: string
}

export interface SalaryPayment {
  id: string
  staffId: string
  date: string
  amountDue: number
  subtractLoanRepayment: boolean
  groceryBasketGiven: boolean
  notes: string | null
  createdAt: string
}

export interface LoanRecord {
  id: string
  staffId: string
  date: string
  loanAmountGiven: number | null
  loanRepaymentAmount: number | null
  repaymentPeriodMonths: number | null
  notes: string | null
  createdAt: string
}

export type SafetyEquipmentItem =
  | 'Safety shoes'
  | 'Protective glasses'
  | 'Dust mask'
  | 'Work suit'
  | 'Gloves'

export const SAFETY_ITEMS: SafetyEquipmentItem[] = [
  'Safety shoes',
  'Protective glasses',
  'Dust mask',
  'Work suit',
  'Gloves',
]

export interface SafetyEquipmentGiven {
  id: string
  staffId: string
  date: string
  items: SafetyEquipmentItem[]
  createdAt: string
}

export interface StaffRole {
  id: string
  name: string
}

// Compute loan balance per staff (positive = still owed)
export function computeLoanBalance(loans: LoanRecord[], staffId: string): number {
  const staffLoans = loans.filter(l => l.staffId === staffId)
  const paymentSum = staffLoans.reduce((sum, l) => {
    if (l.loanAmountGiven && l.loanAmountGiven > 0) return sum - l.loanAmountGiven
    if (l.loanRepaymentAmount && l.loanRepaymentAmount > 0) return sum + l.loanRepaymentAmount
    return sum
  }, 0)
  return paymentSum * -1
}

export function computeMonthlyRepayment(loans: LoanRecord[], staffId: string): number {
  const latest = loans
    .filter(l => l.staffId === staffId && l.repaymentPeriodMonths && l.loanAmountGiven)
    .at(-1)
  if (!latest) return 0
  return (latest.loanAmountGiven ?? 0) / (latest.repaymentPeriodMonths ?? 1)
}

// ── Finance ───────────────────────────────────────────────────────────────────

export interface RevenueEntry {
  id: string
  description: string
  amount: number
  date: string
  createdAt: string
}

export interface ExpenseEntry {
  id: string
  description: string
  amount: number
  date: string
  createdAt: string
}
