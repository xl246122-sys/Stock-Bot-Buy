import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin(="[^"]*")?/g, '');
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    envPrefix: 'VITE_PUBLIC_',
    plugins: [react(), tailwindcss(), removeCrossorigin()],
    build: {
      modulePreload: false,
    },
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/binance': {
          target: 'https://api.binance.com/api/v3',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/binance/, ''),
        },
      },
    },
  };
});
