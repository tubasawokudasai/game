import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 后台需要预览 /assets/combat/characters 下的去背景立绘。
  // 直接复用游戏前端的 public 目录，开发时零拷贝，构建时随 admin 一起产出。
  publicDir: path.resolve(__dirname, '../frontend/public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
