import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Do not proxy /auth/callback — that is the React OAuth landing page.
      '/auth': {
        target: 'http://localhost:3002',
        bypass(req) {
          const url = req.url || '';
          if (url.startsWith('/auth/callback')) {
            return url;
          }
        },
      },
      '/games': { target: 'http://localhost:3002' },
      '/scores': { target: 'http://localhost:3002' },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
      },
    },
  },
});
