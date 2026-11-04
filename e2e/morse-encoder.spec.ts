import { expect, test } from '@playwright/test';
import { frontPanel } from './fixtures/front-panel';

test('encodes text, plays it and stops', async ({ page }) => {
  await page.goto('/#/morse-encoder');
  await page.getByLabel('Text to encode').fill('SOS');
  await expect(page.locator('output.code-line')).toHaveText('... --- ...');

  const panel = frontPanel(page);
  await panel.key('Play').click();
  await expect(panel.key('Stop')).toBeEnabled();
  await expect(panel.state()).toHaveText('Playing');
  await expect(page.locator('li.token.active')).toHaveCount(1);
  await panel.key('Stop').click();
  await expect(panel.key('Play')).toBeEnabled();
  await expect(panel.state()).toHaveText('Ready');
});

test('types with the keypad like a phone', async ({ page }) => {
  // Multi-tap picks the next letter only if the same key comes again within a second. A click
  // waits for two animation frames first, which software-rendered WebKit on CI can take longer
  // than that – so the test sets the time between presses instead of racing the wall clock.
  const start = new Date('2026-01-05T12:00:00Z').getTime();
  await page.clock.setFixedTime(start);
  await page.goto('/#/morse-encoder');
  const panel = frontPanel(page);
  const text = page.getByLabel('Text to encode');
  await text.fill('');
  for (const d of ['7', '7', '7', '7', '0', '2']) await panel.key(d).click();
  await expect(text).toHaveValue('S A');

  // after a pause the same key starts a new letter
  await page.clock.setFixedTime(start + 1500);
  await panel.key('2').click();
  await expect(text).toHaveValue('S AA');

  await panel.key('Clear').click();
  await expect(text).toHaveValue('S A');
});
