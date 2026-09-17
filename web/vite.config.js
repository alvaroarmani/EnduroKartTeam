import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend do EnduroKart. `base: './'` para funcionar em qualquer host estático.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
});
