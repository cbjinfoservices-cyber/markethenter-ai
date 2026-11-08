/* One light/dark preference for the two work pages — the calculator and the
   dashboard — so long typing sessions do not force the reader to set it twice. */
export type PageSkin = 'dark' | 'light';

const SKIN_KEY = 'mh:skin';
/* The calculator used to keep its own copy: still read, so nobody loses their
   setting when this module takes over. */
const LEGACY_KEY = 'mh:calc:skin';

export function readSkin(): PageSkin {
  try {
    const stored =
      window.localStorage.getItem(SKIN_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function persistSkin(skin: PageSkin): void {
  try {
    window.localStorage.setItem(SKIN_KEY, skin);
    window.localStorage.setItem(LEGACY_KEY, skin);
  } catch {
    /* storage blocked — the skin lasts for this visit */
  }
  /* Every page that changes the skin also marks the shell, so the <html> and
     <body> backgrounds follow the choice on scroll and on reload. */
  applySkinShell(skin);
}

/**
 * Marks the page shell itself, not just the React tree: the browser paints the
 * <html> and <body> backgrounds before React mounts, and the dark body is what
 * made the pale theme flash on load.
 */
export function applySkinShell(skin: PageSkin): void {
  if (typeof document === 'undefined') return;
  const light = skin === 'light';
  document.documentElement.dataset.skin = skin;
  document.documentElement.classList.toggle('skin-light', light);
  document.body?.classList.toggle('home-light', light);
}

/** Runs once before the first render, so the chosen skin is already painted. */
export function bootStoredSkin(): PageSkin {
  const skin = readSkin();
  applySkinShell(skin);
  return skin;
}