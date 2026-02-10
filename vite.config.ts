import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import type { Plugin } from 'vite';
import type { IncomingMessage } from 'http';

// ─── Read raw request body ──────────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── API Proxy Plugin ───────────────────────────────────────
// Keeps RunPod & ImgBB API keys server-side only.
// The browser calls /api/* on the same origin; the Vite dev
// server forwards them with the real keys injected.
// ─────────────────────────────────────────────────────────────
function apiProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      // Log loaded keys at startup (masked)
      const mask = (s: string | undefined) =>
        s ? s.slice(0, 6) + '***' + s.slice(-4) : '(not set)';
      console.log('\n[api-proxy] Loaded env:');
      console.log(`  IMGBB_API_KEY    = ${mask(env.IMGBB_API_KEY)}`);
      console.log(`  RUNPOD_API_KEY   = ${mask(env.RUNPOD_API_KEY)}`);
      console.log(`  RUNPOD_ENDPOINT  = ${env.RUNPOD_ENDPOINT_ID || '(not set)'}\n`);

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        res.setHeader('Content-Type', 'application/json');

        const handleRequest = async () => {
          const url = req.url!;

          // ── POST /api/imgbb ── Upload image to ImgBB
          // Accepts raw binary body (Content-Type: image/*).
          // Converts to base64 server-side — much faster than client-side.
          if (url === '/api/imgbb' && req.method === 'POST') {
            const apiKey = env.IMGBB_API_KEY;
            if (!apiKey || apiKey === 'your_imgbb_api_key') {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'IMGBB_API_KEY not configured in .env' }));
              return;
            }

            const buffer = await readBodyBuffer(req);
            const base64 = buffer.toString('base64');
            console.log(`[api-proxy] POST /api/imgbb — ${(buffer.length / 1024).toFixed(0)}KB raw → ${(base64.length / 1024).toFixed(0)}KB base64`);

            const params = new URLSearchParams();
            params.append('key', apiKey);
            params.append('image', base64);

            const resp = await fetch('https://api.imgbb.com/1/upload', {
              method: 'POST',
              body: params,
            });
            const data = await resp.json();
            console.log(`[api-proxy] ImgBB response: ${resp.status}`, data.success ? `url=${data.data?.url?.slice(0, 60)}...` : JSON.stringify(data.error || data).slice(0, 200));

            if (data.success) {
              res.end(JSON.stringify({ url: data.data.url }));
            } else {
              res.statusCode = resp.status >= 400 ? resp.status : 400;
              res.end(
                JSON.stringify({
                  error: data.error?.message || data.status_txt || JSON.stringify(data),
                })
              );
            }
            return;
          }

          // ── POST /api/runpod/run ── Submit a RunPod job
          if (url === '/api/runpod/run' && req.method === 'POST') {
            const apiKey = env.RUNPOD_API_KEY;
            const endpointId = env.RUNPOD_ENDPOINT_ID;
            if (!apiKey || apiKey === 'your_runpod_api_key' || !endpointId) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  error: 'RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID not configured in .env',
                })
              );
              return;
            }

            const body = await readBody(req);
            const runpodUrl = `https://api.runpod.ai/v2/${endpointId}/run`;
            console.log(`[api-proxy] POST ${runpodUrl}`);

            const resp = await fetch(runpodUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body,
            });
            const data = await resp.json();
            console.log(`[api-proxy] RunPod /run response: ${resp.status}`, JSON.stringify(data).slice(0, 300));

            // Forward upstream status for errors
            if (resp.status >= 400) {
              res.statusCode = resp.status;
            }
            res.end(JSON.stringify(data));
            return;
          }

          // ── GET /api/runpod/status/:id ── Poll job status
          if (url.startsWith('/api/runpod/status/') && req.method === 'GET') {
            const jobId = url.replace('/api/runpod/status/', '');
            const apiKey = env.RUNPOD_API_KEY;
            const endpointId = env.RUNPOD_ENDPOINT_ID;
            if (!apiKey || !endpointId) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({ error: 'RunPod not configured in .env' })
              );
              return;
            }

            const statusUrl = `https://api.runpod.ai/v2/${endpointId}/status/${jobId}`;
            const resp = await fetch(statusUrl, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            const data = await resp.json();
            console.log(`[api-proxy] RunPod /status/${jobId.slice(0, 12)}...: ${resp.status} — ${data.status || JSON.stringify(data).slice(0, 100)}`);

            if (resp.status >= 400) {
              res.statusCode = resp.status;
            }
            res.end(JSON.stringify(data));
            return;
          }

          // Unknown /api route
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'API route not found' }));
        };

        handleRequest().catch((err) => {
          console.error('[api-proxy] ERROR:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({ error: err?.message || 'Internal server error' })
            );
          }
        });
      });
    },
  };
}

// ─── Vite Config ────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  // Load ALL env vars (not just VITE_-prefixed) so the proxy
  // can access RUNPOD_API_KEY, IMGBB_API_KEY, etc.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [apiProxyPlugin(env), tailwindcss(), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      port: 3000,
      open: true,
    },
  };
});
