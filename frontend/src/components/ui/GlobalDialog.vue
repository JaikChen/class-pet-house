<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="card-toy bg-white/90 w-full max-w-sm rounded-3xl p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border-2 border-white transform transition-all animate-bounce-in relative overflow-hidden text-center">
        <!-- 装饰性光晕背景 -->
        <div class="absolute -top-10 -right-10 w-32 h-32 bg-theme-light rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        <div class="absolute -bottom-10 -left-10 w-32 h-32 bg-theme-ring rounded-full blur-3xl opacity-20 pointer-events-none"></div>

        <!-- 图标 (基于类型) -->
        <div class="text-4xl mb-3 mt-2 relative z-10 animate-bounce">
          {{ type === 'alert' ? '✨' : type === 'confirm' ? '🤔' : '📝' }}
        </div>

        <!-- 消息内容 -->
        <h3 class="text-lg font-bold text-gray-800 font-kuaile mb-2 relative z-10">{{ title || (type === 'alert' ? '提示' : type === 'confirm' ? '确认操作' : '请输入') }}</h3>
        <p class="text-gray-600 text-sm font-medium mb-5 relative z-10 whitespace-pre-wrap">{{ message }}</p>

        <!-- Prompt 输入框 -->
        <div v-if="type === 'prompt'" class="mb-5 relative z-10">
          <input
            ref="inputRef"
            v-model="inputValue"
            type="text"
            class="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-center text-sm font-bold text-gray-700 outline-none focus:border-accent focus:shadow-[0_4px_15px_-3px_var(--theme-light)] transition-all placeholder-gray-300"
            @keyup.enter="handleConfirm"
          />
        </div>

        <!-- 按钮组 -->
        <div class="flex gap-3 justify-center relative z-10">
          <button
            v-if="type === 'confirm' || type === 'prompt'"
            @click="handleCancel"
            class="btn-toy flex-1 py-2.5 bg-gray-100/80 hover:bg-gray-200 border-2 border-white rounded-xl text-gray-600 font-bold text-sm shadow-[0_4px_0_#e5e7eb]"
          >
            取消
          </button>
          <button
            @click="handleConfirm"
            class="btn-toy flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-[0_4px_0_var(--theme-shadow-hard)]"
          >
            {{ type === 'alert' ? '我知道了' : '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

const props = defineProps({
  type: { type: String, default: 'alert' }, // 'alert' | 'confirm' | 'prompt'
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  defaultValue: { type: String, default: '' },
  onConfirm: { type: Function },
  onCancel: { type: Function }
})

const visible = ref(false)
const inputValue = ref(props.defaultValue)
const inputRef = ref(null)

onMounted(() => {
  visible.value = true
  if (props.type === 'prompt') {
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})

const close = () => {
  visible.value = false
  // 延迟销毁以允许动画播放完毕
  setTimeout(() => {
    if (props.onCancel) props.onCancel()
  }, 200)
}

const handleConfirm = () => {
  visible.value = false
  setTimeout(() => {
    if (props.onConfirm) {
      if (props.type === 'prompt') {
        props.onConfirm(inputValue.value)
      } else {
        props.onConfirm(true)
      }
    }
  }, 200)
}

const handleCancel = () => {
  close()
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
