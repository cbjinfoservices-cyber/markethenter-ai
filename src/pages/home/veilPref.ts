/* L'intensité du voile posé sur les sections photographiques de la page
   d'accueil en thème clair. Un seul réglage, partagé par les quatre photos :
   plus il monte, plus le texte reprend le dessus sur l'image. */
export const VEIL_MIN = 45;
export const VEIL_MAX = 88;
export const VEIL_STEP = 1;
export const VEIL_DEFAULT = 66;

const VEIL_KEY = 'mh:veil';

export function clampVeil(value: number): number {
  if (!Number.isFinite(value)) return VEIL_DEFAULT;
  return Math.min(VEIL_MAX, Math.max(VEIL_MIN, Math.round(value)));
}

export function readVeil(): number {
  try {
    const raw = window.localStorage.getItem(VEIL_KEY);
    if (!raw) return VEIL_DEFAULT;
    return clampVeil(Number(raw));
  } catch {
    return VEIL_DEFAULT;
  }
}

export function persistVeil(value: number): void {
  try {
    window.localStorage.setItem(VEIL_KEY, String(clampVeil(value)));
  } catch {
    /* stockage bloqué — le réglage vaut pour cette visite */
  }
}

/** La valeur prête à être lue par les styles du thème clair. */
export function veilCssValue(value: number): string {
  return `${clampVeil(value)}%`;
}