<template>
  <section class="page" data-module="acceptance">
    <header class="page-head">
      <div>
        <h2>探方验收管理</h2>
        <p class="page-desc">维护探方验收单，围绕验收单号、验收探方、验收类别、验收人做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记探方验收单</button>
        <button class="btn" type="button" @click="exportRows">导出探方验收清单</button>
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
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
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
          <td :colspan="columns.length + 2" class="empty-state">暂无探方验收数据，可先登记探方验收单</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条探方验收记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="ledger-block">
      <header class="ledger-head">
        <h3>遗迹单位归位验收台账</h3>
        <p class="page-desc">遗迹单位登记归位后的结论统一落在这里；校验不过的单件单独退回。</p>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in ledgerColumns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in ledger"
            :key="String(entry.id)"
            :class="{ 'row-returned': entry.归位结论 === '单独退回' }"
          >
            <td>{{ entry.id }}</td>
            <td>{{ entry.单位编号 }}</td>
            <td>{{ entry.归位日期 }}</td>
            <td :class="{ 'error-text': entry.归位结论 === '单独退回' }">{{ entry.归位结论 }}</td>
            <td>{{ entry.验收人 }}</td>
            <td>{{ entry.开口层位 || '—' }}</td>
            <td>{{ entry.现存深度 || '—' }}</td>
            <td>{{ entry.退回原因 || '—' }}</td>
          </tr>
          <tr v-if="!ledger.length">
            <td :colspan="ledgerColumns.length" class="empty-state">暂无归位验收记录</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listFeatureAcceptance } from '@/api/feature-service'
import type { AcceptanceLedgerEntry, EntryRow } from '@/data/types'

const meta = moduleMeta('acceptance')
const columns = ["验收单号", "验收探方", "验收类别", "验收人", "验收日期", "遗留问题数", "验收结论", "验收状态"]
const actions = ["提交验收", "确认通过", "要求整改"]
const statuses = ["待验收", "验收中", "已通过", "已整改"]
const stats = [{"label": "待验收探方", "value": 0}, {"label": "已通过探方", "value": 0}, {"label": "遗留问题总数", "value": 0}]
const ledgerColumns = ["台账序号", "单位编号", "归位日期", "归位结论", "验收人", "开口层位", "现存深度", "退回原因"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const ledger = ref<AcceptanceLedgerEntry[]>([])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '探方验收单登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    ledger.value = listFeatureAcceptance().slice().reverse()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '探方验收列表读取失败'
  }
}

onMounted(reload)
</script>
