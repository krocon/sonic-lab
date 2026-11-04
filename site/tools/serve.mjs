// Local preview of the promo site under its production path.
//
//   node site/tools/serve.mjs [port] [dir]   → http://localhost:4330/products/sonic-lab/
//
//   pnpm site:serve     the sources in site/ (port 4330)
//   pnpm site:preview   the build in dist/site (port 4331)
//
// index.html sets <base href="/products/sonic-lab/">, so the site has to be served from that path –
// a plain static server on the site folder would 404 every asset. Supports Range requests
// (needed for smooth video seeking) and nothing else; no dependencies.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = '/products/sonic-lab/';
const ROOT = process.argv[3] ? resolve(process.argv[3]) : join(fileURLToPath(import.meta.url), '../..');
const PORT = Number(process.argv[2] ?? 4330);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (!path.startsWith(PREFIX)) {
    res.writeHead(302, { location: PREFIX }).end();
    return;
  }
  const rel = normalize(path.slice(PREFIX.length) || 'index.html');
  const file = join(ROOT, rel.endsWith(sep) || rel === '.' ? join(rel, 'index.html') : rel);
  const parts = rel.split(sep);
  if (!file.startsWith(ROOT + sep) || parts.includes('tools') || parts.some((p) => p.startsWith('.'))) {
    res.writeHead(404).end();
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (info.isDirectory()) throw new Error('directory');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  const headers = {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': info.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`Sonic Lab site (${ROOT}) → http://localhost:${PORT}${PREFIX}`));
