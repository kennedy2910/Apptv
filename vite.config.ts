import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Dev-only proxy to avoid CORS when EDGE doesn't set Access-Control-Allow-Origin.
        // Use in the app: VITE_EDGE_BASE_URL=/edge
        proxy: {
          '/edge': {
            target: env.EDGE_PROXY_TARGET || 'http://localhost:9100',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/edge/, ''),
          },
          // Resolver API proxy (dev-only) to avoid CORS.
          // Use in the app: VITE_RESOLVE_URL=/resolve/api/resolve
          '/resolve': {
            target: env.RESOLVE_PROXY_TARGET || 'http://103.45.245.58:9300',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/resolve/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
