import { SEED_ROWS } from './seed'
import type { AcceptanceLedgerEntry, DrawingRecord, EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'archaeology-field:entries'
const DRAWING_KEY = 'archaeology-field:feature-drawings'
const ACCEPTANCE_LEDGER_KEY = 'archaeology-field:feature-acceptance-ledger'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 旧数据只有一个“单位编号”，拆成现场编号/入库编号两列时在这里一次性补齐。
// 已归位的历史单位沿用既有的层位取值：这里只补编号，开口层位、现存深度一律不动。
function migrateFeatureRows(rows: EntryRow[]): EntryRow[] {
  return rows.map((row) => {
    const next: EntryRow = { ...row }
    if (!String(next['现场编号'] ?? '').trim()) {
      next['现场编号'] = String(next['单位编号'] ?? '')
    }
    if (!String(next['入库编号'] ?? '').trim()) {
      next['入库编号'] = String(next['单位编号'] ?? '')
    }
    return next
  })
}

function readEntries(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    fallback.feature = migrateFeatureRows(fallback.feature)
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    fallback.feature = migrateFeatureRows(fallback.feature)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    const migratedFeatures = migrateFeatureRows(merged.feature)
    const changed = migratedFeatures.some(
      (row, index) =>
        String(row['现场编号']) !== String(merged.feature[index]?.['现场编号'] ?? '') ||
        String(row['入库编号']) !== String(merged.feature[index]?.['入库编号'] ?? ''),
    )
    merged.feature = migratedFeatures
    if (changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    }
    return merged
  } catch {
    fallback.feature = migrateFeatureRows(fallback.feature)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readEntries()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  const next = key === 'feature' ? migrateFeatureRows(rows) : rows
  saveRows(key, next)
  return next
}

export function storageKey(): string {
  return STORAGE_KEY
}

function readBucket<T>(storageKey: string, fallback: T[]): T[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    window.localStorage.setItem(storageKey, JSON.stringify(fallback))
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T[]
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify(fallback))
    return clone(fallback)
  }
}

// 绘图记录：与遗迹单位清单分开存，但读取入口唯一，列表页和详情页取的是同一份。
let drawingCache: DrawingRecord[] | null = null

export function listDrawingRecords(): DrawingRecord[] {
  if (drawingCache === null) {
    drawingCache = readBucket(DRAWING_KEY, SEED_DRAWING_RECORDS)
  }
  return drawingCache
}

export function saveDrawingRecords(records: DrawingRecord[]): void {
  drawingCache = records
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DRAWING_KEY, JSON.stringify(records))
  }
}

// 归位验收台账：归位结论的唯一落点。
let ledgerCache: AcceptanceLedgerEntry[] | null = null

export function listAcceptanceLedger(): AcceptanceLedgerEntry[] {
  if (ledgerCache === null) {
    ledgerCache = readBucket(ACCEPTANCE_LEDGER_KEY, SEED_ACCEPTANCE_LEDGER)
  }
  return ledgerCache
}

export function saveAcceptanceLedger(entries: AcceptanceLedgerEntry[]): void {
  ledgerCache = entries
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(ACCEPTANCE_LEDGER_KEY, JSON.stringify(entries))
  }
}

// 首次播种：历史已归位单位连同当时的层位取值一起落账，之后不重算。
const SEED_DRAWING_RECORDS: DrawingRecord[] = [
  {
    id: 1,
    featureId: 3,
    单位编号: 'RK-FEAT-0003',
    图号: 'H-2026-0007',
    绘图人: '绘图员样例',
    绘图日期: '2026-09-20',
    备注: '已随遗迹单位绘图归档',
  },
]

const SEED_ACCEPTANCE_LEDGER: AcceptanceLedgerEntry[] = [
  {
    id: 1,
    featureId: 4,
    单位编号: 'RK-FEAT-0004',
    归位日期: '2026-09-25',
    归位结论: '验收通过',
    验收人: '验收员样例',
    开口层位: '第3层下',
    现存深度: '0.82m',
    退回原因: '',
  },
]
