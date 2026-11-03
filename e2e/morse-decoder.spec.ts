import { expect, test } from '@playwright/test';
import { DEMO_TEXT } from '../src/app/core/capture/demo-signal';
import { scheduleMorse } from '../src/app/decoders/morse/morse-timing';
import { installFakeMicrophone } from './fixtures/fake-microphone';

test.describe('Morse decoder', () => {
  test('decodes Morse from the microphone and copies the text', async ({ page, context }) => {
    const schedule = scheduleMorse('PARIS TEST', { wpm: 20, leadIn: 0.3 });
    await installFakeMicrophone(page, {
      frequency: 650,
      spans: schedule.elements.map((e) => [e.start, e.end] as const),
      loopSeconds: schedule.duration + 1.5,
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/#/morse-decoder');
    await page.getByRole('button', { name: 'Start' }).click();

    const text = page.getByLabel('Text', { exact: true });
    await expect(text).toContainText('PARIS TEST', { timeout: 15_000 });
    await expect(page.getByLabel('Morse', { exact: true })).toContainText('.--. .- .-. .. ...');
    await expect(page.locator('.stat strong')).toHaveText(/^(19|20|21) WPM$/);
    await expect(page.getByText(/auto · (600|650|700) Hz/)).toBeVisible();

    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('Text copied to the clipboard.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('PARIS TEST');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(text).not.toContainText('PARIS');
  });

  test('decodes the demo signal', async ({ page }) => {
    await page.goto('/#/morse-decoder');
    await page
      .getByLabel('Audio input')
      .selectOption({ label: 'Demo signal (synthetic, no microphone)' });
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByLabel('Text', { exact: true })).toContainText(DEMO_TEXT, {
      timeout: 20_000,
    });
  });

  test('remembers detection settings', async ({ page }) => {
    await page.goto('/#/morse-decoder');
    await page.getByLabel('Tone frequency').selectOption('manual');
    await page.getByLabel('Sensitivity').selectOption('high');
    await page.reload();
    await expect(page.getByLabel('Tone frequency')).toHaveValue('manual');
    await expect(page.getByRole('slider', { name: /^Frequency/ })).toBeVisible();
    await expect(page.getByLabel('Sensitivity')).toHaveValue('high');
  });
});
