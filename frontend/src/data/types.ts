/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 遗迹单位绘图记录：同一遗迹单位只落一条，重复提交按已有记录处理。 */
export type DrawingRecord = {
  id: number
  featureId: number
  /** 提交时按“入库编号为准”落定的单位编号，后续直接沿用。 */
  单位编号: string
  图号: string
  绘图人: string
  绘图日期: string
  备注: string
}

/** 归位验收台账条目：归位结论落到这里；校验不过的单件单独退回，同样留痕。 */
export type AcceptanceLedgerEntry = {
  id: number
  featureId: number
  单位编号: string
  归位日期: string
  归位结论: '验收通过' | '单独退回'
  验收人: string
  /** 归位当时的层位/深度快照，历史取值沿用，不随后续改动重算。 */
  开口层位: string
  现存深度: string
  退回原因: string
}
