import { expect, test } from '@playwright/test';
import { frontPanel } from './fixtures/front-panel';

test('opens in the Morse decoder – there is no start page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/morse-decoder$/);
  await expect(page).toHaveTitle('Morse Decoder · AudioLab');
  await expect(page.getByRole('heading', { name: 'Morse Decoder', level: 1 })).toBeVisible();
});

test('F keys switch modules and mark the active one', async ({ page }) => {
  await page.goto('/#/morse-decoder');
  const nav = page.getByRole('navigation', { name: 'Analysis modules' });
  await expect(nav.getByRole('link')).toHaveCount(8);
  await nav.getByRole('link', { name: 'Tone Generator' }).click();
  await expect(page).toHaveURL(/#\/tone-generator$/);
  await expect(nav.getByRole('link', { name: 'Tone Generator' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Morse Decoder' })).not.toHaveAttribute(
    'aria-current',
  );
  await expect(page.getByRole('heading', { name: 'Tone Generator', level: 1 })).toBeVisible();
  await expect(page.locator('.flabels .fl.on')).toHaveText('Tone');
});

test('the soft keys follow the mode, the hardware stays', async ({ page }) => {
  await page.goto('/#/spectrum-analyzer');
  const panel = frontPanel(page);
  const softKeys = page.getByRole('group', { name: 'Soft keys' }).getByRole('button');
  await expect(softKeys).toHaveCount(6);
  await expect(panel.softKey('FFT size')).toHaveAccessibleName('FFT size: 4096');
  await panel.softKey('FFT size').click();
  await expect(panel.softKey('FFT size')).toHaveAccessibleName('FFT size: 8192');

  await page.getByRole('link', { name: 'DTMF Decoder' }).click();
  await expect(softKeys).toHaveCount(6);
  await expect(panel.softKey('Clear digits')).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Multi dial' })).toHaveAttribute(
    'aria-valuetext',
    'not used in this mode',
  );
});

test('the device scales down in a small window instead of reflowing', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 560 });
  await page.goto('/#/morse-decoder');
  const box = await page.locator('.device').boundingBox();
  expect(box?.width).toBeLessThanOrEqual(901);
  expect(box?.height).toBeLessThanOrEqual(561);
  await expect(page.getByRole('button', { name: 'Escape', exact: true })).toBeInViewport();
});

test('does not request the microphone on load', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __gumCalls: number };
    w.__gumCalls = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (original) {
      navigator.mediaDevices.getUserMedia = (c) => {
        w.__gumCalls++;
        return original(c);
      };
    }
  });
  await page.goto('/#/morse-decoder');
  await expect(page.getByRole('status').filter({ hasText: 'microphone is off' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)).toBe(
    0,
  );
});

test('stays dark when the system prefers a light theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/morse-decoder');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(5, 5, 6)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});
