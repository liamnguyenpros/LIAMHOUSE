import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Bản demo: path tương đối để mở được bằng file://
  base: process.env.VITE_API_MOCK === '1' ? './' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
