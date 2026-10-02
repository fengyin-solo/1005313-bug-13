<template>
  <section class="page" data-module="feature-detail">
    <header class="page-head">
      <div>
        <h2>遗迹单位详情</h2>
        <p class="page-desc">
          <RouterLink class="link" to="/feature">← 返回遗迹单位清单</RouterLink>
        </p>
      </div>
    </header>

    <template v-if="feature">
      <article class="detail-card">
        <header class="detail-card-head">
          <div>
            <h3 class="detail-title">{{ canonicalCode }}（{{ feature['遗迹类型'] }}）</h3>
            <p class="detail-sub">
              所属探方：{{ feature['所属探方'] }} · 当前状态：<strong>{{ feature.status }}</strong>
            </p>
          </div>
          <div class="detail-actions">
            <button
              v-if="String(feature.status) === '待清理'"
              class="btn"
              type="button"
              @click="clean"
            >提交清理</button>
            <button
              v-if="String(feature.status) === '已绘图'"
              class="btn primary"
              type="button"
              @click="returnFeature"
            >登记归位</button>
          </div>
        </header>

        <dl class="detail-grid">
          <div>
            <dt>现场编号</dt>
            <dd>{{ feature['现场编号'] || '—' }}</dd>
          </div>
          <div>
            <dt>入库编号</dt>
            <dd>{{ feature['入库编号'] || '—' }}</dd>
          </div>
          <div>
            <dt>开口层位</dt>
            <dd>{{ feature['开口层位'] || '—' }}</dd>
          </div>
          <div>
            <dt>现存深度</dt>
            <dd>{{ feature['现存深度'] || '—' }}</dd>
          </div>
          <div>
            <dt>平面形状</dt>
            <dd>{{ feature['平面形状'] || '—' }}</dd>
          </div>
          <div>
            <dt>保存状况</dt>
            <dd>{{ feature['保存状况'] || '—' }}</dd>
          </div>
        </dl>

        <p v-if="numberMismatch" class="warn-text">
          现场编号（{{ feature['现场编号'] }}）与入库编号（{{ feature['入库编号'] }}）不一致，系统统一按<strong>入库编号</strong>取值。
        </p>
        <p v-if="String(feature.status) === '已归位'" class="info-text">
          该单位为已归位历史单位，开口层位、现存深度沿用归位当时的取值，本次改动不会重算。
        </p>
      </article>

      <article v-if="drawing" class="detail-card">
        <header class="detail-card-head">
          <h3 class="detail-title">绘图记录</h3>
          <span class="legend-item">每个单位仅一条</span>
        </header>
        <dl class="detail-grid">
          <div>
            <dt>单位编号（入库编号）</dt>
            <dd>{{ drawing.单位编号 }}</dd>
          </div>
          <div>
            <dt>图号</dt>
            <dd>{{ drawing.图号 }}</dd>
          </div>
          <div>
            <dt>绘图人</dt>
            <dd>{{ drawing.绘图人 }}</dd>
          </div>
          <div>
            <dt>绘图日期</dt>
            <dd>{{ drawing.绘图日期 }}</dd>
          </div>
          <div class="detail-span">
            <dt>备注</dt>
            <dd>{{ drawing.备注 || '—' }}</dd>
          </div>
        </dl>
      </article>

      <article
        v-if="canEditDrawing"
        ref="formCard"
        class="detail-card"
        :class="{ 'form-flash': formOpen }"
      >
        <header class="detail-card-head">
          <h3 class="detail-title">{{ drawing ? '核对绘图资料' : '完成绘图' }}</h3>
          <button v-if="!formOpen" class="link" type="button" @click="formOpen = true">
            {{ drawing ? '查看/补录' : '填写绘图记录' }}
          </button>
        </header>

        <form v-if="formOpen || shouldOpenForm" class="drawing-form" @submit.prevent="submit">
          <p class="form-hint">
            进度与开口层位、现存深度一次写全；同一单位重复提交只保留已有那一条记录。
          </p>
          <label>
            <span>现场编号</span>
            <input v-model="form.现场编号" placeholder="如 XC-M07" />
          </label>
          <label>
            <span>入库编号<em>*</em></span>
            <input v-model="form.入库编号" placeholder="以入库编号为准" />
          </label>
          <label>
            <span>开口层位<em>*</em></span>
            <input v-model="form.开口层位" placeholder="如 第2层下" />
          </label>
          <label>
            <span>现存深度<em>*</em></span>
            <input v-model="form.现存深度" placeholder="如 1.20m" />
          </label>
          <label>
            <span>图号<em>*</em></span>
            <input v-model="form.图号" placeholder="如 H-2026-0008" />
          </label>
          <label>
            <span>绘图人<em>*</em></span>
            <input v-model="form.绘图人" />
          </label>
          <label>
            <span>绘图日期<em>*</em></span>
            <input v-model="form.绘图日期" type="date" />
          </label>
          <label class="detail-span">
            <span>备注</span>
            <input v-model="form.备注" />
          </label>
          <div class="form-actions">
            <button class="btn primary" type="submit">提交绘图</button>
            <button class="btn ghost" type="button" @click="formOpen = false">收起</button>
          </div>
        </form>
      </article>

      <article v-if="ledger" class="detail-card" :class="{ returned: ledger.归位结论 === '单独退回' }">
        <header class="detail-card-head">
          <h3 class="detail-title">归位验收台账（第 {{ ledger.id }} 条）</h3>
          <span class="legend-item" :class="{ 'legend-returned': ledger.归位结论 === '单独退回' }">
            {{ ledger.归位结论 }}
          </span>
        </header>
        <dl class="detail-grid">
          <div>
            <dt>归位日期</dt>
            <dd>{{ ledger.归位日期 }}</dd>
          </div>
          <div>
            <dt>验收人</dt>
            <dd>{{ ledger.验收人 }}</dd>
          </div>
          <div>
            <dt>开口层位（归位当时）</dt>
            <dd>{{ ledger.开口层位 || '—' }}</dd>
          </div>
          <div>
            <dt>现存深度（归位当时）</dt>
            <dd>{{ ledger.现存深度 || '—' }}</dd>
          </div>
          <div v-if="ledger.归位结论 === '单独退回'" class="detail-span">
            <dt>退回原因</dt>
            <dd class="error-text">{{ ledger.退回原因 }}</dd>
          </div>
        </dl>
      </article>

      <footer class="page-foot">
        <span v-if="infoMessage" class="info-text">{{ infoMessage }}</span>
        <span v-else-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </footer>
    </template>

    <p v-else class="empty-state">没有找到这条遗迹单位，<RouterLink class="link" to="/feature">返回清单</RouterLink>。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  canonicalFeatureCode,
  getDrawing,
  getFeature,
  listFeatureAcceptance,
  registerReturn,
  submitCleaning,
  submitDrawing,
  type DrawingDraft,
} from '@/api/feature-service'
import type { AcceptanceLedgerEntry, DrawingRecord, EntryRow } from '@/data/types'

