import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Dev-only Gemini proxy: the key is attached here, inside the Node dev server,
        // so it never appears in browser code. Production uses server.mjs.
        proxy: {
          '/api/gemini': {
            target: 'https://generativelanguage.googleapis.com',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/gemini/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.removeHeader('authorization');
                proxyReq.setHeader('x-goog-api-key', env.GEMINI_API_KEY || '');
              });
            },
          },
        },
      },
      plugins: [
          react(),
          VitePWA({
              registerType: 'autoUpdate',
              workbox: {
                  navigateFallbackDenylist: [/^\/api\//],
              },
              includeAssets: ['app-icon.svg'],
              manifest: {
                  name: 'Fulcrum Inspector Pro',
                  short_name: 'Inspector',
                  description: 'A robust field inspection and asset management platform',
                  theme_color: '#4f46e5',
                  background_color: '#ffffff',
                  display: 'standalone',
                  icons: [
                      {
                          src: '/app-icon.svg',
                          sizes: '512x512',
                          type: 'image/svg+xml',
                          purpose: 'any maskable'
                      }
                  ]
              }
          })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
