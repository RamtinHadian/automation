import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// local preview only (not committed): the page from this working folder, the data from the local demo on 8095
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 3001, host: true, proxy: { '/api': 'http://localhost:8095' } },
});
