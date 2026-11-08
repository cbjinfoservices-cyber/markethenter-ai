/** L'ordre choisi pour la liste « à baptiser » reste d'une session à l'autre.
 *
 * Le tri vit dans l'URL (`?filter=unnamed&sort=oldest`) pour être partagé et
 * survivre à un retour depuis le calculateur ; cette mémoire, elle, garde le
 * choix de la dernière visite pour que le même ordre revienne tout seul le
 * lendemain, sans avoir à recliquer sur le bouton.
 */

const SORT_KEY = 'mh.dash.unnamed.sort';

/** Fired when the remembered order changes — the list listens and follows. */
export const UNNAMED_SORT_EVENT = 'mh:dash:unnamed-sort';

export function rememberUnnamedSort(oldestFirst: boolean): void {
  try {
    window.localStorage.setItem(SORT_KEY, oldestFirst ? 'oldest' : 'recent');
    window.dispatchEvent(new Event(UNNAMED_SORT_EVENT));
  } catch {
    /* storage blocked — the order still holds in the URL */
  }
}

/** Vrai si la dernière visite triait les fiches les plus anciennes d'abord. */
export function readUnnamedSortOldest(): boolean {
  try {
    return window.localStorage.getItem(SORT_KEY) === 'oldest';
  } catch {
    return false;
  }
}