import axios from 'axios'
import Dialog from './dialog'

// 架构师基建：请求防重字典
const pendingRequests = new Map()

// 生成请求的唯一摘要标识
const generateReqKey = (config) => {
  const { method, url, params, data } = config;
  return [method, url, JSON.stringify(params), JSON.stringify(data)].join('&');
}

// 把当前请求加入挂起队列
const addPendingRequest = (config) => {
  const reqKey = generateReqKey(config);
  const controller = new AbortController();
  config.signal = controller.signal;
  if (!pendingRequests.has(reqKey)) {
    pendingRequests.set(reqKey, controller);
  }
}

// 移除并取消重复的挂起请求
const removePendingRequest = (config) => {
  const reqKey = generateReqKey(config);
  if (pendingRequests.has(reqKey)) {
    const controller = pendingRequests.get(reqKey);
    controller.abort('重复的疯狂点击，请求已被前端主动取消');
    pendingRequests.delete(reqKey);
  }
}

// 全局错误弹窗防抖锁（避免弱网下弹出满屏的报错）
let isErrorShowing = false;
const showError = (msg) => {
  if (isErrorShowing) return;
  isErrorShowing = true;
  Dialog.alert(msg).finally(() => {
    // 弹窗关闭后，给予 500ms 的冷却期
    setTimeout(() => { isErrorShowing = false; }, 500); 
  });
}

const api = axios.create({
  baseURL: '/api',
  timeout: 15000 // 15秒超时应对学校弱网
})

// 请求拦截器
api.interceptors.request.use(config => {
  // GET 请求自动开启防重机制
  if (config.method?.toUpperCase() === 'GET') {
    removePendingRequest(config);
    addPendingRequest(config);
  }
  
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}, err => Promise.reject(err))

// 响应拦截器
api.interceptors.response.use(
  res => {
    // 请求成功，从防重字典中移除
    if (res.config.method?.toUpperCase() === 'GET') {
      removePendingRequest(res.config);
    }
    return res.data;
  },
  err => {
    // 如果是前端主动取消的重复请求，静默处理，不抛出异常干扰业务流
    if (axios.isCancel(err)) {
      console.warn('🚧 [API Intercepted]:', err.message);
      return new Promise(() => {}); // 返回一个 pending 状态的 Promise 中断后续 .then/.catch
    }
    
    if (err.config && err.config.method?.toUpperCase() === 'GET') {
      removePendingRequest(err.config);
    }

    const status = err.response?.status
    const data = err.response?.data
    const url = err.config?.url

    // 优雅处理未授权及过期
    if (status === 401 && !url?.includes('/auth/login')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return Promise.reject(data || err)
    }

    // 全局兜底弹出服务器错误或网络错误
    if (status >= 500) {
      showError(data?.error || '服务器出错了，请稍后重试');
    } else if (!err.response) {
      showError('网络连接失败，请检查您的网络环境');
    }

    return Promise.reject(data || err)
  }
)

export default api