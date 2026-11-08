/** LES TROIS DERNIÈRES RESTAURATIONS — le nom du fichier relu, l'instant où
 *  le carnet a été reposé et combien de fiches sont revenues. Gardées pour
 *  les afficher sous les boutons, de la plus récente à la plus ancienne. */

const STORAGE_KEY = 'mh:suppliers:restoreLog';
/** L'ancienne note unique, relue une fois pour ne rien perdre. */
const LEGACY_KEY = 'mh:suppliers:lastRestore';
/** Trois lignes suffisent : au-delà, on ne lit plus l'historique. */
export const RESTORE_LOG_SIZE = 3;

export type RestoreRecord = {
  /** Le nom du fichier tel qu'il a été choisi. */
  file: string;
  /** L'instant de la restauration, en millisecondes. */
  at: number;
  /** Les fiches réellement reposées : nouvelles et mises à jour. */
  count: number;
  /** Les pastilles réellement reposées : ajoutées et mises à jour. */
  views: number;
};

/** Un compte de pastilles : la valeur ancienne, qui ne le connaissait pas,
 *  retombe sur zéro sans casser la ligne. */
function asCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function asRecord(raw: unknown): RestoreRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const file = typeof row.file === 'string' ? row.file.trim() : '';
  const at = Number(row.at);
  if (file === '' || !Number.isFinite(at) || at <= 0) return null;
  return {
    file,
    at,
    count: asCount(row.count),
    views: asCount(row.views),
  };
}

/** Les trois dernières restaurations, la plus récente en tête. */
export function readRestoreLog(): RestoreRecord[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const list: RestoreRecord[] = [];
        parsed.forEach((entry) => {
          const record = asRecord(entry);
          if (record) list.push(record);
        });
        if (list.length > 0) return list.slice(0, RESTORE_LOG_SIZE);
      }
    }
    /* Un carnet reposé avant cet historique : sa note unique devient la
       première ligne, sans compter les fiches qu'elle ne connaissait pas. */
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy === null) return [];
    const record = asRecord({ ...(JSON.parse(legacy) as Record<string, unknown>), count: 0 });
    return record ? [record] : [];

  } catch {
    return [];
  }
}

/** Noter une restauration : elle passe en tête, les plus anciennes sortent.
 *  Les fiches et les pastilles reposées sont comptées séparément. */
export function noteRestore(file: string, count: number, views = 0): RestoreRecord[] {
  const name = file.trim();
  if (name === '') return readRestoreLog();
  const record: RestoreRecord = {
    file: name,
    at: Date.now(),
    count: asCount(count),
    views: asCount(views),
  };
  const list = [record, ...readRestoreLog()].slice(0, RESTORE_LOG_SIZE);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* stockage bloqué : l'historique vaut pour cette visite */
  }
  return list;
}

/** VIDER L'HISTORIQUE — on ne garde plus la trace des vieux fichiers.
 *  Le carnet lui-même n'est pas touché : seuls les noms relus s'effacent. */
export function clearRestoreLog(): RestoreRecord[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* stockage bloqué : rien à effacer */
  }
  return [];
}

/** RETIRER UNE SEULE LIGNE — l'instant de la restauration sert de repère :
 *  la ligne choisie part, les deux autres restent exactement en place.
 *  Le carnet et ses pastilles ne bougent pas d'un pouce. */
export function removeRestore(at: number): RestoreRecord[] {
  const kept = readRestoreLog().filter((record) => record.at !== at);
  try {
    if (kept.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* stockage bloqué : l'historique vaut pour cette visite */
  }
  return kept;
}