// Builds the promo site into a folder that can be uploaded as is.
//
//   node site/tools/build.mjs [outDir] [--no-app]   (pnpm site:build, default dist/site)
//
// - copies site/ without tools/, README.md and dotfiles
// - minifies assets/js/site.js and assets/css/site.css with esbuild (already used for the worklets)
// - appends a content hash (?v=…) to the stylesheet and script in index.html, so a new upload is
//   never served from a stale cache
// - builds the web app into app/ with the matching base href (<site base>app/), so page and app
//   are deployed together – skip with --no-app
// - fails when index.html or the stylesheet reference a file that is not in the output
import { transform } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(fileURLToPath(import.meta.url), '../..');
const ROOT = resolve(SITE, '..');
const cli = process.argv.slice(2);
const OUT = resolve(ROOT, cli.find((a) => !a.startsWith('--')) ?? 'dist/site');
const WITH_APP = !cli.includes('--no-app');
const SKIP = new Set(['tools', 'README.md']); // top level of site/
const MINIFY = [
  { file: 'assets/js/site.js', loader: 'js' },
  { file: 'assets/css/site.css', loader: 'css' },
];
const TARGET = ['chrome111', 'edge111', 'firefox115', 'safari16.4'];

if (OUT === ROOT || OUT === SITE || SITE.startsWith(OUT + sep) || OUT.startsWith(SITE + sep)) {
  throw new Error(`refusing to build into ${OUT}`);
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

// 1 · fresh copy
await rm(OUT, { recursive: true, force: true });
await cp(SITE, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = relative(SITE, src);
    return !rel || (!SKIP.has(rel.split(sep)[0]) && !basename(src).startsWith('.'));
  },
});

// 2 · minify, remember a content hash per file
const hashes = {};
const report = [];
for (const { file, loader } of MINIFY) {
  const src = await readFile(join(SITE, file), 'utf8');
  const { code, warnings } = await transform(src, { loader, minify: true, target: TARGET, legalComments: 'none' });
  for (const w of warnings) console.warn(`${file}: ${w.text}`);
  await writeFile(join(OUT, file), code);
  hashes[file] = createHash('sha256').update(code).digest('hex').slice(0, 10);
  report.push(`  ${file.padEnd(22)} ${kb(Buffer.byteLength(src)).padStart(9)} → ${kb(Buffer.byteLength(code))}`);
}

// 3 · cache busting in index.html
let html = await readFile(join(SITE, 'index.html'), 'utf8');
for (const [file, hash] of Object.entries(hashes)) {
  const needle = `"${file}"`;
  const count = html.split(needle).length - 1;
  if (count !== 1) throw new Error(`index.html: expected ${needle} once, found ${count}`);
  html = html.replace(needle, `"${file}?v=${hash}"`);
}
await writeFile(join(OUT, 'index.html'), html);
const base = /<base href="([^"]+)"/.exec(html)?.[1] ?? '/';

// 4 · the web app, served from <base>app/ (hash routing and a base-relative worklet URL make it
//     work under any path once the base href matches)
let appReport = '';
if (WITH_APP) {
  const appBase = base + 'app/';
  const tmp = resolve(ROOT, 'dist/.site-app');
  await rm(tmp, { recursive: true, force: true });
  const run = (cmd, args) => {
    try {
      execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      process.stderr.write(String(err.stdout ?? '') + String(err.stderr ?? ''));
      throw new Error(`site build: ${cmd} ${args.join(' ')} failed`);
    }
  };
  run(process.execPath, ['scripts/build-worklets.mjs']);
  run('pnpm', ['exec', 'ng', 'build', '--base-href', appBase, '--output-path', tmp]);
  await cp(join(tmp, 'browser'), join(OUT, 'app'), { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  const appHtml = await readFile(join(OUT, 'app/index.html'), 'utf8');
  if (!appHtml.includes(`<base href="${appBase}"`)) throw new Error(`app/index.html: base href is not ${appBase}`);
  appReport = `  app/ ${' '.repeat(17)} web app, base ${appBase}`;
}

// 5 · every local reference must exist in the output
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
const host = canonical ? new URL(canonical).host : null;
const missing = [];
async function check(ref, fromDir, where) {
  let u = ref.split(/[?#]/)[0];
  if (!u || /^(data|mailto|tel|javascript):/.test(ref) || ref.startsWith('#')) return;
  if (/^https?:\/\//.test(u)) {
    const url = new URL(u);
    if (url.host !== host) return; // external link
    u = url.pathname;
  }
  if (u.startsWith('/')) {
    if (!u.startsWith(base)) return missing.push(`${where}: ${ref} lies outside ${base}`);
    u = u.slice(base.length);
    fromDir = '';
  }
  const path = posix.normalize(posix.join(fromDir, u || 'index.html'));
  try {
    const s = await stat(join(OUT, path));
    if (s.isDirectory()) await stat(join(OUT, path, 'index.html'));
  } catch {
    missing.push(`${where}: ${ref}`);
  }
}
for (const m of html.matchAll(/\s(?:src|href|poster)="([^"]+)"/g)) await check(m[1], '', 'index.html');
for (const m of html.matchAll(/\scontent="(https?:\/\/[^"]+)"/g)) await check(m[1], '', 'index.html');
for (const { file, loader } of MINIFY.filter((m) => m.loader === 'css')) {
  const css = await readFile(join(OUT, file), 'utf8');
  // quoted values are taken whole, so url(#n) inside an inline SVG data URI is not mistaken for a file
  for (const m of css.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^)"'\s]+))\s*\)/g)) {
    await check(m[2] ?? m[3], posix.dirname(file), file);
  }
}
if (missing.length) {
  console.error(`site build: ${missing.length} broken reference(s)\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// 6 · summary
async function walk(dir) {
  let files = 0;
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const r = await walk(join(dir, e.name));
      files += r.files;
      bytes += r.bytes;
    } else {
      files++;
      bytes += (await stat(join(dir, e.name))).size;
    }
  }
  return { files, bytes };
}
const { files, bytes } = await walk(OUT);
console.log(`site → ${relative(process.cwd(), OUT) || OUT}  (base ${base})`);
console.log([...report, appReport].filter(Boolean).join('\n'));
console.log(`  ${files} files, ${(bytes / 1048576).toFixed(1)} MB, all references resolve`);
