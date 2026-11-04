// Captures the promo-site media from the running app (pnpm start) with the synthetic demo input.
//
//   node site/tools/capture-media.mjs [baseUrl] [outDir]
//   defaults: http://localhost:1420  /tmp/sonic-lab-media
//
// Writes 2× stills (<module>.png full window, <module>-oled.png display only) and two screencasts
// of the live display as numbered JPEG frames with an ffmpeg concat list (cast-*/list.txt).
// Post-processing (WebP, MP4) is described in site/README.md.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../..');
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.argv[2] ?? 'http://localhost:1420';
const OUT = process.argv[3] ?? '/tmp/sonic-lab-media';
await mkdir(OUT, { recursive: true });

const STILLS = [
  { name: 'morse-decoder', path: '/#/morse-decoder', demo: true, wait: 14000 },
  { name: 'dtmf-decoder', path: '/#/dtmf-decoder', demo: true, wait: 4700 },
  { name: 'frequency-analyzer', path: '/#/frequency-analyzer', demo: true, wait: 6000 },
  { name: 'spectrum-analyzer', path: '/#/spectrum-analyzer', demo: true, wait: 9000 },
  { name: 'signal-monitor', path: '/#/signal-monitor', demo: true, wait: 6000 },
  { name: 'morse-encoder', path: '/#/morse-encoder', text: 'CQ CQ DE SONIC LAB K', wait: 600 },
  { name: 'tone-generator', path: '/#/tone-generator', wait: 600 },
  { name: 'audio-recorder', path: '/#/audio-recorder', wait: 600 },
];
const CASTS = [
  { name: 'cast-morse', path: '/#/morse-decoder', seconds: 16 },
  { name: 'cast-spectrum', path: '/#/spectrum-analyzer', seconds: 12 },
];

const key = (page, name) => page.getByRole('button', { name, exact: true });
async function demo(page) {
  await key(page, 'Audio input').click();
  await page.getByRole('dialog', { name: 'Audio input' }).getByRole('button', { name: /^Demo signal/ }).click();
  await key(page, 'Start').click();
}

const stills = await chromium.launch({ channel: 'chromium' });
// Screencast frames come out at device pixels only with a forced scale factor and no emulated viewport.
const casts = await chromium.launch({
  channel: 'chromium',
  args: ['--force-device-scale-factor=2', '--window-size=1440,987'],
});
try {
  for (const s of STILLS) {
    const ctx = await stills.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + s.path);
    await page.waitForTimeout(1200);
    if (s.text) await page.locator('textarea').fill(s.text);
    if (s.demo) await demo(page);
    await page.waitForTimeout(s.wait);
    await page.screenshot({ path: join(OUT, `${s.name}.png`) });
    await page.locator('.oled').screenshot({ path: join(OUT, `${s.name}-oled.png`) });
    console.log('still', s.name);
    await ctx.close();
  }

  for (const c of CASTS) {
    const ctx = await casts.newContext({ viewport: null });
    const page = await ctx.newPage();
    await page.goto(BASE + c.path);
    await page.waitForTimeout(1200);
    const box = await page.locator('.oled').boundingBox();
    const dir = join(OUT, c.name);
    await mkdir(dir, { recursive: true });
    const cdp = await ctx.newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', async (f) => {
      frames.push({ data: f.data, t: f.metadata.timestamp });
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await demo(page);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1800 });
    await page.waitForTimeout(c.seconds * 1000);
    await cdp.send('Page.stopScreencast');
    const list = [];
    for (let k = 0; k < frames.length; k++) {
      const file = `f${String(k).padStart(5, '0')}.jpg`;
      await writeFile(join(dir, file), Buffer.from(frames[k].data, 'base64'));
      const next = frames[k + 1]?.t ?? frames[k].t + 1 / 30;
      list.push(`file '${file}'\nduration ${(next - frames[k].t).toFixed(4)}`);
    }
    await writeFile(join(dir, 'list.txt'), list.join('\n') + '\n');
    // display box in CSS px at 1440×900; frames are 2× → crop = box × 2
    console.log('cast', c.name, frames.length, 'frames, display box', JSON.stringify(box));
    await ctx.close();
  }
} finally {
  await stills.close();
  await casts.close();
}
