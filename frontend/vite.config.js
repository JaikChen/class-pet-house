import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',         
      '/pet-images': 'http://127.0.0.1:3000',    
      '/动物图片': 'http://127.0.0.1:3000'        
    }
  }
})