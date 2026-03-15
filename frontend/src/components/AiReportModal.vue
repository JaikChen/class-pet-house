<template>
  <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" @click="$emit('close')">
    <div class="relative w-[92vw] sm:w-[600px] max-h-[85vh] bg-white rounded-2xl shadow-2xl p-5 sm:p-6 m-4 flex flex-col" @click.stop>
      
      <!-- 标题 -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-slate-800">📊 AI 班级报告</h3>
        <button @click="$emit('close')" class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors">✕</button>
      </div>

      <!-- 时间范围选择 -->
      <div class="flex gap-2 mb-4">
        <button v-for="d in dayOptions" :key="d.value" @click="days = d.value"
          class="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
          :class="days === d.value ? 'bg-sky-100 text-sky-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'">
          {{ d.label }}
        </button>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 min-h-0 overflow-y-auto mb-4">
        <div v-if="!content && !loading" class="text-center py-10 text-slate-400">
          <p class="text-4xl mb-3">📋</p>
          <p class="text-sm">选择时间范围后点击生成，AI将分析全班数据生成报告</p>
        </div>
        
        <div v-if="loading && !content" class="text-center py-10">
          <div class="inline-block w-8 h-8 border-3 border-sky-400 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p class="text-sm text-slate-400">AI 正在分析全班数据...</p>
        </div>

        <div v-if="content" class="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {{ content }}<span v-if="loading" class="inline-block w-1 h-4 bg-sky-400 animate-pulse ml-0.5 align-middle"></span>
        </div>

        <div v-if="error" class="bg-red-50 rounded-xl p-4 text-sm text-red-500">
          {{ error }}
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex gap-2">
        <button v-if="!content" @click="generate" :disabled="loading"
          class="flex-1 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-60">
          ✨ 生成报告
        </button>
        <template v-else>
          <button @click="generate" :disabled="loading"
            class="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-60">
            🔄 重新生成
          </button>
          <button @click="copyText"
            class="flex-1 py-2.5 bg-gradient-to-r from-sky-400 to-blue-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
            {{ copied ? '✅ 已复制' : '📋 复制文本' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  show: Boolean,
  classId: [Number, String]
})

defineEmits(['close'])

const dayOptions = [
  { label: '最近7天', value: 7 },
  { label: '最近14天', value: 14 },
  { label: '最近30天', value: 30 }
]

const days = ref(7)
const content = ref('')
const loading = ref(false)
const error = ref('')
const copied = ref(false)

const generate = async () => {
  if (loading.value) return
  content.value = ''
  error.value = ''
  loading.value = true
  copied.value = false

  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/ai/weekly-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        classId: props.classId,
        days: days.value
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '请求失败')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.content) {
            content.value += parsed.content
          }
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {
    error.value = e.message || '生成失败，请检查AI配置'
  } finally {
    loading.value = false
  }
}

const copyText = async () => {
  try {
    await navigator.clipboard.writeText(content.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = content.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>
