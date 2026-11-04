// Uploads the built promo site (dist/site) by FTP.
//
//   pnpm site:deploy              build, upload, list remote files that are not part of the site
//   pnpm site:deploy --prune      … and delete those files (e.g. an old app build in the folder)
//   pnpm site:deploy --dry-run    build and show what would happen, change nothing
//
// Connection settings come from the environment – normally from .env.deploy in the repository root,
// which is git-ignored (copy .env.deploy.example). This repository is public: no credentials in it.
//
//   SITE_FTP_HOST, SITE_FTP_USER   required
//   SITE_FTP_DIR                   required – the remote folder published as /products/sonic-lab/
//   SITE_FTP_PASSWORD              optional – asked for (hidden) when missing
//   SITE_FTP_PORT                  default 21
//   SITE_FTP_SECURE                true = FTPS with explicit TLS (default), implicit, or false
//   SITE_URL                       checked after the upload; default: canonical URL of index.html
import { Client } from 'basic-ftp';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const LOCAL = resolve(ROOT, process.env.SITE_DIST ?? 'dist/site');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const PRUNE = args.has('--prune');

const env = (k, fallback) => process.env[k]?.trim() || fallback;
const fail = (msg) => {
  console.error(`site:deploy: ${msg}`);
  process.exit(1);
};

const missing = ['SITE_FTP_HOST', 'SITE_FTP_USER', 'SITE_FTP_DIR'].filter((k) => !env(k));
if (missing.length) fail(`missing ${missing.join(', ')} – copy .env.deploy.example to .env.deploy and fill it in`);
const secureEnv = env('SITE_FTP_SECURE', 'true').toLowerCase();
const cfg = {
  host: env('SITE_FTP_HOST'),
  port: Number(env('SITE_FTP_PORT', '21')),
  user: env('SITE_FTP_USER'),
  secure: secureEnv === 'implicit' ? 'implicit' : secureEnv !== 'false',
  dir: posix.normalize(env('SITE_FTP_DIR')).replace(/\/+$/, '') || '/',
};

// ── local files ──────────────────────────────────────────────────────────────────────────────
async function walk(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = prefix + e.name;
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel + '/')));
    else out.push({ rel, size: (await stat(join(dir, e.name))).size });
  }
  return out;
}
let html;
try {
  html = await readFile(join(LOCAL, 'index.html'), 'utf8');
} catch {
  fail(`${LOCAL} has no index.html – run pnpm site:build first`);
}
const local = await walk(LOCAL);
// index.html last: the new page goes live only once everything it references is on the server
local.sort((a, b) => (a.rel === 'index.html') - (b.rel === 'index.html') || a.rel.localeCompare(b.rel));
const localFiles = new Set(local.map((f) => f.rel));
const localDirs = new Set(local.flatMap((f) => f.rel.split('/').slice(0, -1).map((_, i, p) => p.slice(0, i + 1).join('/'))));
const sitePath = /<base href="([^"]+)"/.exec(html)?.[1] ?? '/';
const siteUrl = env('SITE_URL', /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]);
// --prune deletes on the server: only in a folder named like the site's own path (…/sonic-lab),
// checked before anything is touched
const ownName = sitePath.replace(/\/+$/, '').split('/').pop();
if (PRUNE && (!ownName || posix.basename(cfg.dir) !== ownName)) {
  fail(`--prune only runs in a folder named "${ownName}", SITE_FTP_DIR is ${cfg.dir}`);
}

// ── password: environment or a hidden prompt ─────────────────────────────────────────────────
async function askHidden(question) {
  if (!process.stdin.isTTY) fail('SITE_FTP_PASSWORD is not set and there is no terminal to ask for it');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = rl._writeToOutput?.bind(rl);
  rl._writeToOutput = (s) => (s.includes(question) || s === '\r\n' || s === '\n' ? write(s) : undefined);
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      done(answer);
    }),
  );
}
const password = process.env.SITE_FTP_PASSWORD || (await askHidden(`FTP password for ${cfg.user}@${cfg.host}: `));

