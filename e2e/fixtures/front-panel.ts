import { Page } from '@playwright/test';

export const DEMO_INPUT = 'Demo signal (synthetic, no microphone)';

/** The hardware of the front panel, located like a user would find it. */
export function frontPanel(page: Page) {
  const key = (name: string) => page.getByRole('button', { name, exact: true });
  return {
    key,
    /** A soft key by what it does; its accessible name also carries the setting ("Tone frequency: AUTO"). */
    softKey: (name: string) =>
      page.getByRole('group', { name: 'Soft keys' }).getByRole('button', {
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      }),
    /** Chooses an audio input with the INPUT key. */
    chooseInput: async (label: string) => {
      await key('Audio input').click();
      await page
        .getByRole('dialog', { name: 'Audio input' })
        .getByRole('button', { name: label })
        .click();
    },
    /** Status line of the display (capture or output state). */
    state: () => page.locator('.status [role="status"]'),
    /** Message line of the display (results and errors). */
    message: () => page.locator('.message[role="status"]'),
  };
}
