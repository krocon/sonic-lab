import { expect, test } from '@playwright/test';

test('encodes text, plays it and stops', async ({ page }) => {
  await page.goto('/#/morse-encoder');
  await page.getByLabel('Text to encode').fill('SOS');
  await expect(page.locator('output.code-line')).toHaveText('... --- ...');

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('li.token.active')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
