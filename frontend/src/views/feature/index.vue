<template>
  <section class="page" data-module="feature">
    <header class="page-head">
      <div>
        <h2>遗迹单位管理</h2>
        <p class="page-desc">
          维护遗迹单位，围绕单位编号、遗迹类型、所属探方、开口层位做登记、筛选与状态流转；编号以入库编号为准，绘图进度与归位结论全程留痕。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记遗迹单位</button>
        <button class="btn" type="button" @click="exportRows">导出遗迹单位清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] || '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无遗迹单位数据，可先登记遗迹单位</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条遗迹单位记录</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section v-if="detail" class="detail-panel">
      <header class="detail-head">
        <h3>遗迹单位详情 · {{ detail.row['单位编号'] }}</h3>
        <button class="btn ghost" type="button" @click="detail = null">收起</button>
      </header>
      <p v-if="codeMismatch" class="mismatch-hint">
        现场编号「{{ detail.row['现场编号'] }}」与入库编号「{{ detail.row['入库编号'] }}」不一致，已按入库编号为准。
      </p>
      <dl class="detail-grid">
        <div v-for="field in detailFields" :key="field">
          <dt>{{ field }}</dt>
          <dd>{{ detail.row[field] || '—' }}</dd>
        </div>
        <div>
          <dt>当前状态</dt>
          <dd>{{ detail.row.status }}</dd>
        </div>
      </dl>
      <div class="detail-block">
        <h4>绘图记录</h4>
        <dl v-if="detail.drawing" class="detail-grid">
          <div>
            <dt>绘图人</dt>
            <dd>{{ detail.drawing['绘图人'] || '—' }}</dd>
          </div>
          <div>
            <dt>完成日期</dt>
            <dd>{{ detail.drawing['完成日期'] || '—' }}</dd>
          </div>
          <div>
            <dt>开口层位</dt>
            <dd>{{ detail.drawing['开口层位'] || '—' }}</dd>
          </div>
          <div>
            <dt>现存深度</dt>
            <dd>{{ detail.drawing['现存深度'] || '—' }}</dd>
          </div>
        </dl>
        <p v-else class="empty-state">尚未落绘图记录，点「完成绘图」把绘图进度、开口层位、现存深度一次写全。</p>
      </div>
      <div class="detail-block">
        <h4>验收台账结论</h4>
        <dl v-if="detail.acceptance" class="detail-grid">
          <div>
            <dt>验收单号</dt>
            <dd>{{ detail.acceptance['验收单号'] || '—' }}</dd>
          </div>
          <div>
            <dt>验收日期</dt>
            <dd>{{ detail.acceptance['验收日期'] || '—' }}</dd>
          </div>
          <div>
            <dt>验收结论</dt>
            <dd>{{ detail.acceptance['验收结论'] || '—' }}</dd>
          </div>
        </dl>
        <p v-else class="empty-state">验收台账里还没有这一单位的归位结论。</p>
      </div>
    </section>

    <div v-if="drawingForm" class="modal-mask" @click.self="drawingForm = null">
      <form class="modal-card" @submit.prevent="submitDrawing">
        <h3>完成绘图 · {{ drawingForm.code }}</h3>
        <p class="modal-hint">绘图进度、开口层位、现存深度会一次写全；同一单位只落一条绘图记录，重复提交按已有记录处理。</p>
        <label class="modal-field">
          <span>开口层位</span>
          <input v-model="drawingForm.开口层位" placeholder="如：②层下" required />
        </label>
        <label class="modal-field">
          <span>现存深度</span>
          <input v-model="drawingForm.现存深度" placeholder="如：1.20米" required />
        </label>
        <label class="modal-field">
          <span>绘图人</span>
          <input v-model="drawingForm.绘图人" />
        </label>
        <p v-if="drawingError" class="error-text">{{ drawingError }}</p>
        <div class="modal-actions">
          <button class="btn primary" type="submit">提交绘图</button>
          <button class="btn" type="button" @click="drawingForm = null">取消</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  getFeatureDetail,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, FeatureDetailResult } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('feature')
