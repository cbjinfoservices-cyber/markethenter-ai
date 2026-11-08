/** La trace d'envoi des colonnes « produit sourcé » du comparatif.
 *
 * Les scénarios du tableau de bord gardent leur date dans le journal dédié ;
 * une colonne produit n'a pas de scénario, seulement une clé de produit. On
 * garde donc ici le moment où son e-mail bilingue est parti, pour que la
 * feuille imprimée sache quelles colonnes n'ont jamais reçu de message.
 *
 * Stockage local uniquement (un horodatage par produit), partagé entre les
 * onglets par un événement.
 */

export type ProductMailLog = Record<string, number>;

const STORAGE_KEY = 'mh:src:productMail';

export const PRODUCT_MAIL_EVENT = 'mh:src:productMail';

export function loadProductMail(): ProductMailLog {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ProductMailLog = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const stamp = Number(value);
      if (Number.isFinite(stamp) && stamp > 0) out[key] = stamp;
    });
    return out;
  } catch {
    return {};
  }
}

/** Note l'envoi d'une colonne produit à l'instant et renvoie le journal. */
export function recordProductMail(key: string): ProductMailLog {
  const log = loadProductMail();
  const next: ProductMailLog = { ...log, [key]: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PRODUCT_MAIL_EVENT));
  } catch {
    /* stockage bloqué : la date reste valable pour cette session */
  }
  return next;
}

/** Repartir d'un suivi propre sur les colonnes produit. */
export function clearProductMail(): ProductMailLog {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(PRODUCT_MAIL_EVENT));
  } catch {
    /* stockage bloqué : rien à effacer */
  }
  return {};
}

/** Oublier la date d'une seule colonne, sans toucher aux autres. */
export function clearProductMailOne(key: string): ProductMailLog {
  const log = loadProductMail();
  if (log[key] === undefined) return log;
  const next: ProductMailLog = { ...log };
  delete next[key];
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    window.dispatchEvent(new Event(PRODUCT_MAIL_EVENT));
  } catch {
    /* stockage bloqué : la date reste pour cette session */
  }
  return next;
}