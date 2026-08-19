import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), sites()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5173,
      proxy: env.VITE_GATEWAY_PROXY === 'false' ? undefined : {
        '/v1': 'http://127.0.0.1:8080',
        '/healthz': 'http://127.0.0.1:8080',
        '/readyz': 'http://127.0.0.1:8080',
        '/media': 'http://127.0.0.1:8080',
      },
    },
  };
});
