import { onMounted, onUnmounted } from 'vue'

export function useEscClose(emit) {
  function onKeydown(e) {
    if (e.key === 'Escape') emit('close')
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}
