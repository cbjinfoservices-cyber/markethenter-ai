/** Le journal des réimports, prêt à classer avec les devis.
 *
 * Une ligne par fiche remplie par le fichier de travail : la date du réimport,
 * le nom de la fiche et l'adresse reçue. Téléchargé avant (ou après) un
 * effacement des traces, il garde la mémoire de ce que le CSV a apporté.
 */

import { loadSupplierEmails, loadSupplierNames, SECOND_SUFFIX } from '@/pages/home/priceHistory';
import type { ImportedLogEntry } from '@/pages/sourcing/importedContacts';

type Translate = (key: string, options?: Record<string, string | number>) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const KEY_PATTERN = /^(?:scenario-)?s?(\d+)/;

function stampOf(stamp: number, locale: string): string {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Le numéro de scénario derrière une clé de fiche, s'il y en a un. */
export function scenarioIdOfLogKey(key: string): number | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Toutes les clés sous lesquelles un fournisseur peut être nommé.
 *
 * Une même fiche se nomme `s3`, `scenario-3` ou `s3:b` selon l'endroit qui
 * l'écrit : le journal doit retrouver le nom quelle que soit la forme.
 */
function supplierKeysOf(key: string): string[] {
  const keys = [key];
  if (key.endsWith(SECOND_SUFFIX)) keys.push(key.slice(0, -SECOND_SUFFIX.length));
  const id = scenarioIdOfLogKey(key);
  if (id !== null) {
    keys.push(`s${id}`, `scenario-${id}`, `s${id}${SECOND_SUFFIX}`);
  }
  return keys;
}

/** Le nom du fournisseur derrière une ligne du journal, tel qu'il a été saisi. */
export function supplierNameOfLogEntry(
  key: string,
  names: Record<string, string>,
): string {
  const keys = supplierKeysOf(key);
  for (let i = 0; i < keys.length; i += 1) {
    const typed = (names[keys[i]] ?? '').trim();
    if (typed !== '') return typed;
  }
  return '';
}

/**
 * Date, fiche et adresse, la plus récente en premier. L'adresse vient du journal
 * ; à défaut, elle est relue dans la fiche fournisseur (second devis compris).
 */
export function buildImportLogCsv(
  entries: ImportedLogEntry[],
  locale: string,
  t: Translate,
): string {
  const emails = loadSupplierEmails();
  const names = loadSupplierNames();
  const header = [
    t('home.dash.importLogWhen'),
    t('home.dash.importLogSheet'),
    t('home.dash.importLogSupplier'),
    t('home.dash.importLogEmail'),
  ];
  const lines = [header.map(escapeCell).join(';')];

  [...entries]
    .sort((a, b) => b.at - a.at)
    .forEach((entry) => {
      let email = entry.email.trim();
      if (email === '') {
        const id = scenarioIdOfLogKey(entry.key);
        if (id !== null) {
          email =
            (emails[`s${id}`] ?? '').trim() ||
            (emails[`s${id}${SECOND_SUFFIX}`] ?? '').trim();
        }
      }
      /* Une ligne dont le fournisseur n'a jamais été saisi sort marquée « à
         baptiser » : dans Excel, l'oubli se repère sans recouper la feuille. */
      const typedName = supplierNameOfLogEntry(entry.key, names).trim();
      const namable = scenarioIdOfLogKey(entry.key) !== null;
      const supplier =
        typedName !== ''
          ? typedName
          : namable
            ? t('home.sourcing.printLogSupplierMissing')
            : '';
      lines.push(
        [
          stampOf(entry.at, locale),
          entry.name.trim() === '' ? entry.key : entry.name.trim(),
          supplier,
          email,
        ]
          .map(escapeCell)
          .join(';'),
      );
    });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function importLogFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `markethunter-journal-reimports-${stamp}.csv`;
}