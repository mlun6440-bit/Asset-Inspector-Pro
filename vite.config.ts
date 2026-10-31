import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
// @ts-ignore -- plain ESM helper shared with server.mjs
import { authorizeAiRequest, checkRateLimit, handleLiveToken, isAllowedGeminiPath } from './server/aiGateway.mjs';

// Dev-server versions of the production AI gateway checks in server.mjs. The inspector
// check is off by default for local development; set GEMINI_PROXY_AUTH=on to exercise it.
function aiGatewayDevPlugin(env: Record<string, string>): Plugin {
  const required = env.GEMINI_PROXY_AUTH === 'on';
  return {
    name: 'ai-gateway-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === '/api/live-token') {
            const identity = await authorizeAiRequest(req, res, { required });
            if (identity && checkRateLimit(res, 'liveToken', identity)) await handleLiveToken(req, res, { apiKey: env.GEMINI_API_KEY || '' });
            return;
          }
          if (req.url?.startsWith('/api/gemini/')) {
            // Same model allow-list and rate limits as server.mjs
            if (!isAllowedGeminiPath(req.url.slice('/api/gemini'.length))) {
              res.writeHead(404).end('Not found');
              return;
            }
            const identity = await authorizeAiRequest(req, res, { required });
            if (!identity || !checkRateLimit(res, 'generate', identity)) return;
          }
          next();
        } catch (err) {
          console.error('AI gateway error:', err);
          if (!res.headersSent) res.writeHead(502).end('Upstream error');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        // Localhost only by default: the dev proxy attaches GEMINI_API_KEY and skips the inspector
        // check, so exposing it on the network would let anyone nearby use the key.
        // Set DEV_HOST=0.0.0.0 to test from a phone on a trusted network.
        host: env.DEV_HOST || 'localhost',
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
          aiGatewayDevPlugin(env),
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
