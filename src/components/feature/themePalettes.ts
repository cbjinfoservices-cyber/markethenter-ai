/**
 * The site's colour panels. Every surface, text and accent colour already runs
 * through the same CSS variables, so changing a palette is simply swapping
 * their values on the document root — no page needs to know about it.
 *
 * The first palette is the house one and needs no override at all.
 */
export type Palette = {
  id: string;
  /** Three dots shown on the swatch button. */
  dots: [string, string, string];
  /** CSS variables written on <html>. Empty for the house palette. */
  vars: Record<string, string>;
};

export const PALETTES: Palette[] = [
  {
    id: 'ambre',
    dots: ['#0c1218', '#f5a63c', '#e8f0f9'],
    vars: {},
  },
  {
    id: 'cuivre',
    dots: ['#170f0c', '#e0703f', '#f6e9e1'],
    vars: {
      '--bg': '#170f0c',
      '--surface': '#261a16',
      '--text': '#f6e9e1',
      '--muted': '#b0968a',
      '--accent': '#e0703f',
      '--accent2': '#f2b08c',
      '--alert': '#e05a5a',
    },
  },
  {
    id: 'foret',
    dots: ['#0b1512', '#7fce9b', '#e6f2ec'],
    vars: {
      '--bg': '#0b1512',
      '--surface': '#16241f',
      '--text': '#e6f2ec',
      '--muted': '#8aa79a',
      '--accent': '#7fce9b',
      '--accent2': '#c3e8cf',
      '--alert': '#ef7a63',
    },
  },
  {
    id: 'ocean',
    dots: ['#08131b', '#53b9d6', '#e4f1fa'],
    vars: {
      '--bg': '#08131b',
      '--surface': '#102330',
      '--text': '#e4f1fa',
      '--muted': '#86a2b5',
      '--accent': '#53b9d6',
      '--accent2': '#a6dcec',
      '--alert': '#ef7a63',
    },
  },
  {
    id: 'prune',
    dots: ['#130f1a', '#c08ad9', '#f0e9f7'],
    vars: {
      '--bg': '#130f1a',
      '--surface': '#1f1828',
      '--text': '#f0e9f7',
      '--muted': '#a394b5',
      '--accent': '#c08ad9',
      '--accent2': '#e0c1ee',
      '--alert': '#ef7a63',
    },
  },
  {
    id: 'sable',
    dots: ['#171410', '#d9a441', '#f2e9dc'],
    vars: {
      '--bg': '#171410',
      '--surface': '#241f19',
      '--text': '#f2e9dc',
      '--muted': '#b3a493',
      '--accent': '#d9a441',
      '--accent2': '#f0cd8a',
      '--alert': '#e0704f',
    },
  },
];

const KEY = 'mh:theme:palette';
export const HOUSE_PALETTE = PALETTES[0].id;

const VARIABLES = ['--bg', '--surface', '--text', '--muted', '--accent', '--accent2', '--alert'];

/** Paints the chosen palette on the whole site. Safe to call at any time. */
export function applyPalette(id: string): void {
  const palette = PALETTES.find((item) => item.id === id) ?? PALETTES[0];
  const root = document.documentElement;
  VARIABLES.forEach((name) => root.style.removeProperty(name));
  Object.entries(palette.vars).forEach(([name, value]) => root.style.setProperty(name, value));
  root.dataset.palette = palette.id;
}

/** Reads the palette kept on this device, falling back to the house one. */
export function readPalette(): string {
  try {
    const stored = window.localStorage.getItem(KEY);
    return PALETTES.some((item) => item.id === stored) ? (stored as string) : HOUSE_PALETTE;
  } catch {
    return HOUSE_PALETTE;
  }
}

/** Keeps the palette on this device; the house one clears the choice. */
export function rememberPalette(id: string): void {
  try {
    if (id === HOUSE_PALETTE) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked — the palette simply lasts for this visit */
  }
}

/** Called once before the first paint, so the site never flashes the wrong one. */
export function applyStoredPalette(): void {
  applyPalette(readPalette());
}