import type {
  ImportedView,
  ViewFilter,
  ViewOrder,
  ViewOrderPin,
  ViewSort,
} from '@/pages/suppliers/savedViews';

/** Relire un fichier de vues exporté depuis ce carnet : le titre du fichier,
 *  l'en-tête des colonnes, puis une ligne par pastille. Les virgules et les
 *  points-virgules passent tous les deux, et les libellés traduits — comme
 *  les clés brutes — retrouvent leur réglage. */

type Parsed = {
  views: ImportedView[];
  /** Combien de lignes ont été lues au total, titre et en-tête compris. */
  rows: number;
};

/** Minuscules, sans accents : « Délai » et « delai » se comparent pareil. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  /* Le séparateur se lit sur la première ligne qui en porte un : le titre
     du fichier, lui, n'en a aucun. Excel et Numbers réenregistrent
     volontiers en virgules, on accepte les deux. */
  const separatorLine = clean
    .split(/\r?\n/)
    .find((line) => line.includes(';') || line.includes(',')) ?? '';
  const semis = (separatorLine.match(/;/g) ?? []).length;
  const commas = (separatorLine.match(/,/g) ?? []).length;
  const sep = semis > 0 || commas === 0 ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"') {
        if (clean[index + 1] === '"') {
          cell += '"';
          index += 1;
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
      continue;
    }
    if (char === sep) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.length > 1 || row[0].trim() !== '') rows.push(row);
  return rows;
}

const NAME_HEAD = ['vue', 'view', 'vues', 'views', 'nom', 'name'];

function isNameHead(cell: string): boolean {
  return NAME_HEAD.includes(normalize(cell));
}

function findColumn(header: string[], words: string[], fallback: number): number {
  const found = header.findIndex((cell) => {
    const clean = normalize(cell);
    return words.some((word) => clean.includes(word));
  });
  return found >= 0 ? found : fallback;
}

/** « pays », « Country », « country » : le tri par pays. */
function readSort(raw: string): ViewSort {
  const clean = normalize(raw);
  if (clean === '' ) return 'name';
  if (clean.includes('pays') || clean.includes('country')) return 'country';
  if (clean.includes('delai') || clean.includes('lead')) return 'lead';
  if (clean.includes('nom') || clean.includes('name')) return 'name';
  return 'name';
}

/** « Relance due », « due », « À faire », « sans fiche »… */
function readFilter(raw: string): ViewFilter {
  const clean = normalize(raw);
  if (clean === '') return 'all';
  if (clean.includes('due') || clean.includes('relance')) return 'due';
  if (clean.includes('faire') || clean.includes('todo') || clean.includes('complete')) return 'todo';
  if (clean.includes('sans') || clean.includes('unlink') || clean.includes('link')) return 'unlinked';
  return 'all';
}

function readLead(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(400, value);
}

/** « 12 », « 12 rappels », « x12 » : le compte de rappels lu tel quel. */
function readRecalls(raw: string): number {
  const value = Number(raw.replace(/[^\d]/g, ''));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(9999, Math.round(value));
}

/** La date du dernier rappel, dans le format écrit par l'export (ISO), ou
 *  dans celui qu'un tableur lui donne (jj/mm/aaaa hh:mm). */
function readDate(raw: string): number {
  const value = raw.trim();
  if (value === '') return 0;
  const iso = Date.parse(value);
  if (Number.isFinite(iso)) return iso;
  const spaced = Date.parse(value.replace(' ', 'T'));
  if (Number.isFinite(spaced)) return spaced;
  const match = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:[ T](\d{1,2})[:h](\d{2}))?/);
  if (!match) return 0;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const stamp = new Date(
    year,
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  ).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

/** « oui », « yes », « 1 » : la pastille était épinglée. */
function readPinned(raw: string): boolean {
  const clean = normalize(raw);
  if (clean === '') return false;
  return (
    clean.startsWith('oui') ||
    clean.startsWith('yes') ||
    clean === '1' ||
    clean === 'true' ||
    clean === 'x' ||
    clean.startsWith('epingl')
  );
}

/** Le rang d'épinglage, 0 quand la colonne est vide ou la vue détachée. */
function readPinRank(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(99, Math.round(value));
}

/** Une valeur de tri lue dans un JSON : seule une clé connue passe. */
function asSort(raw: unknown): ViewSort {
  return raw === 'country' || raw === 'lead' || raw === 'name' ? raw : 'name';
}

/** Un filtre lu dans un JSON : seule une clé connue passe. */
function asFilter(raw: unknown): ViewFilter {
  return raw === 'due' || raw === 'todo' || raw === 'unlinked' ? raw : 'all';
}

function asNumber(raw: unknown, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.round(value));
}

/** LE FICHIER JSON — les réglages bruts, relus tels quels. Aucune traduction,
 *  aucun tableur : l'aller-retour rend exactement la même rangée. */
