<template>
  <section class="page" data-module="feature">
    <header class="page-head">
      <div>
        <h2>遗迹单位管理</h2>
        <p class="page-desc">
          维护遗迹单位，围绕现场编号、入库编号、遗迹类型、所属探方、开口层位做登记、筛选与状态流转。
          编号以<strong>入库编号</strong>为准；绘图与层位资料在单位详情页一次写全。
        </p>
      </div>
      <div class="page-actions">
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
          <td v-for="column in columns" :key="column">
            <template v-if="column === '单位编号'">
              <RouterLink class="link" :to="`/feature/${row.id}`">{{ displayCode(row) }}</RouterLink>
              <span
                v-if="String(row['现场编号'] ?? '') && String(row['入库编号'] ?? '') && String(row['现场编号']) !== String(row['入库编号'])"
                class="code-note"
                title="现场编号与入库编号不一致，已按入库编号取值"
              >（现场：{{ row['现场编号'] }}）</span>
            </template>
            <template v-else>{{ row[column] === '' || row[column] == null ? '—' : row[column] }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-if="String(row.status) === '待清理'"
              class="link"
              type="button"
              @click="clean(row)"
            >提交清理</button>
            <button
              v-if="canDraw(row)"
              class="link"
              type="button"
              @click="openDrawing(row)"
            >{{ getDrawing(Number(row.id)) ? '查看绘图' : '完成绘图' }}</button>
            <button
              v-if="String(row.status) === '已绘图'"
              class="link"
              type="button"
              @click="returnFeature(row)"
            >登记归位</button>
            <button class="link" type="button" @click="openDetail(row)">详情</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无遗迹单位数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条遗迹单位记录</span>
      <span v-if="infoMessage" class="info-text">{{ infoMessage }}</span>
      <span v-else-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  canonicalFeatureCode,
  getDrawing,
  listFeatures,
  registerReturn,
  submitCleaning,
} from '@/api/feature-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('feature')
const columns = ["单位编号", "遗迹类型", "所属探方", "开口层位", "现存深度", "保存状况"]
const statuses = ["待清理", "清理中", "已绘图", "已归位"]

const router = useRouter()
const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const infoMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ["单位编号", "现场编号", "入库编号", "所属探方"]

const stats = computed(() => [
  { label: '清理中单位', value: rows.value.filter((row) => String(row.status) === '清理中').length },
  { label: '待清理单位', value: rows.value.filter((row) => String(row.status) === '待清理').length },
  { label: '已绘图单位', value: rows.value.filter((row) => ['已绘图', '已归位'].includes(String(row.status))).length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 列表与详情统一取入库编号，两个编号不一致时不再各显示各的。
function displayCode(row: EntryRow): string {
  return canonicalFeatureCode(row) || '—'
}

function canDraw(row: EntryRow): boolean {
  return ['待清理', '清理中', '已绘图'].includes(String(row.status))
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openDetail(row: EntryRow) {
  void router.push(`/feature/${row.id}`)
}

function openDrawing(row: EntryRow) {
  void router.push(`/feature/${row.id}?form=drawing`)
}

function flash(ok: boolean, message: string) {
  infoMessage.value = ok ? message : ''
  errorMessage.value = ok ? '' : message
}

function clean(row: EntryRow) {
  const result = submitCleaning(Number(row.id))
  flash(result.ok, result.message)
  reload()
}

function returnFeature(row: EntryRow) {
  const result = registerReturn(Number(row.id), '值班管理员')
  flash(result.ok, result.message)
  reload()
}

function reload() {
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    const items = listFeatures(filters.value)
    rows.value = items
    total.value = items.length
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '遗迹单位列表读取失败'
  }
}

onMounted(reload)
</script>
