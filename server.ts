import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local .env file in development if present (without failing when absent)
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile(envPath);
  }
} catch {
  // Environment variables are already injected by the runtime
}

const DEFAULT_TEXT_MODEL = 'gemini-4-hydrogen';
const LIVE_MODEL = 'gemini-3.8-live';
const PORT = Number(process.env.PORT) || 3000;

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey = '';

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets.'
    );
  }
  if (!cachedAiClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

const GEMINI_4_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
  'gemini-4-argon',
]);

function sanitizeModelConfig(
  model: string,
  config?: Record<string, any>
): Record<string, any> | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const cleaned: Record<string, any> = { ...config };
  if (GEMINI_4_MODELS.has(model)) {
    delete cleaned.temperature;
    delete cleaned.topP;
    delete cleaned.topK;
    delete cleaned.candidateCount;
    if (cleaned.thinkingConfig && typeof cleaned.thinkingConfig === 'object') {
      const tc = { ...cleaned.thinkingConfig };
      delete tc.thinkingBudget;
      cleaned.thinkingConfig = tc;
    }
  }
  return cleaned;
}

function extractErrorInfo(err: unknown): { status: number; message: string } {
  const anyErr = err as any;
  const rawStatus =
    typeof anyErr?.status === 'number'
      ? anyErr.status
      : typeof anyErr?.statusCode === 'number'
        ? anyErr.statusCode
        : typeof anyErr?.code === 'number'
          ? anyErr.code
          : 500;
  const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  const message =
    typeof anyErr?.message === 'string' && anyErr.message.trim().length > 0
      ? anyErr.message
      : 'An error occurred while communicating with Gemini.';
  return { status, message };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const { status } = extractErrorInfo(err);
      const isTransient = status === 429 || status === 503 || status === 502 || status === 504;
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function safeWsSend(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send errors on closing sockets
    }
  }
}

