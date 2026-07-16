import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // M4: echarts / echarts-for-react / 扩展包 独立 chunk
    // - echarts 全量 ≈1MB → 仍是最大单 chunk,但能缓存命中
    // - echarts-gl (3D) ≈250KB → 用户访问 3D 图前不会加载
    // - echarts-liquidfill ≈25KB / echarts-wordcloud ≈12KB → 按需
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts', 'echarts-for-react'],
          'echarts-gl': ['echarts-gl'],
          'echarts-plugins': ['echarts-liquidfill', 'echarts-wordcloud'],
        },
      },
    },
    chunkSizeWarningLimit: 1500, // echarts 全量包 ~1MB,抑制警告
  },
});