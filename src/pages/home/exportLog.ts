/** Le dernier fichier exporté depuis le calculateur.
 *
 * On garde son nom et l'heure du téléchargement : le vendeur sait d'un coup
 * d'œil ce qui est déjà parti chez le fournisseur, et sous quel nom.
 *
 * Stockage local uniquement (nom + horodatage, rien de sensible), avec un
 * événement pour que toutes les zones du calculateur se mettent à jour sans
 * recharger la page.
 */

export type LastExport = { name: string; at: number };

const STORAGE_KEY = 'mh:calc:lastExport';

export const EXPORT_EVENT = 'mh:calc:lastExport';

export function recordExport(name: string): void {
  const clean = name.trim();
  if (clean === '') return;
  try {
    const entry: LastExport = { name: clean, at: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    window.dispatchEvent(new Event(EXPORT_EVENT));
  } catch {
    /* stockage bloqué : le rappel reste simplement absent */
  }
}

export function clearLastExport(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EXPORT_EVENT));
  } catch {
    /* stockage bloqué : rien à effacer */
  }
}

export function loadLastExport(): LastExport | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<LastExport>;
    if (typeof parsed.name !== 'string' || typeof parsed.at !== 'number') return null;
    if (parsed.name.trim() === '' || !Number.isFinite(parsed.at)) return null;
    return { name: parsed.name, at: parsed.at };
  } catch {
    return null;
  }
}