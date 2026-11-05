import { expect, test } from '@playwright/test';
import { DEMO_TEXT } from '../src/app/core/capture/demo-signal';
import { scheduleMorse } from '../src/app/decoders/morse/morse-timing';
import { installFakeMicrophone } from './fixtures/fake-microphone';
import { DEMO_INPUT, frontPanel } from './fixtures/front-panel';

test.describe('Morse decoder', () => {
  test('decodes Morse from the microphone and copies the text', async ({
    page,
    context,
    browserName,
  }) => {
    const schedule = scheduleMorse('PARIS TEST', { wpm: 20, leadIn: 0.3 });
    await installFakeMicrophone(page, {
      frequency: 650,
      spans: schedule.elements.map((e) => [e.start, e.end] as const),
      loopSeconds: schedule.duration + 1.5,
    });
    // clipboard permissions can only be granted in Chromium
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/#/morse-decoder');
    const panel = frontPanel(page);
    await panel.key('Start').click();

    const text = page.getByLabel('Text', { exact: true });
    await expect(text).toContainText('PARIS TEST', { timeout: 15_000 });
    await expect(page.getByLabel('Morse', { exact: true })).toContainText('.--. .- .-. .. ...');
    await expect(page.locator('.ro.hot dd')).toHaveText(/^(19|20|21)WPM$/);
    await expect(page.locator('.ro.accent dd')).toHaveText(/^(600|650|700)Hz$/);

    if (browserName === 'chromium') {
      await panel.key('Copy text').click();
      await expect(panel.message()).toHaveText('Text copied to the clipboard.');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('PARIS TEST');
    }

    await panel.softKey('Reset').click();
    await expect(text).not.toContainText('PARIS');

    // the log keeps what was decoded, with time and speed
    await panel.softKey('View').click();
    await expect(panel.softKey('View')).toHaveAccessibleName('View: LOG');
    await expect(page.getByRole('log', { name: 'Log' })).toContainText(
      /\d\d:\d\d:\d\d\s+(19|20|21) WPM\s+PARIS TEST/,
    );
    if (browserName === 'chromium') {
      await panel.key('Copy log').click();
      await expect(panel.message()).toHaveText('Log copied to the clipboard.');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
        /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d  (19|20|21) WPM  PARIS TEST/,
      );
    }
  });

  test('decodes the demo signal', async ({ page }) => {
    await page.goto('/#/morse-decoder');
    await frontPanel(page).chooseInput(DEMO_INPUT);
    await frontPanel(page).key('Start').click();
    await expect(page.getByLabel('Text', { exact: true })).toContainText(DEMO_TEXT, {
      timeout: 20_000,
    });
  });

  test('remembers detection settings', async ({ page }) => {
    await page.goto('/#/morse-decoder');
    const panel = frontPanel(page);
    await panel.softKey('Tone frequency').click();
    await panel.softKey('Sensitivity').click();
    await panel.softKey('Room mode').click();
    await expect(panel.softKey('Tone frequency')).toHaveAccessibleName('Tone frequency: FIXED');
    await page.reload();
    await expect(panel.softKey('Tone frequency')).toHaveAccessibleName('Tone frequency: FIXED');
    await expect(panel.softKey('Sensitivity')).toHaveAccessibleName('Sensitivity: HIGH');
    await expect(panel.softKey('Room mode')).toHaveAccessibleName('Room mode: ON');
    await expect(page.locator('.end .chip').last()).toHaveText('Room mode');
    await expect(page.getByRole('slider', { name: 'Fixed tone', exact: true })).toBeVisible();
  });

  test('takes a fixed tone from the keypad', async ({ page }) => {
    await page.goto('/#/morse-decoder');
    const panel = frontPanel(page);
    await panel.softKey('Fixed tone').click();
    await expect(panel.softKey('Fixed tone')).toHaveAttribute('aria-pressed', 'true');
    for (const d of ['9', '5', '0']) await panel.key(d).click();
    await panel.key('Enter').click();
    await expect(panel.softKey('Fixed tone')).toHaveAccessibleName('Fixed tone: 950 Hz');
    await expect(panel.softKey('Tone frequency')).toHaveAccessibleName('Tone frequency: FIXED');
  });
});
