import {
  listAcceptanceLedger,
  listDrawingRecords,
  listRows,
  saveAcceptanceLedger,
  saveDrawingRecords,
  saveRows,
} from '@/data/local-store'
import type {
  AcceptanceLedgerEntry,
  ActionResult,
  DrawingRecord,
  EntryRow,
} from '@/data/types'

// 遗迹单位的业务规则集中在这里，列表页、详情页都只走这一个入口，保证两处取同一份。

const FEATURE_KEY = 'feature'
const FINAL_STATUS = '已归位'

/** 现场编号与入库编号不一致时以入库编号为准；入库编号缺失才退回用现场编号补齐。 */
export function canonicalFeatureCode(row: EntryRow): string {
  const archived = String(row['入库编号'] ?? '').trim()
  if (archived) {
    return archived
  }
  return String(row['现场编号'] ?? row['单位编号'] ?? '').trim()
}

export function listFeatures(filters: Record<string, string> = {}): EntryRow[] {
  const rows = listRows(FEATURE_KEY)
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function getFeature(id: number): EntryRow | undefined {
  return listRows(FEATURE_KEY).find((row) => Number(row.id) === id)
}

export function listFeatureDrawings(): DrawingRecord[] {
  return listDrawingRecords()
}

export function getDrawing(featureId: number): DrawingRecord | undefined {
  return listDrawingRecords().find((record) => Number(record.featureId) === Number(featureId))
}

export function listFeatureAcceptance(): AcceptanceLedgerEntry[] {
  return listAcceptanceLedger()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export type DrawingDraft = {
  现场编号: string
  入库编号: string
  开口层位: string
  现存深度: string
  图号: string
  绘图人: string
  绘图日期: string
  备注?: string
}

export type DrawingResult = ActionResult & { duplicated?: boolean }

/**
 * 提交绘图：
 * - 开口层位、现存深度与进度、编号一次写全，持久层和表单读同一份；
 * - 同一遗迹单位只落一条绘图记录，重复提交直接按已有记录处理（幂等）；
 * - 已归位的历史单位锁死，绘图不改其层位取值。
 */
export function submitDrawing(featureId: number, draft: DrawingDraft): DrawingResult {
  const rows = listRows(FEATURE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === Number(featureId))
  if (index < 0) {
    return { ok: false, message: '没有找到这条遗迹单位' }
  }
  const current = rows[index]
  if (String(current.status) === FINAL_STATUS) {
    return { ok: false, message: '该遗迹单位已归位，绘图资料沿用归位当时的记录，不再改动' }
  }

  const existing = getDrawing(featureId)
  if (existing) {
    return {
      ok: true,
      duplicated: true,
      message: `该单位已有绘图记录（图号 ${existing.图号}），重复提交按已有记录处理，不另落新记录`,
    }
  }

  const siteCode = draft.现场编号.trim()
  const archiveCode = draft.入库编号.trim()
  const layer = draft.开口层位.trim()
  const depth = draft.现存深度.trim()
  const sheet = draft.图号.trim()
  const draftsman = draft.绘图人.trim()
  const missing: string[] = []
  if (!archiveCode && !siteCode) {
    missing.push('单位编号（现场编号、入库编号至少填一个）')
  }
  if (!layer) {
    missing.push('开口层位')
  }
  if (!depth) {
    missing.push('现存深度')
  }
  if (!sheet) {
    missing.push('图号')
  }
  if (!draftsman) {
    missing.push('绘图人')
  }
  if (missing.length > 0) {
    return { ok: false, message: `以下内容没写全，绘图没有落记录：${missing.join('、')}` }
  }

  // 编号以入库编号为准；入库编号缺时用现场编号补齐，保证两处读到的都是同一个值。
  const finalSiteCode = siteCode || archiveCode
  const finalArchiveCode = archiveCode || siteCode
  const code = finalArchiveCode

  const record: DrawingRecord = {
    id: listDrawingRecords().reduce((max, item) => Math.max(max, item.id), 0) + 1,
    featureId: Number(featureId),
    单位编号: code,
    图号: sheet,
    绘图人: draftsman,
    绘图日期: draft.绘图日期 || today(),
    备注: draft.备注?.trim() ?? '',
  }
  saveDrawingRecords([...listDrawingRecords(), record])

  const updated: EntryRow = {
    ...current,
    单位编号: code,
    现场编号: finalSiteCode,
    入库编号: finalArchiveCode,
    开口层位: layer,
    现存深度: depth,
    单位状态: '已绘图',
    status: '已绘图',
    pending: false,
    abnormal: false,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(FEATURE_KEY, nextRows)

  return {
    ok: true,
    message: `绘图已提交：单位 ${code}（图号 ${sheet}），开口层位、现存深度已一并写入`,
  }
}

export type ReturnResult = ActionResult & { ledgerId?: number; returned?: boolean }

/**
 * 登记归位：
 * - 必须先有绘图记录、且入库编号/开口层位/现存深度齐全，否则这一件单独退回，其他件不受影响；
 * - 验收通过才把单位置为已归位，结论连同当时的层位快照落到验收台账；
 * - 已归位单位重复操作按已有台账记录处理，不重算层位、不重复落账。
 */
export function registerReturn(
  featureId: number,
  operator: string,
): ReturnResult {
  const rows = listRows(FEATURE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === Number(featureId))
  if (index < 0) {
    return { ok: false, message: '没有找到这条遗迹单位' }
  }
  const current = rows[index]
  const code = canonicalFeatureCode(current)

  if (String(current.status) === FINAL_STATUS) {
    const passed = listAcceptanceLedger().find(
      (entry) => Number(entry.featureId) === Number(featureId) && entry.归位结论 === '验收通过',
    )
    if (passed) {
      return {
        ok: true,
        ledgerId: passed.id,
        message: `单位 ${code} 已归位，沿用验收台账第 ${passed.id} 条记录，不重复落账`,
      }
    }
  }

  const problems: string[] = []
  if (!getDrawing(featureId)) {
    problems.push('缺少绘图记录')
  }
  if (!String(current['入库编号'] ?? '').trim()) {
    problems.push('入库编号缺失')
  }
  if (!String(current['开口层位'] ?? '').trim()) {
    problems.push('开口层位未写全')
  }
  if (!String(current['现存深度'] ?? '').trim()) {
    problems.push('现存深度未写全')
  }

  const ledgerId = listAcceptanceLedger().reduce((max, entry) => Math.max(max, entry.id), 0) + 1

  // 校验不过：这一件单独退回，结论仍落到验收台账，单位状态不前进。
  if (problems.length > 0) {
    const reason = problems.join('；')
    const entry: AcceptanceLedgerEntry = {
      id: ledgerId,
      featureId: Number(featureId),
      单位编号: code || `遗迹单位#${featureId}`,
      归位日期: today(),
      归位结论: '单独退回',
      验收人: operator,
      开口层位: String(current['开口层位'] ?? ''),
      现存深度: String(current['现存深度'] ?? ''),
      退回原因: reason,
    }
    saveAcceptanceLedger([...listAcceptanceLedger(), entry])

    const updated: EntryRow = { ...current, abnormal: true }
    const nextRows = [...rows]
    nextRows[index] = updated
    saveRows(FEATURE_KEY, nextRows)

    return {
      ok: false,
      returned: true,
      ledgerId,
      message: `单位 ${entry.单位编号} 归位校验不过，已单独退回（台账第 ${ledgerId} 条）：${reason}`,
    }
  }

  // 验收通过：快照归位当时的层位取值，之后沿用，不再重算。
  const entry: AcceptanceLedgerEntry = {
    id: ledgerId,
    featureId: Number(featureId),
    单位编号: code,
    归位日期: today(),
    归位结论: '验收通过',
    验收人: operator,
    开口层位: String(current['开口层位']),
    现存深度: String(current['现存深度']),
    退回原因: '',
  }
  saveAcceptanceLedger([...listAcceptanceLedger(), entry])

  const updated: EntryRow = {
    ...current,
    单位编号: code,
    单位状态: FINAL_STATUS,
    status: FINAL_STATUS,
    pending: false,
    abnormal: false,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(FEATURE_KEY, nextRows)

  return {
    ok: true,
    ledgerId,
    message: `单位 ${code} 归位结论「验收通过」已落入验收台账第 ${ledgerId} 条`,
  }
}

/** 通用的提交清理动作仍走原流转；绘图/归位的专用规则只服务于遗迹单位。 */
export function submitCleaning(featureId: number): ActionResult {
  const rows = listRows(FEATURE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === Number(featureId))
  if (index < 0) {
    return { ok: false, message: '没有找到这条遗迹单位' }
  }
  const current = rows[index]
  if (String(current.status) === '清理中') {
    return { ok: true, message: '该单位已在清理中' }
  }
  if (['已绘图', FINAL_STATUS].includes(String(current.status))) {
    return { ok: false, message: `单位已到「${current.status}」，不能再提交清理` }
  }
  const updated: EntryRow = {
    ...current,
    单位状态: '清理中',
    status: '清理中',
    pending: true,
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(FEATURE_KEY, nextRows)
  return { ok: true, message: '已提交清理，当前状态「清理中」' }
}
