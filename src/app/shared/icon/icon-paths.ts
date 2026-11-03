/**
 * Stroke icons on a 24×24 grid (drawn for AudioLab, no icon library).
 * Each entry is one or more SVG path `d` strings.
 */
export const ICON_PATHS = {
  logo: ['M3 12h2.5l2-6 3 12 3-9 2 5 1.5-2H21'],
  morse: ['M3 12h2', 'M8 12h6', 'M17 12h1', 'M21 12h0', 'M3 7h18', 'M3 17h18'],
  keypad: [
    'M6 5h0',
    'M12 5h0',
    'M18 5h0',
    'M6 10h0',
    'M12 10h0',
    'M18 10h0',
    'M6 15h0',
    'M12 15h0',
    'M18 15h0',
    'M12 20h0',
  ],
  frequency: ['M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0'],
  spectrum: ['M4 20V14', 'M8 20V8', 'M12 20V11', 'M16 20V5', 'M20 20v-9'],
  monitor: ['M3 5h18v12H3z', 'M8 21h8', 'M6 13l3-3 3 2 4-5 2 2'],
  encode: ['M4 7h10', 'M4 12h6', 'M4 17h10', 'M17 9l3 3-3 3'],
  tone: ['M3 12h3l3-7 6 14 3-7h3'],
  record: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  mic: ['M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  play: ['M7 5l12 7-12 7z'],
  stop: ['M6 6h12v12H6z'],
  reset: ['M4 12a8 8 0 1 0 2.3-5.6', 'M4 4v4h4'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  desktop: ['M3 4h18v13H3z', 'M8 21h8', 'M12 17v4'],
  globe: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M3 12h18',
    'M12 3c3 3 3 15 0 18',
    'M12 3c-3 3-3 15 0 18',
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICON_PATHS;
