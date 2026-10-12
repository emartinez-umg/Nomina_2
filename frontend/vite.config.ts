import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const raiz = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, raiz, 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    envDir: raiz,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:3000' } },
    },
  };
});
