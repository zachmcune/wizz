#!/usr/bin/env node
/**
 * Serves `dist/` the way Cloudflare Pages does, for local verification of the dual app deploy.
 *
 * Pages has no `_redirects` here, so an unknown path falls back to `/index.html` with a 200. That
 * fallback is exactly what made `/v2/` serve v1's HTML before v2 was part of the build, so any local
 * check of the deploy must reproduce it rather than 404ing on a miss.
 *
 * Usage: node scripts/serve-dist.mjs [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'dist');
const PORT = Number(process.argv[2] ?? 4178);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve a URL path to a file, trying the directory index the way a static host does. */
function locate(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const direct = join(ROOT, clean);
  if (!direct.startsWith(ROOT)) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    const index = join(direct, 'index.html');
    if (existsSync(index)) return index;
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const file = locate(pathname) ?? join(ROOT, 'index.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-dist] ${ROOT} on http://127.0.0.1:${PORT}/`);
});
