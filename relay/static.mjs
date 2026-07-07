/**
 * Static file handler for the production PWA build (`dist/`).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** @param {string} urlPath */
function cacheControl(urlPath) {
  const name = urlPath.split('/').pop() ?? '';
  if (name === 'index.html' || name === 'sw.js' || name === 'registerSW.js' || name === 'manifest.webmanifest') {
    return 'no-cache';
  }
  if (name.startsWith('workbox-') && name.endsWith('.js')) return 'no-cache';
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if the request was handled
 */
export function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const raw = req.url?.split('?')[0] ?? '/';
  const safePath = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  const rel = safePath === '/' || safePath === '' ? 'index.html' : safePath.replace(/^\//, '');
  let filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  let stat = existsSync(filePath) ? statSync(filePath) : null;
  if (stat?.isDirectory()) {
    filePath = join(filePath, 'index.html');
    stat = existsSync(filePath) ? statSync(filePath) : null;
  }

  if (!stat?.isFile()) {
    const fallback = join(ROOT, 'index.html');
    if (!existsSync(fallback)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Game build missing. Run npm run build before starting production server.');
      return true;
    }
    filePath = fallback;
    stat = statSync(filePath);
  }

  const ext = extname(filePath);
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(rel === 'index.html' ? '/index.html' : `/${rel}`),
  };

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}
