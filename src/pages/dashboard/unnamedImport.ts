/** Le fichier « à baptiser » revient rempli : les noms saisis dans Excel
 * rentrent d'un coup, sans rouvrir chaque fiche une par une.
 *
 * Le fichier exporté porte une colonne de référence (`S12`) qui ne bouge pas,
 * même si une fiche a été renommée entre-temps : la ligne retrouve donc sa
 * fiche au retour. Les colonnes sont lues à leur place, comme elles ont été
 * écrites — fiche, fournisseur, adresse — pour qu'un fichier retouché dans
 * Excel reste lisible.
 */

import {
  cleanEmail,
  loadSupplierEmails,
  loadSupplierNames,
  persistSupplierEmails,
  persistSupplierNames,
} from '@/pages/home/priceHistory';
import { noteBaptisedSheet } from '@/pages/home/baptiseLog';

export type UnnamedFill = {
  /** Le numéro de scénario de la fiche. */
  id: number;
  name: string;
  email: string;
};

export type UnnamedImportResult =
  | { ok: true; fills: UnnamedFill[]; refused: number }
  | { ok: false; reason: 'empty' | 'unreadable' };

/** La colonne du fournisseur, quand elle n'a pas encore été remplie. */
const PLACEHOLDERS = [
  'à baptiser',
  'a baptiser',
  'à nommer',
  'a nommer',
  'to be named',
  'to name',
  'unnamed',
  '—',
  '-',
];

/** La référence de la fiche dans la première colonne : `S12`, `s12`, `12`. */
const REF_PATTERN = /^(?:scenario-\s*)?s?\s*#?\s*(\d{1,9})$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_NAME = 28;

/** Lit un CSV avec le séparateur du fichier (`;` ou `,`), guillemets compris. */
function splitRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const semis = firstLine.split(';').length - 1;
  const commas = firstLine.split(',').length - 1;
  const separator = semis >= commas ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

/** La colonne qui porte la référence de la fiche, ou -1. */
function refIndex(row: string[]): number {
  const width = Math.min(row.length, 2);
  for (let i = 0; i < width; i += 1) {
    if (REF_PATTERN.test((row[i] ?? '').trim())) return i;
  }
  return -1;
}

/** La cellule du fournisseur est-elle encore la marque « à baptiser » ? */
function stillUnnamed(value: string): boolean {
  const clean = value.trim().toLowerCase();
  if (clean === '') return true;
  return PLACEHOLDERS.includes(clean);
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/**
 * Lit le fichier revenu d'Excel et garde les lignes dont le fournisseur a
 * réellement été nommé. Les autres — encore « à baptiser » ou vides — ne
 * comptent pas : elles restent dans la liste du tableau de bord.
 */
export function parseUnnamedCsv(text: string): UnnamedImportResult {
  if (!text.trim()) return { ok: false, reason: 'empty' };
  const rows = splitRows(text);
  if (rows.length === 0) return { ok: false, reason: 'unreadable' };

  const fills: UnnamedFill[] = [];
  const seen = new Set<number>();
  let refused = 0;

  rows.forEach((row) => {
    const at = refIndex(row);
    /* En-tête, ligne de garde ou fichier d'un autre type : rien à en tirer. */
    if (at === -1) return;
    const id = Number((row[at] ?? '').trim().replace(/\D/g, ''));
    if (!Number.isFinite(id) || id <= 0) {
      refused += 1;
      return;
    }
    const supplierCell = row[at + 2] ?? '';
    if (stillUnnamed(supplierCell)) return;
    const name = cleanName(supplierCell);
    if (name === '') return;

    const rawEmail = (row[at + 3] ?? '').trim();
    const email = EMAIL_PATTERN.test(rawEmail) ? cleanEmail(rawEmail) : '';

    /* Même fiche sur deux lignes : la première nommée gagne, pas de doublon. */
    if (seen.has(id)) return;
    seen.add(id);
    fills.push({ id, name, email });
  });

  if (fills.length === 0 && refused === 0) {
    return { ok: true, fills: [], refused: 0 };
  }
  return { ok: true, fills, refused };
}

/**
 * Écrit les noms ramenés par le fichier là où le calculateur les lit, et les
 * adresses à côté. Renvoie le nombre de fiches réellement baptisées.
 */
export function applyUnnamedFills(fills: UnnamedFill[]): number {
  if (fills.length === 0) return 0;
  const names = { ...loadSupplierNames() };
  const emails = { ...loadSupplierEmails() };
  let named = 0;

  fills.forEach((fill) => {
    if (fill.name !== '') {
      names[`s${fill.id}`] = fill.name;
      named += 1;
    }
    if (fill.email !== '') emails[`s${fill.id}`] = fill.email;
  });

  if (named > 0) persistSupplierNames(names);
  if (fills.some((fill) => fill.email !== '')) persistSupplierEmails(emails);
  /* Les fiches nommées par le fichier comptent pour aujourd'hui, comme si le
     nom avait été tapé sur la fiche. */
  fills.forEach((fill) => {
    if (fill.name !== '') noteBaptisedSheet(fill.id);
  });
  return named;
}

/** Combien de jours entiers depuis le dernier réimport d'une fiche. */
export function daysSinceImport(at: number | null, now = Date.now()): number | null {
  if (at === null || !Number.isFinite(at) || at <= 0) return null;
  const days = Math.floor((now - at) / 86400000);
  return days >= 0 ? days : 0;
}