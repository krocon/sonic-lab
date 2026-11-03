import { expect, test } from '@playwright/test';
import { DTMF_DEMO_KEYS } from '../src/app/core/capture/demo-signal';

test('decodes the DTMF demo signal and lights the keypad', async ({ page }) => {
  await page.goto('/#/dtmf-decoder');
  await page
    .getByLabel('Audio input')
    .selectOption({ label: 'Demo signal (synthetic, no microphone)' });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('output.digits')).toContainText(DTMF_DEMO_KEYS, { timeout: 15_000 });
  await expect(page.locator('.key.active')).toHaveCount(1, { timeout: 2_000 });
});
