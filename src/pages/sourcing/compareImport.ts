import { FIELD_KEYS, INITIAL } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { MARGIN_MARKER } from '@/pages/sourcing/compareCsv';

/**
 * Reads back a comparison CSV exported from the sourcing board, once the
 * supplier has reworked the purchase costs in a spreadsheet. The eleven input
 * columns are read positionally, exactly as they were written.
 */
export type ImportedCompareRow = { name: string; values: Values };

export type ImportedCompare = {
  rows: ImportedCompareRow[];
  skipped: number;
  /** Columns found in the file before the inputs — name, origin, category. */
  offset: number;
  /**
   * Margin floor the file was produced with, in percent. `null` when the file
   * carries no trace of it (older export, or a hand-made spreadsheet).
   */
  fileMargin: number | null;
};

/** Reads the stable footer cell carrying the export's margin floor. */
function readMarginMarker(rows: string[][]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const at = row.findIndex((cell) => cell.trim().toUpperCase() === MARGIN_MARKER);
    if (at === -1) continue;
    const value = toNumber(row[at + 1] ?? '');
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

const LEADING = 3;

function parseRows(text: string): string[][] {
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

const toNumber = (cell: string): number => {
  const cleaned = (cell ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

const looksLikeHeader = (row: string[]): boolean => {
  const probe = row.slice(LEADING, LEADING + FIELD_KEYS.length);
  return probe.some((cell) => cell.trim() !== '' && !Number.isFinite(toNumber(cell)));
};

export type ImportedCompareResult =
  | { ok: true; data: ImportedCompare }
  | { ok: false; reason: 'empty' | 'unreadable' };

/**
 * Parses the file and keeps every row whose input columns are real numbers.
 * Name, origin and category are skipped, so a retouched file still works even
 * when the supplier renamed a column.
 */
export function parseCompareCsv(text: string): ImportedCompareResult {
  if (!text.trim()) return { ok: false, reason: 'empty' };
  const rows = parseRows(text);
  if (rows.length === 0) return { ok: false, reason: 'unreadable' };

  const width = LEADING + FIELD_KEYS.length;
  const start = looksLikeHeader(rows[0]) ? 1 : 0;
  const kept: ImportedCompareRow[] = [];
  let skipped = 0;
  const fileMargin = readMarginMarker(rows);

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    /* The trace row at the foot of the file is not a product line. */
    if (row.some((cell) => cell.trim().toUpperCase() === MARGIN_MARKER)) continue;
    if (row.length < width) {
      skipped += 1;
      continue;
    }
    const values: Values = { ...INITIAL };
    let valid = true;
    for (let j = 0; j < FIELD_KEYS.length; j += 1) {
      const value = toNumber(row[LEADING + j]);
      if (!Number.isFinite(value) || value < 0) {
        valid = false;
        break;
      }
      values[FIELD_KEYS[j]] = String(Math.round(value * 10000) / 10000);
    }
    if (!valid) {
      skipped += 1;
      continue;
    }
    const name = (row[0] ?? '').replace(/\s+/g, ' ').trim();
    kept.push({ name: name.slice(0, 60), values });
  }

  if (kept.length === 0) return { ok: false, reason: 'unreadable' };
  return { ok: true, data: { rows: kept, skipped, offset: LEADING, fileMargin } };
}