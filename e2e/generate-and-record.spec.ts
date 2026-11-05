import { expect, test } from '@playwright/test';
import { fakeMicStats, installFakeMicrophone } from './fixtures/fake-microphone';
import { frontPanel } from './fixtures/front-panel';

test('tone generator plays, changes waveform while playing and stops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/tone-generator');
  const panel = frontPanel(page);
  await panel.key('Play').click();
  await expect(panel.state()).toHaveText('Output on');
  for (let i = 0; i < 5; i++) await panel.softKey('Waveform').click();
  await expect(panel.softKey('Waveform')).toHaveAccessibleName('Waveform: PINK NOISE');
  await expect(panel.state()).toHaveText('Output on');
  for (let i = 0; i < 4; i++) await panel.softKey('Waveform').click();
  await expect(panel.softKey('Waveform')).toHaveAccessibleName('Waveform: DTMF');
  await panel.key('9').click();
  await expect(panel.softKey('DTMF key')).toHaveAccessibleName('DTMF key: 9');
  await panel.key('Stop').click();
  await expect(panel.key('Play')).toBeEnabled();
  await expect(panel.state()).toHaveText('Output off');
  expect(errors).toEqual([]);
});

test('records the microphone and exports a WAV download', async ({ page }) => {
  await installFakeMicrophone(page, { frequency: 440 });
  // force the download path (headless browsers cannot show the native file picker)
  await page.addInitScript(
    () => delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker,
  );
  await page.goto('/#/audio-recorder');
  const panel = frontPanel(page);
  await panel.key('Record').click();
  await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible();
  await expect(page.getByLabel('Recorded time')).toHaveText(/^\s*0:01\.\d\s*$/, { timeout: 5_000 });
  await panel.key('Stop').click();
  await expect.poll(async () => (await fakeMicStats(page)).stopped).toBe(1);

  await panel.softKey('Format').click();
  await expect(panel.softKey('Format')).toHaveAccessibleName('Format: 32 FLOAT');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.softKey('Export…').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sonic-lab-.*\.wav$/);
  const path = await download.path();
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(path);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.readUInt16LE(20)).toBe(3); // float
  expect(bytes.length).toBeGreaterThan(48000 * 4); // > 1 s

  await panel.softKey('Discard').click();
  await expect(panel.message()).toHaveText('Recording discarded.');
});
