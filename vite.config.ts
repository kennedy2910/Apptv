import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const proxy: Record<string, any> = {
      // Resolver API proxy (dev-only) to avoid CORS.
      // Use in the app: VITE_RESOLVE_URL=/resolve/api/resolve
      '/resolve': {
        target: env.RESOLVE_PROXY_TARGET || 'http://103.45.245.58:9300',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/resolve/, ''),
      },
    };

    // Optional EDGE proxy (enabled only when EDGE_PROXY_TARGET is defined).
    // Use in the app: VITE_EDGE_BASE_URL=/edge
    if (env.EDGE_PROXY_TARGET) {
      proxy['/edge'] = {
        target: env.EDGE_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/edge/, ''),
      };
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy,
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
