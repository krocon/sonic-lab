import { Page, expect, test } from '@playwright/test';
import { fakeMicStats, installFakeMicrophone } from './fixtures/fake-microphone';
import { DEMO_INPUT, frontPanel } from './fixtures/front-panel';

async function waveformHasSignal(page: Page): Promise<boolean> {
  return page.locator('app-waveform-canvas canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mid = Math.floor(canvas.height / 2);
    let lit = 0;
    for (let y = 0; y < canvas.height; y++) {
      if (Math.abs(y - mid) < 3) continue; // ignore the centre axis
      for (let x = 0; x < canvas.width; x += 4)
        if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 0) lit++;
    }
    return lit > 50;
  });
}

const listening = (page: Page) => page.getByRole('status').filter({ hasText: 'Listening' });

test.describe('audio capture', () => {
  test('starts and stops the microphone', async ({ page }) => {
    await installFakeMicrophone(page);
    await page.goto('/#/morse-decoder');
    await frontPanel(page).key('Start').click();
    await expect(listening(page)).toBeVisible();
    await expect.poll(() => fakeMicStats(page)).toEqual({ calls: 1, stopped: 0 });
    await expect.poll(() => waveformHasSignal(page)).toBe(true);
    await expect(page.getByRole('meter', { name: 'Input level' })).not.toContainText('– dB');

    await frontPanel(page).key('Stop').click();
    await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toBeVisible();
    await expect.poll(() => fakeMicStats(page)).toEqual({ calls: 1, stopped: 1 });
  });

  test('releases the microphone when leaving the page', async ({ page }) => {
    await installFakeMicrophone(page);
    await page.goto('/#/morse-decoder');
    await frontPanel(page).key('Start').click();
    await expect.poll(() => fakeMicStats(page)).toEqual({ calls: 1, stopped: 0 });
    await page.getByRole('link', { name: 'Tone Generator' }).click();
    await expect.poll(async () => (await fakeMicStats(page)).stopped).toBe(1);
  });

  test('lists devices and remembers the choice', async ({ page, context }) => {
    await installFakeMicrophone(page);
    await page.goto('/#/morse-decoder');
    await frontPanel(page).chooseInput('Fake USB Mic');
    await expect(page.locator('.status .input')).toHaveText('Input · Fake USB Mic');
    // a fresh page in the same browser profile (WebKit does not re-apply init scripts on reload)
    const second = await context.newPage();
    await installFakeMicrophone(second);
    await second.goto('/#/morse-decoder');
    await frontPanel(second).key('Audio input').click();
    await expect(
      second
        .getByRole('dialog', { name: 'Audio input' })
        .getByRole('button', { name: 'Fake USB Mic' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('uses the demo input without opening the microphone', async ({ page }) => {
    await installFakeMicrophone(page);
    await page.goto('/#/morse-decoder');
    await frontPanel(page).chooseInput(DEMO_INPUT);
    await frontPanel(page).key('Start').click();
    await expect(listening(page)).toBeVisible();
    await expect.poll(() => waveformHasSignal(page)).toBe(true);
    expect((await fakeMicStats(page)).calls).toBe(0);
  });

  test('switches device while running', async ({ page }) => {
    await installFakeMicrophone(page);
    await page.goto('/#/morse-decoder');
    await frontPanel(page).key('Start').click();
    await expect.poll(() => fakeMicStats(page)).toEqual({ calls: 1, stopped: 0 });
    await frontPanel(page).chooseInput(DEMO_INPUT);
    await expect(listening(page)).toBeVisible();
    await expect.poll(async () => (await fakeMicStats(page)).stopped).toBe(1);
  });

  test('explains a denied permission', async ({ page }) => {
    await installFakeMicrophone(page, { failWith: 'NotAllowedError' });
    await page.goto('/#/morse-decoder');
    await frontPanel(page).key('Start').click();
    await expect(frontPanel(page).message()).toContainText('Microphone access was denied.');
    await expect(frontPanel(page).key('Start')).toBeEnabled();
  });

  test('explains a missing device', async ({ page }) => {
    await installFakeMicrophone(page, { failWith: 'NotFoundError' });
    await page.goto('/#/morse-decoder');
    await frontPanel(page).key('Start').click();
    await expect(frontPanel(page).message()).toContainText('No microphone was found.');
  });
});