const store = useSessionStore()
const columns = ["单位编号", "现场编号", "入库编号", "遗迹类型", "所属探方", "开口层位", "现存深度", "单位状态"]
const detailFields = ["单位编号", "现场编号", "入库编号", "遗迹类型", "所属探方", "开口层位", "平面形状", "现存深度", "保存状况", "单位状态"]
const actions = ["提交清理", "完成绘图", "登记归位"]
const statuses = ["待清理", "清理中", "已绘图", "已归位"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const detail = ref<FeatureDetailResult | null>(null)
const drawingForm = ref<{
  id: number
  code: string
  开口层位: string
  现存深度: string
  绘图人: string
} | null>(null)
const drawingError = ref('')

const stats = computed(() =>
  ['清理中', '待清理', '已绘图'].map((status) => ({
    label: `${status}单位`,
    value: rows.value.filter((row) => String(row.status) === status).length,
  })),
)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)
const codeMismatch = computed(() => {
  if (!detail.value) {
    return false
  }
  const field = String(detail.value.row['现场编号'] ?? '').trim()
  const archived = String(detail.value.row['入库编号'] ?? '').trim()
  return Boolean(field && archived && field !== archived)
})

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '遗迹单位登记入口尚未接入审批流'
}

function openDetail(row: EntryRow) {
  errorMessage.value = ''
  try {
    detail.value = getFeatureDetail(Number(row.id))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '遗迹单位详情读取失败'
  }
}

function refreshDetail(id: number) {
  if (!detail.value || Number(detail.value.row.id) !== id) {
    return
  }
  try {
    detail.value = getFeatureDetail(id)
  } catch {
    detail.value = null
  }
}

function openDrawing(row: EntryRow) {
  drawingError.value = ''
  let layer = String(row['开口层位'] ?? '')
  let depth = String(row['现存深度'] ?? '')
  try {
    const current = getFeatureDetail(Number(row.id))
    if (current.drawing) {
      // 已落库的绘图记录优先，再次进入表单看到的是持久层里的取值。
      layer = String(current.drawing['开口层位'] ?? layer)
      depth = String(current.drawing['现存深度'] ?? depth)
    }
  } catch {
    // 详情取不到就按列表行预填，提交时服务端还会再校验。
  }
  drawingForm.value = {
    id: Number(row.id),
    code: String(row['单位编号']),
    开口层位: layer,
    现存深度: depth,
    绘图人: store.operator,
  }
}

function submitDrawing() {
  const form = drawingForm.value
  if (!form) {
    return
  }
  drawingError.value = ''
  const result = applyAction(meta.key, form.id, '完成绘图', {
    开口层位: form.开口层位,
    现存深度: form.现存深度,
    绘图人: form.绘图人,
  })
  if (!result.ok) {
    drawingError.value = result.message
    return
  }
  noticeMessage.value = result.message
  drawingForm.value = null
  reload()
  refreshDetail(form.id)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  if (action === '完成绘图') {
    openDrawing(row)
    return
  }
  const payload: Record<string, string> = action === '登记归位' ? { 验收人: store.operator } : {}
  const result = applyAction(meta.key, Number(row.id), action, payload)
  if (result.ok) {
    noticeMessage.value = result.message
  } else {
    errorMessage.value = result.message
  }
  reload()
  refreshDetail(Number(row.id))
}

function reload() {
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '遗迹单位列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.detail-panel {
  margin-top: 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-head h3 {
  margin: 0;
  font-size: 15px;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px 16px;
  margin: 8px 0;
}
.detail-grid dt {
  font-size: 12px;
  color: var(--muted);
}
.detail-grid dd {
  margin: 2px 0 0;
  font-size: 13px;
}
.detail-block h4 {
  margin: 12px 0 4px;
  font-size: 13px;
}
.mismatch-hint {
  color: #b45309;
  font-size: 12px;
  margin: 8px 0 0;
}
.notice-text {
  color: #027a48;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal-card h3 {
  margin: 0;
  font-size: 15px;
}
.modal-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.modal-field span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
