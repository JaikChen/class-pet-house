<template>
  <span class="inline-flex overflow-hidden tabular-nums leading-none">
    <transition
      name="odometer"
      mode="out-in"
    >
      <span :key="value" class="inline-block">{{ value }}</span>
    </transition>
  </span>
</template>

<script setup>
defineProps({
  value: {
    type: [Number, String],
    required: true
  }
})
</script>

<style scoped>
.odometer-enter-active,
.odometer-leave-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.odometer-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.odometer-leave-to {
  transform: translateY(-100%);
  opacity: 0;
  position: absolute;
}
</style>
