import { expect, test } from '@playwright/test';
import { installFakeMicrophone } from './fixtures/fake-microphone';

test('tone generator plays, changes waveform while playing and stops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/tone-generator');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' })).toBeVisible();
  await page.getByRole('radio', { name: 'Pink noise' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' })).toBeVisible();
  await page.getByRole('radio', { name: 'DTMF' }).click();
  await page.getByRole('radio', { name: '#' }).click();
  await expect(page.getByRole('radio', { name: '#' })).toBeChecked();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('records the microphone and exports a WAV download', async ({ page }) => {
  await installFakeMicrophone(page, { frequency: 440 });
  // force the download path (headless browsers cannot show the native file picker)
  await page.addInitScript(
    () => delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  await page.goto('/#/audio-recorder');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible();
  await expect(page.getByLabel('Recorded time')).toHaveText(/^0:01\.\d$/, { timeout: 5_000 });
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.locator('footer.statusbar')).toContainText('Microphone off');

  await page.getByRole('radio', { name: 'WAV 32-bit float' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export…' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^audiolab-.*\.wav$/);
  const path = await download.path();
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(path);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.readUInt16LE(20)).toBe(3); // float
  expect(bytes.length).toBeGreaterThan(48000 * 4); // > 1 s

  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Recording discarded.')).toBeVisible();
});
