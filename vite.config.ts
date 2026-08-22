import path from 'node:path';
import { sites } from '@openai/sites-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), sites()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  });
