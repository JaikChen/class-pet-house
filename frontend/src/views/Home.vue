<template>
  <div>
    <!-- 分组管理模式 -->
    <GroupManageView v-if="groupMode" @close="$emit('exit-group-mode')" />

    <!-- 学生卡片网格 (普通模式) -->
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

    <!-- 空状态 -->
    <div v-if="!filteredStudents.length" class="text-center py-20 text-gray-400">
      <p class="text-4xl mb-2">🥚</p>
      <p>还没有学生，去设置中添加吧</p>
    </div>

    <!-- 积分规则选择弹窗 -->
    <ScoreRuleModal
      v-if="showScoreModal"
      :student="selectedStudent"
      @close="showScoreModal = false"
      @scored="onScored"
    />

    <!-- 宠物选择弹窗 -->
    <PetSelectModal
      v-if="showPetModal"
      :student="selectedStudent"
      @close="showPetModal = false"
      @selected="onPetSelected"
    />

    <!-- 毕业典礼弹窗 -->
    <GraduateModal
      v-if="showGraduateModal"
      :student="selectedStudent"
      @close="showGraduateModal = false"
      @graduated="onGraduated"
    />

    <!-- 徽章墙弹窗 -->
    <BadgeWall
      v-if="showBadgeWall"
      :student="selectedStudent"
      @close="showBadgeWall = false"
    />

    <!-- 证书打印弹窗 -->
    <CertificateModal
      v-if="showCertificateModal"
      :show="showCertificateModal"
      :student="selectedStudent"
      :growth-stages="classStore.currentClass?.growth_stages"
      @close="showCertificateModal = false"
    />

    <!-- AI 评语弹窗 -->
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
import OdometerNumber from '../components/OdometerNumber.vue'
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

const filteredStudents = computed(() => {
  // 必须在此处访问 classStore.students 触发依赖收集，不能在外部解构
  let list = classStore.students.map(s => ({ ...s }))

  // 搜索过滤
  if (props.searchQuery) {
    const q = props.searchQuery.toLowerCase()
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
    // 撤回该学生最后一次操作
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
  try {
    const { rows } = await api.get(`/history/class/${classStore.currentClass.id}?limit=1&student_id=${student.id}`)
    if (rows?.length) {
      await api.post('/history/revoke', { record_id: rows[0].id })
      await classStore.fetchStudents()
    }
  } catch (err) {
    Dialog.alert('撤回失败')
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
