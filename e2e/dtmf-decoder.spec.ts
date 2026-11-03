import { expect, test } from '@playwright/test';
import { DTMF_DEMO_KEYS } from '../src/app/core/capture/demo-signal';
import { DEMO_INPUT, frontPanel } from './fixtures/front-panel';

test('decodes the DTMF demo signal and lights the keypad', async ({ page }) => {
  await page.goto('/#/dtmf-decoder');
  await frontPanel(page).chooseInput(DEMO_INPUT);
  await frontPanel(page).key('Start').click();
  await expect(page.locator('output.digits')).toContainText(DTMF_DEMO_KEYS, { timeout: 15_000 });
  await expect(page.locator('.key.active')).toHaveCount(1, { timeout: 2_000 });
});
