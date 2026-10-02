import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveMany, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  FeatureDetailResult,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

// —— 遗迹单位专用：编号归一、绘图进度一次写全、归位结论落验收台账 ——

const FEATURE_KEY = 'feature'
// 绘图记录台账：与遗迹单位同一份持久化，以入库编号为键，一个单位只落一条。
const FEATURE_DRAWING_KEY = 'feature-drawing'
const ACCEPTANCE_KEY = 'acceptance'
// 归位结论写进验收台账时用的验收类别。
const RETURN_CATEGORY = '遗迹单位归位'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

// 两个编号不一致时以入库编号为准；入库编号缺失才退回现场编号、再退回单位编号。
function canonicalUnitCode(row: EntryRow): string {
  const archived = String(row['入库编号'] ?? '').trim()
  if (archived) {
    return archived
  }
  const field = String(row['现场编号'] ?? '').trim()
  if (field) {
    return field
  }
  return String(row['单位编号'] ?? '').trim()
}

// 读取归一：只把单位编号对齐到入库编号。开口层位、现存深度一律不动——
// 已归位的历史单位沿用当时的层位取值，不跟着这次改动被重算。
function normalizeFeatureRow(row: EntryRow): EntryRow {
  const code = canonicalUnitCode(row)
  if (code && String(row['单位编号'] ?? '') !== code) {
    return { ...row, '单位编号': code }
  }
  return row
}

// 所有读取都从这里过：列表、详情、导出取的是同一份数据、同一套编号归一。
function readRows(key: string): EntryRow[] {
  const rows = listRows(key)
  return key === FEATURE_KEY ? rows.map(normalizeFeatureRow) : rows
}

function findDrawing(code: string): EntryRow | undefined {
  return listRows(FEATURE_DRAWING_KEY).find((record) => String(record['单位编号']) === code)
}

function findReturnConclusion(code: string): EntryRow | undefined {
  const matched = listRows(ACCEPTANCE_KEY).filter(
    (row) =>
      String(row['关联单位'] ?? '') === code && String(row['验收类别'] ?? '') === RETURN_CATEGORY,
  )
  return matched[matched.length - 1]
}

