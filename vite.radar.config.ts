import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Isolated entry and explicit constants keep legacy modules and .env keys out of the APK.
export default defineConfig(({ mode }) => ({
  base: './',
  envDir: '.local/apk-empty-env',
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_SECTOR_SNAPSHOT_URL': JSON.stringify(mode === 'personal' ? '' : './sector-snapshot.json'),
    'import.meta.env.VITE_SECTOR_API_URL': JSON.stringify(mode === 'personal' ? 'http://43.163.192.120' : ''),
  },
  build: {
    outDir: '.local/radar-assets/dist',
    rollupOptions: { input: 'radar-test.html' },
  },
}));
