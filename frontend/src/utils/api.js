import axios from 'axios'
import Dialog from './dialog'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000 // 适当放宽至15s应对弱网
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res.data,
  err => {
    const status = err.response?.status
    const data = err.response?.data
    const url = err.config?.url

    // 优雅处理未授权及过期
    if (status === 401 && !url?.includes('/auth/login')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return Promise.reject(data || err)
    }

    // 全局兜底弹出服务器500错误
    if (status >= 500) {
      Dialog.alert(data?.error || '服务器出错了，请稍后重试');
    } else if (!err.response) {
      Dialog.alert('网络连接失败，请检查您的网络');
    }

    return Promise.reject(data || err)
  }
)

export default api