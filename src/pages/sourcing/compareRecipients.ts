/** Le destinataire d'une colonne « produit sourcé ».
 *
 * Les scénarios du tableau de bord portent déjà un nom et une adresse dans le
 * calculateur. Un produit sourcé, lui, n'en a aucun : on peut donc saisir ici le
 * contact du fournisseur, pour que le PDF du comparatif porte aussi son nom —
 * comme le font les feuilles du calculateur.
 *
 * Mémorisé dans le navigateur, produit par produit : la saisie revient à la
 * prochaine visite.
 */

export type CompareRecipient = { name: string; email: string };

export type RecipientMap = Record<string, CompareRecipient>;

const STORAGE_KEY = 'mh:sourcing:recipients';
/** Un contact vient d'être saisi : le compteur du menu se remet à jour. */
export const COMPARE_RECIPIENTS_EVENT = 'mh:sourcing:recipients';
const MAX_NAME = 60;
const MAX_EMAIL = 120;

export const EMPTY_RECIPIENT: CompareRecipient = { name: '', email: '' };

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Un contact vide n'est pas mémorisé : la mémoire ne garde que le utile. */
export function isEmptyRecipient(recipient: CompareRecipient): boolean {
  return recipient.name === '' && recipient.email === '';
}

export function readCompareRecipients(): RecipientMap {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: RecipientMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const source = value as { name?: unknown; email?: unknown };
      const recipient: CompareRecipient = {
        name: clean(source.name, MAX_NAME),
        email: clean(source.email, MAX_EMAIL),
      };
      if (isEmptyRecipient(recipient)) return;
      out[key] = recipient;
    });
    return out;
  } catch {
    return {};
  }
}

export function rememberCompareRecipients(map: RecipientMap): void {
  try {
    const kept: RecipientMap = {};
    Object.entries(map).forEach(([key, value]) => {
      if (!value || isEmptyRecipient(value)) return;
      kept[key] = {
        name: clean(value.name, MAX_NAME),
        email: clean(value.email, MAX_EMAIL),
      };
    });
    if (Object.keys(kept).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(COMPARE_RECIPIENTS_EVENT));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    window.dispatchEvent(new Event(COMPARE_RECIPIENTS_EVENT));
  } catch {
    /* stockage bloqué : la saisie reste valable pour cette session */
  }
}

/** Le contact d'une colonne, toujours utilisable même s'il n'a pas été saisi. */
export function recipientOf(map: RecipientMap, key: string): CompareRecipient {
  return map[key] ?? EMPTY_RECIPIENT;
}