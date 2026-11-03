import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installFakeMicrophone } from './fixtures/fake-microphone';

const PAGES = [
  '/#/morse-decoder',
  '/#/dtmf-decoder',
  '/#/spectrum-analyzer',
  '/#/signal-monitor',
  '/#/morse-encoder',
  '/#/tone-generator',
  '/#/audio-recorder',
];

for (const path of PAGES) {
  test(`${path} has no axe violations`, async ({ page }) => {
    // reduced motion switches CSS transitions off, so axe never measures a colour mid-transition
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) =>
          `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} – ${n.failureSummary} – ${n.html.slice(0, 200)}`).join(' | ')}`,
      ),
    ).toEqual([]);
  });
}

test('hardware keys and knobs work with the keyboard', async ({ page }) => {
  await page.goto('/#/morse-encoder');
  const speed = page.getByRole('slider', { name: 'Speed', exact: true });
  await speed.focus();
  await page.keyboard.press('ArrowUp');
  await expect(speed).toHaveAttribute('aria-valuetext', '21 WPM');
  const dial = page.getByRole('slider', { name: 'Multi dial: Speed' });
  await dial.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dial).toHaveAttribute('aria-valuetext', '20 WPM');

  await page.goto('/#/spectrum-analyzer');
  const axis = page.getByRole('button', { name: /^Frequency axis/ });
  await axis.focus();
  await page.keyboard.press('Enter');
  await expect(axis).toHaveAccessibleName('Frequency axis: LINEAR');
  await expect(axis).toBeFocused();
});

test('the decoder can be operated with the keyboard', async ({ page }) => {
  await installFakeMicrophone(page);
  await page.goto('/#/morse-decoder');
  const start = page.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeEnabled(); // the page has bound the key
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Listening' })).toBeVisible();
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await stop.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toBeVisible();
  // a key that has nothing to do now stays focusable
  await expect(stop).toBeDisabled();
  await expect(stop).toBeFocused();
});

test('INPUT and MENU open lists that Escape closes', async ({ page }) => {
  await page.goto('/#/morse-decoder');
  await page.getByRole('button', { name: 'Audio input', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Audio input' });
  await expect(dialog.getByRole('button', { name: 'Default input' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Front panel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('skip link moves focus to the workspace', async ({ page, browserName }) => {
  test.skip(
    browserName === 'webkit',
    'Safari/WebKit does not move focus to links with Tab by default',
  );
  await page.goto('/#/morse-decoder');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
