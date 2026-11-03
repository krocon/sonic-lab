import { expect, test } from '@playwright/test';
import { installFakeMicrophone } from './fixtures/fake-microphone';

test('frequency analyzer measures the input tone', async ({ page }) => {
  await installFakeMicrophone(page, { frequency: 1234 });
  await page.goto('/#/frequency-analyzer');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.frequency .value')).toHaveText(/^123[3-5]\.\d$/, { timeout: 10_000 });
});

test('spectrum analyzer shows the peak and draws', async ({ page }) => {
  await installFakeMicrophone(page, { frequency: 700 });
  await page.goto('/#/spectrum-analyzer');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/^(699|700|701)\.\d Hz$/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('img', { name: 'Spectrogram' })).toBeVisible();
});

test('signal monitor shows level and frequency', async ({ page }) => {
  await installFakeMicrophone(page, { frequency: 500, amplitude: 0.5 });
  await page.goto('/#/signal-monitor');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/^(49\d|50\d) Hz$/)).toBeVisible({ timeout: 10_000 });
});
