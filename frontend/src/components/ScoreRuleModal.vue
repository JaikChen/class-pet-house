<template>
  <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="bg-white rounded-[1.8rem] shadow-2xl w-full max-w-[480px] p-5 sm:p-6 max-h-[92vh] flex flex-col relative overflow-hidden animate-slide-up-fade">
      
      <!-- 头部 -->
      <div class="flex flex-col items-center mb-5 relative z-10 pt-2">
        <p class="text-sm font-bold text-slate-400 mb-1">选择项目</p>
        <h3 class="font-black text-slate-800 text-xl sm:text-2xl tracking-wide flex items-center gap-1.5">
          给 <span class="text-[#c084fc]">{{ student ? student.name : `批量操作 (${batchIds.length}人)` }}</span> 加分/扣分
        </h3>
        
        <button @click="$emit('close')" class="absolute right-0 -top-2 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg">
          ✕
        </button>
      </div>

      <!-- 搜索栏 -->
      <div class="mb-5 relative z-10 w-full px-1">
        <div class="w-full h-11 sm:h-12 flex items-center bg-white border-2 border-indigo-200 rounded-full px-4 transition-colors shadow-[0_2px_10px_rgba(0,0,0,0.02)] focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
          <span class="text-slate-400 mr-2 text-base">🔍</span>
          <input v-model="filterKeyword" type="text" placeholder="搜索项目 (支持字母如 'cd' 搜 '迟到')" class="w-full bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400 font-medium" />
        </div>
      </div>

      <!-- 快捷筛选 Tabs -->
      <div class="flex items-center gap-4 mb-4 px-2 border-b border-slate-100">
        <button @click="filterType = 'all'"
          class="pb-3 text-sm font-bold transition-all relative"
          :class="filterType === 'all' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'">
          <span class="flex items-center gap-1">✨ 全部项</span>
          <div v-if="filterType === 'all'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full"></div>
        </button>
        <button @click="filterType = 'add'"
          class="pb-3 text-sm font-bold transition-all relative"
          :class="filterType === 'add' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'">
          <span class="flex items-center gap-1"><span class="text-emerald-500 text-lg leading-none">+</span> 加分项</span>
          <div v-if="filterType === 'add'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full"></div>
        </button>
        <button @click="filterType = 'deduct'"
          class="pb-3 text-sm font-bold transition-all relative"
          :class="filterType === 'deduct' ? 'text-red-500' : 'text-slate-400 hover:text-slate-600'">
          <span class="flex items-center gap-1"><span class="text-red-400 text-lg leading-none">-</span> 扣分项</span>
          <div v-if="filterType === 'deduct'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400 rounded-t-full"></div>
        </button>
      </div>

      <!-- 规则网格 -->
      <div class="grid grid-cols-2 min-[400px]:grid-cols-3 gap-3 sm:gap-4 overflow-y-auto px-1 pb-4 custom-scrollbar relative z-10 content-start flex-1 min-h-[300px]">
        <button v-for="rule in rules" :key="rule.id"
          @click="applyRule(rule)"
          class="group flex flex-col items-center py-4 px-2 rounded-2xl bg-white border-[1.5px] transition-all duration-200 hover:scale-[1.02] active:scale-95 focus:outline-none"
          :class="rule.value > 0 ? 'border-emerald-100 hover:border-emerald-300 hover:shadow-[0_4px_12px_rgba(16,185,129,0.1)]' : 'border-red-100 hover:border-red-300 hover:shadow-[0_4px_12px_rgba(239,68,68,0.1)]'">
          
          <!-- 图标底座 (根据图片，绿色方块底) -->
          <div class="w-12 h-12 rounded-[14px] flex items-center justify-center text-2xl mb-2 transition-transform group-hover:scale-110"
            :class="rule.value > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50/80 text-red-500'">
            {{ rule.icon || (rule.value > 0 ? '🌟' : '⚠️') }}
          </div>
          
          <div class="font-bold text-slate-700 text-[13px] text-center w-full leading-snug mb-2 truncate px-1">{{ rule.name }}</div>
          
          <!-- 分值胶囊 -->
          <div class="mt-auto font-black text-xs px-2.5 py-0.5 rounded-full flex items-center gap-0.5 font-mono"
            :class="rule.value > 0 ? 'text-emerald-500 bg-emerald-50/50' : 'text-red-500 bg-red-50/50'">
            <span>{{ rule.value > 0 ? '+' : '' }}{{ rule.value }}</span> <span class="text-[12px] -ml-0.5">🍖</span>
          </div>
        </button>
        
        <div v-if="rules.length === 0" class="col-span-full py-10 text-center text-slate-400 text-sm font-bold">
          没有找到对应的打分项...
        </div>
      </div>
      
      <!-- 底部提示 -->
      <div class="mt-3 text-center text-[11px] text-slate-400 flex justify-center items-center gap-1 font-medium">
        ✨ 点击项目直接操作
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useClassStore } from '../stores/class'
import { useEscClose } from '../composables/useEscClose'
import api from '../utils/api'
import Dialog from '../utils/dialog'
import { pinyin } from 'pinyin-pro'
import { fireGrandConfetti, firePopConfetti } from '../utils/confetti'
import { audioManager } from '../utils/audio'

const props = defineProps({
  student: Object,
  batchIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'scored'])
useEscClose(emit)
const classStore = useClassStore()

const filterKeyword = ref('')
const filterType = ref('all') // 'all' | 'add' | 'deduct'

const rules = computed(() => {
  let list = classStore.scoreRules || []
  
  // 快捷筛选
  if (filterType.value === 'add') {
    list = list.filter(r => r.value > 0)
  } else if (filterType.value === 'deduct') {
    list = list.filter(r => r.value < 0)
  }

  // 关键字搜索
  if (filterKeyword.value) {
    const lowerKwd = filterKeyword.value.toLowerCase().trim()
    list = list.filter(r => {
      const name = (r.name || '').toLowerCase()
      const pyFirstLetters = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase()
      const pyFull = pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase()
      
      return name.includes(lowerKwd) || pyFirstLetters.includes(lowerKwd) || pyFull.includes(lowerKwd)
    })
  }
  
  return list
})

onMounted(async () => {
  // 取消自动聚焦了，提升移动端和平板体验
  if (!classStore.scoreRules.length && classStore.currentClass) {
    await classStore.fetchScoreRules()
  }
})

async function applyRule(rule) {
  audioManager.playPop() // 播放选中汽泡音
  const targetName = props.student ? props.student.name : `已选的 ${props.batchIds.length} 名学生`
  
  if (await Dialog.confirm(`确定要给 ${targetName} 使用规则【${rule.name}】(${rule.value}分) 吗？`)) {
    try {
      if (rule.value > 0) {
        audioManager.playScore()
        if (rule.value >= 10) fireGrandConfetti()
        else firePopConfetti()
      } else if (rule.value < 0) {
        audioManager.playPop() // 扣分只播放气泡音
      }

      const ids = props.batchIds.length
        ? props.batchIds
        : [props.student.id]
      await api.post('/history', {
        class_id: classStore.currentClass.id,
        student_ids: ids,
        rule_id: rule.id
      })
      emit('scored')
    } catch (err) {
      Dialog.alert(err.error || '操作失败')
    }
  }
}
</script>
