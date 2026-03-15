import { createApp, h } from 'vue'
import GlobalDialog from '../components/ui/GlobalDialog.vue'
import { createPinia } from 'pinia'
import router from '../router'

/**
 * 创建弹窗实例，挂载到动态生成的 DOM 上
 */
function createDialog(options) {
    return new Promise((resolve) => {
        const mountNode = document.createElement('div')
        document.body.appendChild(mountNode)

        let app = null

        const handleConfirm = (val) => {
            resolve(val)
            cleanup()
        }

        const handleCancel = () => {
            resolve(options.type === 'prompt' ? null : false)
            cleanup()
        }

        const cleanup = () => {
            if (app) {
                setTimeout(() => {
                    app.unmount()
                    if (document.body.contains(mountNode)) {
                        document.body.removeChild(mountNode)
                    }
                }, 300) // 等待退出动画
            }
        }

        app = createApp({
            render() {
                return h(GlobalDialog, {
                    ...options,
                    onConfirm: handleConfirm,
                    onCancel: handleCancel
                })
            }
        })

        // 继承 pinia 和 router 以防组件内用到
        // 不过纯 UI 弹窗通常不需要，谨慎起见注入
        // const pinia = createPinia() 
        // app.use(pinia)
        // app.use(router)

        app.mount(mountNode)
    })
}

export const Dialog = {
    alert(message, title = '提示') {
        return createDialog({
            type: 'alert',
            title,
            message,
        })
    },

    confirm(message, title = '系统确认') {
        return createDialog({
            type: 'confirm',
            title,
            message,
        })
    },

    prompt(message, defaultValue = '', title = '需要输入') {
        return createDialog({
            type: 'prompt',
            title,
            message,
            defaultValue
        })
    }
}

export default Dialog
