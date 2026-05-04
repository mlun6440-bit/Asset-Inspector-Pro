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
      },
      plugins: [
          react(),
          VitePWA({
              registerType: 'autoUpdate',
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