const LOG_OBSERVATION_TOOL = {
  functionDeclarations: [
    {
      name: 'log_observation',
      description:
        "Logs an observed hazard or asset directly to the inspector's dashboard screen in real-time.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: "Enum: 'hazard' or 'asset'",
          },
          description: {
            type: Type.STRING,
            description: 'Detailed description of the observation',
          },
          condition: {
            type: Type.STRING,
            description: "Condition of the asset (e.g., 'Good', 'Poor'), or N/A for hazards",
          },
          riskRating: {
            type: Type.STRING,
            description: "Risk rating (e.g., 'Low', 'Medium', 'High', 'Extreme')",
          },
        },
        required: ['type', 'description', 'riskRating'],
      },
    },
  ],
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Support large multimodal payloads (room photos, blueprints, documents, video walk keyframes)
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // 1. Standard & Structured Multimodal Generation Route
  app.post('/api/gemini/generate', async (req: Request, res: Response) => {
    try {
      const { model, contents, config } = req.body ?? {};
      if (!contents) {
        res.status(400).json({ error: 'Missing required "contents" payload.' });
        return;
      }

      const targetModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_TEXT_MODEL;
      const ai = getGeminiClient();
      const cleanedConfig = sanitizeModelConfig(targetModel, config);

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: targetModel,
          contents,
          config: cleanedConfig,
        })
      );

      res.json({
        text: response.text ?? '',
      });
    } catch (err) {
      const { status, message } = extractErrorInfo(err);
      console.error('[API /api/gemini/generate] Error:', message);
      res.status(status).json({ error: message });
    }
  });

  // 2. Streaming Chat Route (Server-Sent Events)
  app.post('/api/gemini/chat/stream', async (req: Request, res: Response) => {
    const { model, systemInstruction, history, messageParts } = req.body ?? {};
    if (!messageParts) {
      res.status(400).json({ error: 'Missing required "messageParts" payload.' });
      return;
    }

    let ai: GoogleGenAI;
    try {
      ai = getGeminiClient();
    } catch (err) {
      const { status, message } = extractErrorInfo(err);
      res.status(status).json({ error: message });
      return;
    }

    const targetModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_TEXT_MODEL;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    try {
      const normalizedHistory = Array.isArray(history)
        ? history.map((h: any) => ({
            role: h.role,
            parts: h.parts,
          }))
        : [];

      const chat = ai.chats.create({
        model: targetModel,
        config: systemInstruction
          ? { systemInstruction: String(systemInstruction) }
          : undefined,
        history: normalizedHistory,
      });

      const stream = await chat.sendMessageStream({ message: messageParts });

      for await (const chunk of stream) {
        if (clientDisconnected) break;
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (err) {
      const { message } = extractErrorInfo(err);
      console.error('[API /api/gemini/chat/stream] Error:', message);
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  // 3. Real-Time Multimodal Live API WebSocket Bridge (/api/gemini/live)
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024 * 1024,
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/api/gemini/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: any = null;
    let isClosing = false;
    let isConnecting = false;

    const cleanupLiveSession = () => {
      if (isClosing) return;
      isClosing = true;
      if (liveSession) {
        const s = liveSession;
        liveSession = null;
        try {
          s.close?.();
        } catch {
          // Ignore close errors
        }
      }
    };

    clientWs.on('message', async (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      if (msg.type === 'setup') {
        if (liveSession || isConnecting) return;
        isConnecting = true;

        try {
          const ai = getGeminiClient();
          const systemInstruction =
            typeof msg.systemInstruction === 'string' && msg.systemInstruction.trim()
              ? msg.systemInstruction
              : 'You are a specialized Engineering Auditor in a LIVE MULTIMODAL inspection session.';

          const session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                },
              },
              systemInstruction,
              outputAudioTranscription: {},
              tools: [LOG_OBSERVATION_TOOL],
            },
            callbacks: {
              onopen: () => {
                safeWsSend(clientWs, { type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                if (isClosing) return;

                // 1. Handle standard Live API function calls (message.toolCall.functionCalls)
                const toolCalls = message.toolCall?.functionCalls ?? [];
                for (const call of toolCalls) {
                  if (call.name === 'log_observation') {
                    safeWsSend(clientWs, {
                      type: 'tool_call',
                      id: call.id,
                      name: call.name,
                      args: call.args ?? {},
                    });
                    try {
                      liveSession?.sendToolResponse?.({
                        functionResponses: [
                          {
                            id: call.id,
                            name: call.name,
                            response: { result: 'logged successfully' },
                          },
                        ],
                      });
                    } catch (toolErr) {
                      console.warn('[Live WS] Failed to send tool response:', toolErr);
                    }
                  }
                }

                // 2. Handle model turn audio & any inline functionCall parts
                const parts = message.serverContent?.modelTurn?.parts ?? [];
                for (const part of parts as any[]) {
                  if (part?.functionCall?.name === 'log_observation') {
                    safeWsSend(clientWs, {
                      type: 'tool_call',
                      id: part.functionCall.id,
                      name: part.functionCall.name,
                      args: part.functionCall.args ?? {},
                    });
                    try {
                      liveSession?.sendToolResponse?.({
                        functionResponses: [
                          {
                            id: part.functionCall.id,
                            name: part.functionCall.name,
                            response: { result: 'logged successfully' },
                          },
                        ],
                      });
                    } catch (toolErr) {
                      console.warn('[Live WS] Failed to send inline tool response:', toolErr);
                    }
                  }

                  if (part?.inlineData?.data) {
                    safeWsSend(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                // 3. Forward output audio transcription
                if (message.serverContent?.outputTranscription?.text) {
                  safeWsSend(clientWs, {
                    type: 'transcription',
                    text: message.serverContent.outputTranscription.text,
                  });
                }

                // 4. Forward interruption signals
                if (message.serverContent?.interrupted) {
                  safeWsSend(clientWs, { type: 'interrupted' });
                }
              },
              onerror: (e: any) => {
                console.error('[Live WS] Gemini Live error:', e);
                safeWsSend(clientWs, {
                  type: 'error',
                  message: e?.message || 'Live multimodal session encountered an error.',
                });
                cleanupLiveSession();
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.close();
                }
              },
              onclose: () => {
                safeWsSend(clientWs, { type: 'closed' });
                cleanupLiveSession();
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.close();
                }
              },
            },
          });

          if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
            try {
              session.close?.();
            } catch {
              // Ignore
            }
            return;
          }

          liveSession = session;
          // Ensure ready event is sent even if onopen fired before connect promise resolved
          safeWsSend(clientWs, { type: 'ready' });
        } catch (err) {
          const { message } = extractErrorInfo(err);
          console.error('[Live WS] Failed to connect to Gemini Live:', message);
          safeWsSend(clientWs, { type: 'error', message });
          cleanupLiveSession();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
          }
        } finally {
          isConnecting = false;
        }
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && liveSession) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          console.warn('[Live WS] Audio frame forward error:', err);
        }
        return;
      }

      if (msg.type === 'video' && typeof msg.data === 'string' && liveSession) {
        try {
          liveSession.sendRealtimeInput({
            video: {
              data: msg.data,
              mimeType: 'image/jpeg',
            },
          });
        } catch (err) {
          console.warn('[Live WS] Video frame forward error:', err);
        }
        return;
      }

      if (msg.type === 'close') {
        cleanupLiveSession();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      }
    });

    clientWs.on('close', () => {
      cleanupLiveSession();
    });

    clientWs.on('error', () => {
      cleanupLiveSession();
    });
  });

  // Frontend middleware (Vite in dev, built static dist in production)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Asset Inspector Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Asset Inspector Pro server:', err);
  process.exit(1);
});
