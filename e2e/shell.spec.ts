import { expect, test } from '@playwright/test';

test('overview lists the modules and links to the Morse decoder', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('AudioLab');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('on your device');

  await page.getByRole('link', { name: 'Open Morse Decoder' }).click();
  await expect(page).toHaveURL(/#\/morse-decoder$/);
  await expect(page.getByRole('heading', { name: 'Morse Decoder', level: 1 })).toBeVisible();
});

test('navigation marks the active module and shows planned modules', async ({ page }) => {
  await page.goto('/#/tone-generator');
  const nav = page.getByRole('navigation', { name: 'Analysis modules' });
  await expect(nav.getByRole('link', { name: /Tone Generator/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('prompts/08-tone-generator-and-recorder.md')).toBeVisible();
});

test('does not request the microphone on load', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __gumCalls: number };
    w.__gumCalls = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (original) {
      navigator.mediaDevices.getUserMedia = (c) => {
        w.__gumCalls++;
        return original(c);
      };
    }
  });
  await page.goto('/#/morse-decoder');
  await expect(page.getByRole('status').filter({ hasText: 'microphone is off' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)).toBe(
    0,
  );
});

test('theme toggle cycles system → light → dark', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /Theme:/ });
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});
