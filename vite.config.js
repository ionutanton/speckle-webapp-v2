import { defineConfig } from 'vite';

export default {
    server: {
      port: 3000, // Change if needed
      host: true, // Allow external access
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'grown-concrete-antelope.ngrok-free.app' // Add your ngrok host here
      ]
    }
  };
  