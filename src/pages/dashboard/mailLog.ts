/** La date du dernier e-mail copié, scénario par scénario et fournisseur par
 * fournisseur.
 *
 * Une carte peut porter deux devis : on garde donc l'horodatage par couple
 * (scénario, devis), pour voir d'un coup d'œil quel contact a déjà reçu son
 * message — et lequel attend encore.
 *
 * Stockage local uniquement (un horodatage, rien de sensible), partagé entre
 * les onglets par un événement pour que les cartes se mettent à jour sans
 * recharger la page.
 */

export type MailSide = 'a' | 'b';

export type MailLog = Record<string, number>;

const STORAGE_KEY = 'mh:dash:mailLog';

export const MAIL_LOG_EVENT = 'mh:dash:mailLog';

/** Clé de mémorisation d'un couple scénario / devis. */
export function mailKey(scenarioId: number, side: MailSide): string {
  return `s${scenarioId}:${side}`;
}

export function loadMailLog(): MailLog {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MailLog = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const stamp = Number(value);
      if (Number.isFinite(stamp) && stamp > 0) out[key] = stamp;
    });
    return out;
  } catch {
    return {};
  }
}

/** Note l'envoi à l'instant et renvoie le journal à jour. */
export function recordMailCopy(scenarioId: number, side: MailSide): MailLog {
  const log = loadMailLog();
  const next: MailLog = { ...log, [mailKey(scenarioId, side)]: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(MAIL_LOG_EVENT));
  } catch {
    /* stockage bloqué : la date reste valable pour cette session */
  }
  return next;
}

/** Repartir d'un suivi propre : toutes les dates d'envoi s'effacent d'un coup,
 * une fois la négociation terminée. Les cartes se remettent à jour sans
 * recharger la page.
 */
export function clearMailLog(): MailLog {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(MAIL_LOG_EVENT));
  } catch {
    /* stockage bloqué : rien à effacer */
  }
  return {};
}

export function clearMailCopy(scenarioId: number, side: MailSide): MailLog {
  const log = loadMailLog();
  delete log[mailKey(scenarioId, side)];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    window.dispatchEvent(new Event(MAIL_LOG_EVENT));
  } catch {
    /* stockage bloqué : rien à effacer */
  }
  return log;
}