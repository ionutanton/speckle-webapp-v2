import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 3000, // Change if needed
    host: true, // Allow external access
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'grown-concrete-antelope.ngrok-free.app' // Add your ngrok host here
    ]
  },
  resolve: {
    alias: {
      three: path.resolve(__dirname, 'node_modules/three')
    },
    dedupe: ['three']
  },
  optimizeDeps: {
    include: ['three']
  }
});
  