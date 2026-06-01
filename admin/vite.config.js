import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O painel admin e servido pelo Express em /admin, entao o base precisa
// bater com esse prefixo. O build sai em admin/dist (servido como estatico).
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
