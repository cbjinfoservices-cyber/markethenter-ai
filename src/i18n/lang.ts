export const LANG_STORAGE_KEY = 'markethunter.lang';

export const SUPPORTED_LANGS = ['fr', 'en'] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

export function normalizeLang(value?: string | null): Lang | null {
  if (!value) return null;
  const short = value.slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGS as readonly string[]).includes(short) ? (short as Lang) : null;
}

export function readSavedLang(): Lang | null {
  try {
    return normalizeLang(window.localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLang(value: string): void {
  const lang = normalizeLang(value);
  if (!lang) return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage blocked, keep the session value only */
  }
}