export type ParsedJson = {
  views: ImportedView[];
  /** L'ordre d'affichage que le fichier portait, null s'il n'en portait pas. */
  order: ViewOrder | null;
  /** L'épingleage dans le tri, null quand le fichier ne le disait pas. */
  orderPin: ViewOrderPin | null;
};

/** Une pastille lue dans un fichier JSON : nom, réglages, usage et
 *  épinglage. La sauvegarde complète du carnet passe aussi par ici, c'est ce
 *  qui garantit que les deux fichiers se relisent pareil. */
export function readJsonView(entry: unknown): ImportedView | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (name === '') return null;
  const lastUsedAt = Number(row.lastUsedAt);
  return {
    name,
    lead: asNumber(row.lead, 400),
    sort: asSort(row.sort),
    filter: asFilter(row.filter),
    recalls: asNumber(row.recalls, 9999),
    lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : 0,
    /* Un fichier JSON dit toujours l'usage et l'épinglage : c'est son but. */
    hasUsage: true,
    pinned: row.pinned === true,
    pinRank: row.pinned === true ? asNumber(row.pinRank, 99) : 0,
    hasPin: true,
  };
}

export function parseViewsJson(text: string): ParsedJson {
  const empty: ParsedJson = { views: [], order: null, orderPin: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;
  const root = parsed as Record<string, unknown>;
  /* Un fichier d'un autre genre ne doit pas écraser la rangée en silence. */
  if (root.kind !== undefined && root.kind !== 'supplier-views') return empty;
  const rawList = root.views;
  if (!Array.isArray(rawList)) return empty;

  const views: ImportedView[] = [];
  const seen = new Set<string>();
  rawList.forEach((entry) => {
    const view = readJsonView(entry);
    if (!view) return;
    const key = view.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    views.push(view);
  });

  const order = root.order === 'used' || root.order === 'saved' ? root.order : null;
  const orderPin =
    root.orderPin === 'ignore' || root.orderPin === 'top' ? root.orderPin : null;
  return { views, order, orderPin };
}

export function parseViewsCsv(text: string): Parsed {
  const rows = parseRows(text);
  if (rows.length === 0) return { views: [], rows: 0 };

  const headerIndex = rows.findIndex(
    (row) => row.length >= 2 && isNameHead(row[0] ?? ''),
  );

  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const nameAt = headerIndex >= 0 ? Math.max(0, header.findIndex(isNameHead)) : 0;
  const leadAt = headerIndex >= 0
    ? findColumn(header, ['seuil', 'threshold', 'lead', 'delai'], 1)
    : 1;
  const sortAt = headerIndex >= 0 ? findColumn(header, ['tri', 'sort'], 2) : 2;
  const filterAt = headerIndex >= 0 ? findColumn(header, ['filtre', 'filter'], 3) : 3;
  const recallsAt = headerIndex >= 0
    ? findColumn(header, ['rappels', 'recalls'], 6)
    : 6;
  const lastUsedAt = headerIndex >= 0
    ? findColumn(header, ['derniere', 'last'], 7)
    : 7;
  const pinAt = headerIndex >= 0 ? findColumn(header, ['epingl', 'pin'], 8) : 8;
  const rankAt = headerIndex >= 0 ? findColumn(header, ['rang', 'rank'], 9) : 9;
  /* L'épinglage et le rang existent-ils dans le fichier ? Un export antérieur
     ne les portait pas : il ne détache alors aucune pastille déjà épinglée. */
  const hasPin =
    headerIndex >= 0 &&
    header.some((cell) => {
      const clean = normalize(cell);
      return (
        clean.includes('epingl') ||
        clean.includes('pin') ||
        clean.includes('rang') ||
        clean.includes('rank')
      );
    });
  /* Les deux colonnes d'usage existent-elles dans le fichier ? Un export
     antérieur ne les portait pas. */
  const hasUsage =
    headerIndex >= 0 &&
    header.some((cell) => {
      const clean = normalize(cell);
      return (
        clean.includes('rappels') ||
        clean.includes('recalls') ||
        clean.includes('derniere') ||
        clean.includes('last')
      );
    });

  const views: ImportedView[] = [];
  const seen = new Set<string>();
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;

  rows.slice(start).forEach((row) => {
    const name = (row[nameAt] ?? '').trim();
    if (name === '') return;
    const key = name.toLowerCase();
    /* Deux fois le même nom dans le fichier : la dernière ligne gagne. */
    if (seen.has(key)) return;
    seen.add(key);
    views.push({
      name,
      lead: readLead(row[leadAt] ?? ''),
      sort: readSort(row[sortAt] ?? ''),
      filter: readFilter(row[filterAt] ?? ''),
      recalls: readRecalls(row[recallsAt] ?? ''),
      lastUsedAt: readDate(row[lastUsedAt] ?? ''),
      hasUsage,
      pinned: readPinned(row[pinAt] ?? ''),
      pinRank: readPinRank(row[rankAt] ?? ''),
      hasPin,
    });
  });

  return { views, rows: rows.length };
}