import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installFakeMicrophone } from './fixtures/fake-microphone';

const PAGES = ['/', '/#/morse-decoder', '/#/dtmf-decoder'];

for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} has no axe violations (${scheme})`, async ({ page }) => {
      // reduced motion switches CSS transitions off, so axe never measures a colour mid-transition
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
}

test('the decoder can be operated with the keyboard', async ({ page }) => {
  await installFakeMicrophone(page);
  await page.goto('/#/morse-decoder');
  const start = page.getByRole('button', { name: 'Start' });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Listening' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toBeVisible();
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
