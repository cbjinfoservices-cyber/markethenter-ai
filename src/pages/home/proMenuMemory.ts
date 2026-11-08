const LAST_PRO_KEY = 'mh.pro.last';

export type ProEntryId = 'calculator' | 'dashboard';

/** Fired when the remembered workspace entry changes. */
export const PRO_MEMORY_EVENT = 'mh:pro:last';

/** Remembers which workspace page the reader used last. */
export function rememberProEntry(id: ProEntryId): void {
  try {
    window.localStorage.setItem(LAST_PRO_KEY, id);
    window.dispatchEvent(new Event(PRO_MEMORY_EVENT));
  } catch {
    /* storage blocked — the menu still works, just without the marker */
  }
}

export function readProEntry(): string {
  try {
    return window.localStorage.getItem(LAST_PRO_KEY) || '';
  } catch {
    return '';
  }
}

export { LAST_PRO_KEY };