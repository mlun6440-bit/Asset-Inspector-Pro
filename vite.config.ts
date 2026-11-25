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
              workbox: {
                  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
              },
              manifest: {
                  name: 'Asset Inspector Pro',
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
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('firebase')) return 'vendor-firebase';
                if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
                if (id.includes('@vis.gl') || id.includes('@googlemaps')) return 'vendor-maps';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
              }
            },
          },
        },
      },
      define: {
        'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(
          env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || ''
        ),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
