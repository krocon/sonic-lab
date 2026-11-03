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
  await page.goto('/#/morse-encoder');
  const panel = frontPanel(page);
  await page.getByLabel('Text to encode').fill('');
  for (const d of ['7', '7', '7', '7', '0', '2']) await panel.key(d).click();
  await expect(page.getByLabel('Text to encode')).toHaveValue('S A');
  await panel.key('Clear').click();
  await expect(page.getByLabel('Text to encode')).toHaveValue('S ');
});