function nextAcceptanceCode(rows: EntryRow[]): string {
  const maxSeq = rows.reduce((max, row) => {
    const match = /^ACCE-(\d+)$/.exec(String(row['验收单号'] ?? ''))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `ACCE-${String(maxSeq + 1).padStart(4, '0')}`
}

// 遗迹单位详情：单位行、绘图记录、验收台账结论一次取齐，和列表页读同一份。
export function getFeatureDetail(id: number): FeatureDetailResult {
  const row = readRows(FEATURE_KEY).find((item) => Number(item.id) === id)
  if (!row) {
    throw new Error(`没有找到编号为 ${id} 的遗迹单位`)
  }
  const code = canonicalUnitCode(row)
  return {
    row,
    drawing: findDrawing(code) ?? null,
    acceptance: findReturnConclusion(code) ?? null,
  }
}

// 完成绘图：绘图进度、开口层位、现存深度一次写全；同一单位只落一条绘图记录，
// 重复提交按已有记录处理，只把单位行对齐到台账里的取值。
function completeFeatureDrawing(id: number, payload: Record<string, string> = {}): ActionResult {
  const rows = listRows(FEATURE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的遗迹单位` }
  }
  const row = rows[index]
  if (String(row.status) === '已归位') {
    return { ok: false, message: '该遗迹单位已归位，历史层位取值保留，不再改动绘图记录' }
  }
  const code = canonicalUnitCode(row)
  const existing = findDrawing(code)
  const layer = String(payload['开口层位'] ?? existing?.['开口层位'] ?? row['开口层位'] ?? '').trim()
  const depth = String(payload['现存深度'] ?? existing?.['现存深度'] ?? row['现存深度'] ?? '').trim()
  if (!layer || !depth) {
    return { ok: false, message: '开口层位和现存深度要一起填全，才能落绘图记录' }
  }
  const operator = String(payload['绘图人'] ?? '').trim() || '值班管理员'
  const updated: EntryRow = {
    ...row,
    '单位编号': code,
    '开口层位': existing ? String(existing['开口层位']) : layer,
    '现存深度': existing ? String(existing['现存深度']) : depth,
    '单位状态': '已绘图',
    status: '已绘图',
    pending: true,
    abnormal: false,
  }
  const nextFeatures = [...rows]
  nextFeatures[index] = updated
  if (existing) {
    saveRows(FEATURE_KEY, nextFeatures)
    return {
      ok: true,
      message: `遗迹单位 ${code} 已有绘图记录，按已有记录处理，单位状态已对齐「已绘图」`,
    }
  }
  const drawings = listRows(FEATURE_DRAWING_KEY)
  const record: EntryRow = {
    id: nextId(drawings),
    status: '已绘图',
    pending: false,
    abnormal: false,
    '单位编号': code,
    '现场编号': String(row['现场编号'] ?? ''),
    '入库编号': String(row['入库编号'] ?? code),
    '开口层位': layer,
    '现存深度': depth,
    '绘图人': operator,
    '完成日期': today(),
  }
  // 单位行与绘图记录同一次落库，不会出现表单存了、持久层还是旧值的情况。
  saveMany({ [FEATURE_KEY]: nextFeatures, [FEATURE_DRAWING_KEY]: [...drawings, record] })
  return { ok: true, message: `遗迹单位 ${code} 绘图完成，绘图进度与层位、深度已一次写全` }
}

// 登记归位：结论落验收台账；校验不过的那一件单独退回，退回结论同样在台账留痕。
function registerFeatureReturn(id: number, payload: Record<string, string> = {}): ActionResult {
  const rows = listRows(FEATURE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的遗迹单位` }
  }
  const row = rows[index]
  const status = String(row.status)
  if (status === '已归位') {
    return { ok: false, message: '该遗迹单位已归位，不用重复登记' }
  }
  if (status !== '已绘图') {
    return { ok: false, message: '遗迹单位要先完成绘图，才能登记归位' }
  }
  const code = canonicalUnitCode(row)
  const record = findDrawing(code)
  const problems: string[] = []
  if (!record) {
    problems.push('缺少绘图记录')
  }
  const layer = String(record?.['开口层位'] ?? row['开口层位'] ?? '').trim()
  const depth = String(record?.['现存深度'] ?? row['现存深度'] ?? '').trim()
  if (!layer) {
    problems.push('开口层位空缺')
  }
  if (!depth) {
    problems.push('现存深度空缺')
  }

  const operator = String(payload['验收人'] ?? '').trim() || '值班管理员'
  const acceptanceRows = listRows(ACCEPTANCE_KEY)
  const base = {
    id: nextId(acceptanceRows),
    '验收单号': nextAcceptanceCode(acceptanceRows),
    '验收探方': String(row['所属探方'] ?? ''),
    '验收类别': RETURN_CATEGORY,
    '验收人': operator,
    '验收日期': today(),
    '关联单位': code,
  }

  if (problems.length > 0) {
    const conclusion = `遗迹单位 ${code} 归位校验不过，单独退回：${problems.join('、')}`
    const returned: EntryRow = {
      ...row,
      '单位编号': code,
      '单位状态': '已绘图',
      status: '已绘图',
      pending: true,
      abnormal: true,
    }
    const nextFeatures = [...rows]
    nextFeatures[index] = returned
    const entry: EntryRow = {
      ...base,
      status: '待验收',
      pending: true,
      abnormal: true,
      '遗留问题数': problems.length,
      '验收结论': conclusion,
      '验收状态': '待验收',
    }
    saveMany({ [FEATURE_KEY]: nextFeatures, [ACCEPTANCE_KEY]: [...acceptanceRows, entry] })
    return { ok: false, message: conclusion }
  }

  const conclusion = `遗迹单位 ${code} 归位验收通过：开口${layer}，现存深度${depth}`
  const done: EntryRow = {
    ...row,
    '单位编号': code,
    '单位状态': '已归位',
    status: '已归位',
    pending: false,
    abnormal: false,
  }
  const nextFeatures = [...rows]
  nextFeatures[index] = done
  const entry: EntryRow = {
    ...base,
    status: '已通过',
    pending: false,
    abnormal: false,
    '遗留问题数': 0,
    '验收结论': conclusion,
    '验收状态': '已通过',
  }
  saveMany({ [FEATURE_KEY]: nextFeatures, [ACCEPTANCE_KEY]: [...acceptanceRows, entry] })
  return { ok: true, message: conclusion }
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(readRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(
  key: string,
  id: number,
  action: string,
  payload: Record<string, string> = {},
): ActionResult {
  // 遗迹单位的绘图、归位走专用流转：要写绘图台账和验收台账，通用流转覆盖不了。
  if (key === FEATURE_KEY) {
    if (action === '完成绘图') {
      return completeFeatureDrawing(id, payload)
    }
    if (action === '登记归位') {
      return registerFeatureReturn(id, payload)
    }
  }
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of readRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
