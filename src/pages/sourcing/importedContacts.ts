/** Les adresses qui sont arrivées par le fichier de travail, et quand.
 *
 * Le comparatif distingue une adresse tapée à la main d'une adresse ramenée par
 * le CSV complété : la fiche porte alors un petit badge « importé le … ». On ne
 * garde qu'un horodatage par colonne, pour ne jamais toucher au contact lui-même.
 *
 * Stockage local, partagé entre les onglets par un événement — et effacé dès que
 * la colonne est vidée, pour repartir d'une fiche propre.
 *
 * À côté des badges vit un journal des réimports : une ligne par fiche remplie,
 * avec sa date, son nom et l'adresse reçue. Il survit volontairement à
 * l'effacement des traces, pour pouvoir être téléchargé avant ou après.
 */

import { useEffect, useState } from 'react';

export type ImportedContacts = Record<string, number>;

/** Une fiche remplie par le fichier, telle qu'elle était au moment du réimport. */
export type ImportedLogEntry = {
  key: string;
  at: number;
  name: string;
  email: string;
};

const STORAGE_KEY = 'mh:src:importedContacts';
const LOG_KEY = 'mh:src:importedLog';
/** Le journal garde les derniers réimports : au-delà, les plus anciens sortent. */
const LOG_MAX = 200;

export const IMPORTED_CONTACTS_EVENT = 'mh:src:importedContacts';

export function loadImportedContacts(): ImportedContacts {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ImportedContacts = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const stamp = Number(value);
      if (Number.isFinite(stamp) && stamp > 0) out[key] = stamp;
    });
    return out;
  } catch {
    return {};
  }
}

/** Le journal des réimports, du plus récent au plus ancien. */
export function loadImportedLog(): ImportedLogEntry[] {
  try {
    const stored = window.localStorage.getItem(LOG_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((raw): ImportedLogEntry | null => {
        if (!raw || typeof raw !== 'object') return null;
        const entry = raw as Record<string, unknown>;
        const key = typeof entry.key === 'string' ? entry.key : '';
        const at = Number(entry.at);
        if (key === '' || !Number.isFinite(at) || at <= 0) return null;
        return {
          key,
          at,
          name: typeof entry.name === 'string' ? entry.name : '',
          email: typeof entry.email === 'string' ? entry.email : '',
        };
      })
      .filter((entry): entry is ImportedLogEntry => entry !== null)
      .sort((a, b) => b.at - a.at)
      .slice(0, LOG_MAX);
  } catch {
    return [];
  }
}

function writeLog(entries: ImportedLogEntry[]): ImportedLogEntry[] {
  try {
    if (entries.length === 0) window.localStorage.removeItem(LOG_KEY);
    else window.localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, LOG_MAX)));
    window.dispatchEvent(new Event(IMPORTED_CONTACTS_EVENT));
  } catch {
    /* stockage bloqué : le journal reste valable pour cette session */
  }
  return entries;
}

function write(next: ImportedContacts): ImportedContacts {
  try {
    if (Object.keys(next).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(IMPORTED_CONTACTS_EVENT));
  } catch {
    /* stockage bloqué : le badge reste valable pour cette session */
  }
  return next;
}

/** Note l'arrivée du fichier sur les fiches qu'il vient de remplir.
 *
 * `details` porte le nom de la fiche et l'adresse reçue, pour que le journal
 * des réimports reste lisible même une fois les traces effacées.
 */
export function recordImportedContacts(
  keys: string[],
  stamp = Date.now(),
  details: Record<string, { name: string; email: string }> = {},
): ImportedContacts {
  const next: ImportedContacts = { ...loadImportedContacts() };
  const fresh: ImportedLogEntry[] = [];
  keys.forEach((key) => {
    if (key.trim() === '') return;
    next[key] = stamp;
    const detail = details[key];
    fresh.push({
      key,
      at: stamp,
      name: (detail?.name ?? '').trim(),
      email: (detail?.email ?? '').trim(),
    });
  });
  if (fresh.length > 0) {
    /* Même fiche réimportée : la dernière ligne remplace l'ancienne. */
    const kept = loadImportedLog().filter(
      (entry) => !fresh.some((item) => item.key === entry.key),
    );
    writeLog([...fresh, ...kept].slice(0, LOG_MAX));
  }
  return write(next);
}

/** La fiche est vidée : le badge d'import n'a plus de raison d'être. */
export function forgetImportedContact(key: string): ImportedContacts {
  const current = loadImportedContacts();
  if (current[key] === undefined) return current;
  const next: ImportedContacts = { ...current };
  delete next[key];
  return write(next);
}

/** La négociation est terminée : on repart de fiches sans badge.
 *
 * Seules les traces d'import s'en vont — les adresses, elles, restent dans les
 * fiches : c'est bien la provenance qu'on efface, pas le contact. Le journal
 * des réimports est conservé : il raconte ce qui s'est passé, pas ce qui reste.
 */
export function clearImportedContacts(): ImportedContacts {
  return write({});
}

/** L'annexe est archivée : on repart d'un journal vide.
 *
 * Les badges et les adresses ne bougent pas — seule la mémoire des réimports
 * s'efface, pour que la feuille imprimée reparte sans annexe.
 */
export function clearImportedLog(): ImportedLogEntry[] {
  return writeLog([]);
}

/** Compteur vivant : il suit chaque réimport et chaque fiche vidée. */
export function useImportedContacts(): ImportedContacts {
  const [map, setMap] = useState<ImportedContacts>(() => loadImportedContacts());

  useEffect(() => {
    const sync = () => setMap(loadImportedContacts());
    window.addEventListener(IMPORTED_CONTACTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(IMPORTED_CONTACTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return map;
}

/** Le journal des réimports, tenu à jour comme les badges. */
export function useImportedLog(): ImportedLogEntry[] {
  const [log, setLog] = useState<ImportedLogEntry[]>(() => loadImportedLog());

  useEffect(() => {
    const sync = () => setLog(loadImportedLog());
    window.addEventListener(IMPORTED_CONTACTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(IMPORTED_CONTACTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return log;
}

/** Combien de réimports ont eu lieu aujourd'hui, en heure locale.
 *
 * Une fiche réimportée deux fois le même jour ne compte qu'une ligne dans le
 * journal, donc ce compteur suit le nombre de fiches remplies aujourd'hui.
 */
export function countImportedToday(log: ImportedLogEntry[], now = Date.now()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  return log.filter((entry) => entry.at >= from && entry.at <= now).length;
}

/** Le compteur du jour, tenu à jour comme les badges. */
export function useImportedTodayCount(): number {
  const log = useImportedLog();
  return countImportedToday(log);
}

/** Combien de réimports depuis le lundi 00:00 de la semaine en cours.
 *
 * Même journal que le compteur du jour, mais sur sept jours : il montre la
 * cadence — un fichier qui tourne une fois par semaine ou tous les matins.
 */
export function countImportedThisWeek(log: ImportedLogEntry[], now = Date.now()): number {
  const start = new Date(now);
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - sinceMonday);
  const from = start.getTime();
  return log.filter((entry) => entry.at >= from && entry.at <= now).length;
}

/** Le compteur de la semaine, tenu à jour comme les badges. */
export function useImportedWeekCount(): number {
  const log = useImportedLog();
  return countImportedThisWeek(log);
}

/** Combien de fiches portent encore la trace du fichier de travail. */
export function useImportedTraceCount(): number {
  const map = useImportedContacts();
  return Object.keys(map).length;
}