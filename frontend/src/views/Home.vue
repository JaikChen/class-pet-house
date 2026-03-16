<template>
  <div>
    <GroupManageView v-if="groupMode" @close="$emit('exit-group-mode')" />

    <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4 lg:gap-6 px-1 sm:px-0 py-2">
      <StudentCard
        v-for="(s, index) in filteredStudents" :key="s.id"
        class="animate-stagger-fade-in"
        :style="{ animationDelay: `${index * 0.04}s` }"
        :student="s"
        :batch-mode="batchMode"
        :undo-mode="undoMode"
        :selected="selectedStudents.has(s.id)"
        :growth-stages="classStore.currentClass?.growth_stages || defaultStages"
        @click="handleCardClick(s)"
        @select="$emit('select-student', s.id)"
        @change-pet="handleChangePet(s)"
        @graduate="handleGraduate(s)"
        @show-badges="handleShowBadges(s)"
        @print-cert="handlePrintCert(s)"
        @ai-evaluate="handleAiEvaluate(s)"
      />
    </div>

    <div v-if="!filteredStudents.length" class="text-center py-20 text-gray-400">
      <p class="text-4xl mb-2">🥚</p>
      <p>还没有符合条件的学生</p>
    </div>

    <ScoreRuleModal
      v-if="showScoreModal"
      :student="selectedStudent"
      @close="showScoreModal = false"
      @scored="onScored"
    />

    <PetSelectModal
      v-if="showPetModal"
      :student="selectedStudent"
      @close="showPetModal = false"
      @selected="onPetSelected"
    />

    <GraduateModal
      v-if="showGraduateModal"
      :student="selectedStudent"
      @close="showGraduateModal = false"
      @graduated="onGraduated"
    />

    <BadgeWall
      v-if="showBadgeWall"
      :student="selectedStudent"
      @close="showBadgeWall = false"
    />

    <CertificateModal
      v-if="showCertificateModal"
      :show="showCertificateModal"
      :student="selectedStudent"
      :growth-stages="classStore.currentClass?.growth_stages"
      @close="showCertificateModal = false"
    />

    <AiEvaluateModal
      v-if="showAiEvaluate"
      :show="showAiEvaluate"
      :student="selectedStudent"
      :class-id="classStore.currentClass?.id"
      @close="showAiEvaluate = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useClassStore } from '../stores/class'
import StudentCard from '../components/StudentCard.vue'
import ScoreRuleModal from '../components/ScoreRuleModal.vue'
import PetSelectModal from '../components/PetSelectModal.vue'
import GraduateModal from '../components/GraduateModal.vue'
import BadgeWall from '../components/BadgeWall.vue'
import CertificateModal from '../components/CertificateModal.vue'
import AiEvaluateModal from '../components/AiEvaluateModal.vue'
import GroupManageView from '../components/GroupManageView.vue'
import api from '../utils/api'
import Dialog from '../utils/dialog'

const props = defineProps({
  searchQuery: String,
  batchMode: Boolean,
  undoMode: Boolean,
  groupMode: Boolean,
  activeGroup: [Number, String],
  selectedStudents: Set,
  sortMode: {
    type: String,
    default: 'manual'
  }
})

const emit = defineEmits(['select-student', 'exit-group-mode'])
const classStore = useClassStore()
const showScoreModal = ref(false)
const showPetModal = ref(false)
const showGraduateModal = ref(false)
const showBadgeWall = ref(false)
const showCertificateModal = ref(false)
const showAiEvaluate = ref(false)
const selectedStudent = ref(null)
const defaultStages = [0, 5, 10, 20, 30, 45, 60, 75, 90, 100]

// 防止重复点击撤回操作的并发锁
const isRevoking = ref(false)

const filteredStudents = computed(() => {
  // 核心优化：避免使用 .map(s => ({ ...s }))，直接使用浅拷贝扩展运算符
  // 因为我们只是对数组进行过滤和排序，并不会直接修改对象的属性值
  let list = [...classStore.students]

  // 搜索过滤
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase().trim()
    list = list.filter(s => s.name.toLowerCase().includes(q))
  }

  // 分组过滤
  if (props.activeGroup === 'ungrouped') {
    list = list.filter(s => !s.group_id)
  } else if (props.activeGroup) {
    list = list.filter(s => s.group_id === props.activeGroup)
  }

  // 排序
  if (props.sortMode === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  } else if (props.sortMode === 'food') {
    list.sort((a, b) => b.food_count - a.food_count)
  } else if (props.sortMode === 'progress') {
    const stages = classStore.currentClass?.growth_stages || defaultStages
    const max = stages[stages.length - 1]
    list.sort((a, b) => (b.food_count / max) - (a.food_count / max))
  }

  return list
})

function handleCardClick(student) {
  if (props.batchMode) {
    emit('select-student', student.id)
    return
  }
  if (props.undoMode) {
    revokeLastAction(student)
    return
  }
  selectedStudent.value = student
  if (!student.pet_type) {
    showPetModal.value = true
  } else {
    showScoreModal.value = true
  }
}

async function revokeLastAction(student) {
  if (isRevoking.value) return; // 拦截双击/连点
  isRevoking.value = true;
  try {
    const { rows } = await api.get(`/history/class/${classStore.currentClass.id}?limit=1&student_id=${student.id}`)
    if (rows && rows.length > 0) {
      await api.post('/history/revoke', { record_id: rows[0].id })
      await classStore.fetchStudents()
    } else {
      Dialog.alert('该学生暂无可撤回的记录');
    }
  } catch (err) {
    Dialog.alert(err?.error || '撤回失败')
  } finally {
    isRevoking.value = false;
  }
}

async function onScored() {
  showScoreModal.value = false
  try { await classStore.fetchStudents() } catch {}
}

async function onPetSelected() {
  showPetModal.value = false
  try { await classStore.fetchStudents() } catch {}
}

function handleGraduate(student) {
  selectedStudent.value = student
  showGraduateModal.value = true
}

function handleChangePet(student) {
  selectedStudent.value = student
  showPetModal.value = true
}

async function onGraduated() {
  showGraduateModal.value = false
  try { await classStore.fetchStudents() } catch {}
}

function handleShowBadges(student) {
  selectedStudent.value = student
  showBadgeWall.value = true
}

function handlePrintCert(student) {
  selectedStudent.value = student
  showCertificateModal.value = true
}

function handleAiEvaluate(student) {
  selectedStudent.value = student
  showAiEvaluate.value = true
}
</script>