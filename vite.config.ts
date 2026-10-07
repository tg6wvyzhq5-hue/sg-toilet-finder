import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相对路径产物：放在域名根目录、子路径（GitHub Pages /xxx/）都能直接跑
  base: './',
  plugins: [react()],
  server: {
    host: true, // 允许同一 Wi-Fi 下的手机直接访问调试
    port: 5188,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
