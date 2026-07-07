#!/usr/bin/env node
/**
 * Production server: static PWA (`dist/`) + lockstep WebSocket relay on one port.
 * Run: npm run start (Railway) after `npm run build`.
 */
import { createServer } from 'node:http';
import { attachRelay } from './relay-app.mjs';
import { serveStatic } from './static.mjs';

const PORT = Number(process.env.PORT ?? 8787);

/** @type {ReturnType<typeof attachRelay> | null} */
let relay = null;

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: relay?.roomCount ?? 0 }));
    return;
  }

  if (serveStatic(req, res)) return;

  res.writeHead(404);
  res.end();
});

relay = attachRelay(server);

server.listen(PORT, () => {
  console.log(`[production] game + relay listening on :${PORT}`);
});