// ── remote ───────────────────────────────────────────────────────────────────────────────────
const client = new Client(30_000);
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} kB`);

async function listRemote(abs, prefix = '') {
  let entries;
  try {
    entries = await client.list(abs);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name === '.' || e.name === '..') continue;
    const rel = prefix + e.name;
    if (e.isDirectory) out.push({ rel, dir: true }, ...(await listRemote(posix.join(abs, e.name), rel + '/')));
    else out.push({ rel, dir: false });
  }
  return out;
}

let connected = false;
try {
  await client.access({ host: cfg.host, port: cfg.port, user: cfg.user, password, secure: cfg.secure });
  connected = true;
  const home = await client.pwd();
  const base = cfg.dir.startsWith('/') ? cfg.dir : posix.join(home, cfg.dir);
  const mode = cfg.secure ? (cfg.secure === 'implicit' ? 'FTPS (implicit)' : 'FTPS') : 'FTP – unencrypted';
  console.log(`${DRY ? 'dry run: ' : ''}${relativeLocal()} → ${cfg.host}:${base}  [${mode}]`);

  // stale = on the server below base, but not part of this build
  const remote = await listRemote(base);
  const staleDirs = remote.filter((r) => r.dir && !localDirs.has(r.rel));
  const staleTop = staleDirs.filter((d) => !staleDirs.some((o) => o !== d && d.rel.startsWith(o.rel + '/')));
  const staleFiles = remote.filter((r) => !r.dir && !localFiles.has(r.rel) && !staleTop.some((d) => r.rel.startsWith(d.rel + '/')));

  const total = local.reduce((n, f) => n + f.size, 0);
  if (DRY) {
    console.log(`  would upload ${local.length} files, ${kb(total)} (index.html last)`);
  } else {
    let cwd = null;
    let done = 0;
    for (const f of local) {
      const dir = posix.join(base, posix.dirname(f.rel));
      if (dir !== cwd) {
        await client.ensureDir(dir);
        cwd = dir;
      }
      await client.uploadFrom(join(LOCAL, ...f.rel.split('/')), posix.basename(f.rel));
      done += f.size;
      console.log(`  ↑ ${f.rel.padEnd(42)} ${kb(f.size).padStart(9)}   ${Math.round((done / total) * 100)} %`);
    }
  }

  const stale = [...staleTop.map((d) => d.rel + '/'), ...staleFiles.map((f) => f.rel)];
  if (stale.length) {
    console.log(`  ${stale.length} remote entr${stale.length === 1 ? 'y is' : 'ies are'} not part of the site:`);
    stale.forEach((s) => console.log(`    ${s}`));
    if (PRUNE && !DRY) {
      for (const d of staleTop) await client.removeDir(posix.join(base, d.rel));
      for (const f of staleFiles) await client.remove(posix.join(base, f.rel));
      console.log(`  removed ${stale.length}`);
    } else {
      console.log(`  ${DRY ? 'pnpm site:deploy --prune would delete them' : 'run pnpm site:deploy --prune to delete them'}`);
    }
  }
} catch (err) {
  const msg = String(err?.message ?? err);
  const tlsTrouble = cfg.secure && !connected && !/^530\b/.test(msg); // 530 = wrong user/password
  const hint = tlsTrouble
    ? ' – the server may not offer FTPS (or its certificate does not match SITE_FTP_HOST); ' +
      'SITE_FTP_SECURE=false falls back to unencrypted FTP'
    : '';
  fail(`${msg}${hint}`);
} finally {
  client.close();
}

// ── check the live page ──────────────────────────────────────────────────────────────────────
if (!DRY && siteUrl && !env('SITE_SKIP_CHECK')) {
  const css = /href="(assets\/css\/site\.css\?v=[0-9a-f]+)"/.exec(html)?.[1];
  try {
    const page = await (await fetch(`${siteUrl}?deploy=${Date.now()}`, { cache: 'no-store' })).text();
    const cssOk = css && (await fetch(new URL(css, siteUrl), { cache: 'no-store' })).ok;
    if (css && page.includes(css) && cssOk) console.log(`live: ${siteUrl} serves this build`);
    else console.warn(`live: ${siteUrl} does not serve this build yet (cache, or SITE_FTP_DIR is not the published folder)`);
  } catch (err) {
    console.warn(`live: could not check ${siteUrl}: ${err.message}`);
  }
}

function relativeLocal() {
  return LOCAL.startsWith(ROOT) ? LOCAL.slice(ROOT.length + 1) : LOCAL;
}
