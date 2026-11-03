import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * The desktop app serves the production build under the CSP from tauri.conf.json. Tauri adds
 * hashes for inline <style>/<script> of index.html to the policy, and a hash makes browsers ignore
 * 'unsafe-inline' – which would block the <style> elements Angular inserts for component styles.
 * These tests load the production build with that CSP (requires `pnpm build`).
 */
const dist = join(process.cwd(), 'dist/audiolab/browser');
const conf = JSON.parse(readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8')) as {
  app: { security: { csp: string; dangerousDisableAssetCspModification?: string[] } };
};
const csp = process.env['CSP_OVERRIDE'] ?? conf.app.security.csp;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

test.skip(!existsSync(join(dist, 'index.html')), 'run `pnpm build` first');

test('index.html contains no inline styles or scripts for Tauri to hash', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  expect(html).not.toMatch(/<style[\s>]/);
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  // and Tauri must leave style-src alone (Angular inserts component <style> elements at runtime)
  expect(conf.app.security.dangerousDisableAssetCspModification).toContain('style-src');
});

test('the production build renders with component styles under the desktop CSP', async ({
  page,
}) => {
  await page.route('http://desktop.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(dist, path === '/' ? 'index.html' : path);
    if (!existsSync(file)) return route.fulfill({ status: 404 });
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': csp,
      },
      body: readFileSync(file),
    });
  });
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI}`,
      );
    });
  });
  page.on('console', (m) => m.type() === 'error' && violations.push(m.text()));

  await page.goto('http://desktop.test/#/morse-decoder');
  await expect(page.getByRole('heading', { name: 'Morse Decoder', level: 1 })).toBeVisible();
  // component styles: the shell is a CSS grid, the nav icons are 20 px SVGs without fill
  await expect(page.locator('app-shell')).toHaveCSS('display', 'grid');
  await expect(page.locator('nav app-icon svg').first()).toHaveCSS('fill', 'none');
  // global stylesheet active (not stuck on media="print")
  await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const blocked = await page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
  expect(blocked).toEqual([]);
  expect(violations.filter((v) => /Content Security Policy|Refused/.test(v))).toEqual([]);
});
