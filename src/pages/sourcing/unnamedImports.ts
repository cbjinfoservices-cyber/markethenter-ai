/** Les fiches importées qui attendent encore leur nom de fournisseur.
 *
 * Le nom d'un fournisseur se saisit sur la fiche du calculateur, pas dans le
 * journal : on ne compte donc que les lignes rattachées à un scénario, celles
 * qu'on peut réellement baptiser. Le compteur suit à la fois le journal des
 * réimports et les noms enregistrés, pour retomber à zéro dès qu'un nom est
 * tapé — sans recharger la page.
 */

import { useEffect, useState } from 'react';
import { useImportedLog } from '@/pages/sourcing/importedContacts';
import type { ImportedLogEntry } from '@/pages/sourcing/importedContacts';
import {
  scenarioIdOfLogKey,
  supplierNameOfLogEntry,
} from '@/pages/dashboard/importLogCsv';
import { daysSinceImport } from '@/pages/dashboard/unnamedImport';
import { SUPPLIER_NAMES_EVENT, loadSupplierNames } from '@/pages/home/priceHistory';

/** Les lignes du journal encore anonymes, la plus récente d'abord. */
export function unnamedImportsOf(
  log: ImportedLogEntry[],
  names: Record<string, string>,
): ImportedLogEntry[] {
  return log.filter(
    (entry) =>
      scenarioIdOfLogKey(entry.key) !== null &&
      supplierNameOfLogEntry(entry.key, names).trim() === '',
  );
}

/** Une fiche anonyme, prête à être listée hors du tableau de bord. */
export type UnnamedSheet = {
  /** Le numéro de scénario, pour ouvrir la fiche du calculateur. */
  id: number;
  /** Le nom de la fiche au moment du réimport, quand il était rempli. */
  name: string;
  /** La date de ce réimport. */
  at: number;
  /** Combien de jours entiers depuis ce réimport — l'âge affiché. */
  days: number | null;
};

export type UnnamedImports = {
  /** Combien de fiches importées n'ont pas encore de fournisseur nommé. */
  count: number;
  /** La plus récente, pour ouvrir directement la bonne fiche. */
  first: ImportedLogEntry | null;
  /** Son numéro de scénario, pour la fiche du calculateur. */
  firstId: number | null;
  /** Tous les numéros de scénario concernés, pour filtrer une liste. */
  ids: number[];
  /** Les trois premières fiches, une par une, pour le panneau du burger. */
  head: UnnamedSheet[];
  /** L'âge de la plus ancienne : la pastille passe au rouge au-delà de dix jours. */
  oldestDays: number | null;
  /** La somme des jours d'attente de toutes les fiches : le retard cumulé. */
  totalDays: number;
};

/** Compteur vivant : il suit chaque réimport et chaque nom saisi. */
export function useUnnamedImports(): UnnamedImports {
  const log = useImportedLog();
  const [names, setNames] = useState<Record<string, string>>(() => loadSupplierNames());

  useEffect(() => {
    const sync = () => setNames(loadSupplierNames());
    window.addEventListener(SUPPLIER_NAMES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SUPPLIER_NAMES_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const list = unnamedImportsOf(log, names);
  const first = list[0] ?? null;
  /* Une même fiche peut apparaître sous deux clés dans le journal : on ne la
     compte qu'une fois, sinon la liste filtrée afficherait un doublon. */
  const seen = new Set<number>();
  const unique: UnnamedSheet[] = [];
  list.forEach((entry) => {
    const id = scenarioIdOfLogKey(entry.key);
    if (id === null || seen.has(id)) return;
    seen.add(id);
    unique.push({
      id,
      name: entry.name.trim(),
      at: entry.at,
      days: daysSinceImport(entry.at),
    });
  });
  /* Le panneau du burger range les trois fiches par âge, la plus ancienne en
     tête : celle qui traîne se traite avant celle de ce matin. Une fiche sans
     date connue ferme la marche. */
  const byAge = [...unique].sort((a, b) => {
    if (a.days === null && b.days === null) return 0;
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return b.days - a.days;
  });
  const oldestDays = unique.reduce<number | null>(
    (oldest, item) =>
      item.days === null ? oldest : oldest === null ? item.days : Math.max(oldest, item.days),
    null,
  );
  /* Le retard cumulé : la somme des jours d'attente de toutes les fiches. Il
     baisse quand on baptise, il monte quand le fichier revient sans nom —
     c'est la seule mesure qui dit si la pile se résorbe vraiment. */
  const totalDays = unique.reduce((sum, item) => sum + (item.days ?? 0), 0);
  return {
    count: unique.length,
    first,
    firstId: first ? scenarioIdOfLogKey(first.key) : null,
    ids: unique.map((item) => item.id),
    head: byAge.slice(0, 3),
    oldestDays,
    totalDays,
  };
}