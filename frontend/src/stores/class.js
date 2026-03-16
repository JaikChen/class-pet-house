import { defineStore } from 'pinia'
import api from '../utils/api'

export const useClassStore = defineStore('class', {
  state: () => ({
    classes: [],
    currentClass: null,
    students: [],
    groups: [],
    scoreRules: [],
    // 架构师基建：为每个数据模块设立独立的加载状态
    loading: {
      classes: false,
      students: false,
      groups: false,
      scoreRules: false
    },
    // Promise 缓存锁，防止并发调用
    _promises: {}
  }),

  actions: {
    async fetchClasses() {
      // 如果当前正在拉取，直接返回正在执行的 Promise（防并发竞态）
      if (this._promises.classes) return this._promises.classes;

      this.loading.classes = true;
      this._promises.classes = api.get('/classes').then(data => {
        this.classes = data;
        // 如果当前没有选定班级，但列表有数据，默认选中第一个
        if (!this.currentClass && this.classes.length) {
          this.currentClass = this.classes[0];
        }
      }).finally(() => {
        this.loading.classes = false;
        this._promises.classes = null;
      });

      return this._promises.classes;
    },

    async switchClass(cls) {
      if (this.currentClass?.id === cls.id) return;
      
      this.currentClass = cls;
      // 切换班级后，并行拉取该班级的所有核心数据
      await Promise.all([
        this.fetchStudents(),
        this.fetchGroups(),
        this.fetchScoreRules()
      ]);
    },

    async fetchStudents() {
      if (!this.currentClass) return;
      if (this._promises.students) return this._promises.students;

      this.loading.students = true;
      this._promises.students = api.get(`/students/class/${this.currentClass.id}`).then(data => {
        this.students = data;
      }).finally(() => {
        this.loading.students = false;
        this._promises.students = null;
      });

      return this._promises.students;
    },

    async fetchGroups() {
      if (!this.currentClass) return;
      if (this._promises.groups) return this._promises.groups;

      this.loading.groups = true;
      this._promises.groups = api.get(`/groups/class/${this.currentClass.id}`).then(data => {
        this.groups = data;
      }).finally(() => {
        this.loading.groups = false;
        this._promises.groups = null;
      });

      return this._promises.groups;
    },

    async fetchScoreRules() {
      if (!this.currentClass) return;
      if (this._promises.scoreRules) return this._promises.scoreRules;

      this.loading.scoreRules = true;
      this._promises.scoreRules = api.get(`/score-rules/class/${this.currentClass.id}`).then(data => {
        this.scoreRules = data;
      }).finally(() => {
        this.loading.scoreRules = false;
        this._promises.scoreRules = null;
      });

      return this._promises.scoreRules;
    }
  }
})