const route = useRoute()
const featureId = Number(route.params.id)

const feature = ref<EntryRow | undefined>(getFeature(featureId))
const drawing = ref<DrawingRecord | undefined>(getDrawing(featureId))
const ledger = ref<AcceptanceLedgerEntry | undefined>(
  listFeatureAcceptance()
    .filter((entry) => Number(entry.featureId) === featureId)
    .at(-1),
)

const shouldOpenForm = computed(() => route.query.form === 'drawing')
const formOpen = ref(shouldOpenForm.value)
const errorMessage = ref('')
const infoMessage = ref('')

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const form = reactive<DrawingDraft>({
  现场编号: '',
  入库编号: '',
  开口层位: '',
  现存深度: '',
  图号: '',
  绘图人: '',
  绘图日期: today(),
  备注: '',
})

const canonicalCode = computed(() =>
  feature.value ? canonicalFeatureCode(feature.value) : '',
)

const numberMismatch = computed(() => {
  if (!feature.value) {
    return false
  }
  const site = String(feature.value['现场编号'] ?? '').trim()
  const archive = String(feature.value['入库编号'] ?? '').trim()
  return Boolean(site && archive && site !== archive)
})

const canEditDrawing = computed(() => {
  if (!feature.value) {
    return false
  }
  // 已归位的历史单位不在详情页改绘图资料；其余状态都允许补录/核对。
  return String(feature.value.status) !== '已归位'
})

function syncForm() {
  if (!feature.value) {
    return
  }
  form.现场编号 = String(feature.value['现场编号'] ?? feature.value['单位编号'] ?? '')
  form.入库编号 = String(feature.value['入库编号'] ?? '')
  form.开口层位 = String(feature.value['开口层位'] ?? '')
  form.现存深度 = String(feature.value['现存深度'] ?? '')
}

function refresh() {
  feature.value = getFeature(featureId)
  drawing.value = getDrawing(featureId)
  ledger.value = listFeatureAcceptance()
    .filter((entry) => Number(entry.featureId) === featureId)
    .at(-1)
  syncForm()
}

function flash(ok: boolean, message: string) {
  infoMessage.value = ok ? message : ''
  errorMessage.value = ok ? '' : message
}

function submit() {
  const result = submitDrawing(featureId, form)
  flash(result.ok, result.message)
  refresh()
  if (result.ok && !result.duplicated) {
    formOpen.value = false
  }
}

function clean() {
  const result = submitCleaning(featureId)
  flash(result.ok, result.message)
  refresh()
}

function returnFeature() {
  const result = registerReturn(featureId, '值班管理员')
  flash(result.ok, result.message)
  refresh()
}

onMounted(refresh)
</script>
