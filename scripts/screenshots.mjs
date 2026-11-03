// Captures the README/doc screenshots from a production build with the synthetic demo inputs.
//   pnpm build && node scripts/screenshots.mjs        → docs/images/*.png
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../..');
const dist = join(root, 'dist/audiolab/browser');
const out = join(root, 'docs/images');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = join(dist, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const shots = [
  { name: 'morse-decoder', path: '/#/morse-decoder', demo: true, wait: 9000, scheme: 'dark' },
  { name: 'spectrum-analyzer', path: '/#/spectrum-analyzer', demo: true, wait: 5000, scheme: 'dark' },
  { name: 'dtmf-decoder', path: '/#/dtmf-decoder', demo: true, wait: 4700, scheme: 'light' },
  { name: 'overview', path: '/', demo: false, wait: 500, scheme: 'light' },
];

const browser = await chromium.launch();
try {
  for (const s of shots) {
    const page = await browser.newPage({ colorScheme: s.scheme, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(base + s.path);
    if (s.demo) {
      await page.getByLabel('Audio input').selectOption({ label: 'Demo signal (synthetic, no microphone)' });
      await page.getByRole('button', { name: 'Start' }).click();
    }
    await page.waitForTimeout(s.wait);
    await page.screenshot({ path: join(out, `${s.name}.png`) });
    console.log(`docs/images/${s.name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
