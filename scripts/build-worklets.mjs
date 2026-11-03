// Bundles the AudioWorklet processors (src/worklets/*-processor.ts) to public/worklets/*.js.
// The Angular application builder does not bundle AudioWorklet modules, and Blob URLs would
// require relaxing the CSP – so the worklets are emitted as plain same-origin assets.
// Usage: node scripts/build-worklets.mjs [--watch]
import { build, context } from 'esbuild';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = 'src/worklets';
const entryPoints = readdirSync(srcDir)
  .filter((f) => f.endsWith('-processor.ts'))
  .map((f) => join(srcDir, f));

const options = {
  entryPoints,
  outdir: 'public/worklets',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
