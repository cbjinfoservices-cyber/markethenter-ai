/** Le fichier de travail des contacts à compléter.
 *
 * Une ligne par fiche — colonne du comparatif ou scénario du tableau de bord —
 * avec l'adresse quand elle est connue, et un statut sans ambiguïté : « adresse
 * manquante » ou « jamais contacté ». Le fichier s'ouvre tel quel dans Excel :
 * la colonne adresse reste vide pour les fiches à compléter.
 *
 * Une fois rempli, le même fichier revient : `parseContactsCsv` relit le nom de
 * la fiche et l'adresse tapée, pour les remettre directement dans les fiches.
 */

export type ContactGapRow = {
  key: string;
  name: string;
  kind: 'product' | 'scenario';
  email: string;
  gap: 'no-email' | 'unwritten';
  /** Horodatage du dernier envoi, `null` quand rien n'est encore parti. */
  lastSent: number | null;
};

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function buildContactsCsv(
  rows: ContactGapRow[],
  locale: string,
  t: (key: string) => string,
): string {
  const when = (stamp: number | null): string => {
    if (stamp === null || !Number.isFinite(stamp)) return '';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(stamp));
  };

  const header = [
    t('home.sourcing.contactsCsvName'),
    t('home.sourcing.contactsCsvKind'),
    t('home.sourcing.contactsCsvEmail'),
    t('home.sourcing.contactsCsvStatus'),
    t('home.sourcing.contactsCsvLast'),
  ];

  const lines = [header.map(escapeCell).join(';')];

  rows.forEach((row) => {
    lines.push(
      [
        row.name,
        row.kind === 'product'
          ? t('home.sourcing.compareProductTag')
          : t('home.sourcing.compareScenarioTag'),
        row.email,
        row.gap === 'no-email'
          ? t('home.sourcing.contactsCsvGapNoEmail')
          : t('home.sourcing.contactsCsvGapUnwritten'),
        when(row.lastSent),
      ]
        .map(escapeCell)
        .join(';'),
    );
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function contactsCsvFilename(date = new Date()): string {
  return `markethunter-contacts-a-completer-${date.toISOString().slice(0, 10)}.csv`;
}

/** Le nom d'une fiche tel qu'il revient du tableur : casse et espaces ignorés. */
export function contactNameKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Une adresse lisible, ou rien : jamais un morceau de texte quelconque. */
const EMAIL_RE = /^[^\s@;,"]+@[^\s@;,"]+\.[^\s@;,"]{2,}$/;

const SEPARATORS = [';', ','];

function parseRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const semis = firstLine.split(';').length - 1;
  const commas = firstLine.split(',').length - 1;
  /* Excel français écrit des points-virgules ; on accepte les deux. */
  const separator = semis >= commas ? SEPARATORS[0] : SEPARATORS[1];

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

export type ImportedContact = { name: string; email: string };

/**
 * Relit le fichier de travail une fois complété : le nom de la fiche en
 * première colonne, l'adresse tapée en troisième. L'en-tête et les lignes
 * encore vides passent à la trappe en même temps.
 */
export function parseContactsCsv(text: string): ImportedContact[] {
  const out: ImportedContact[] = [];
  const seen = new Set<string>();

  parseRows(text).forEach((cells) => {
    const name = (cells[0] ?? '').trim();
    if (name === '') return;
    /* L'adresse vit en troisième colonne ; une feuille réduite à deux colonnes
       est lue quand même, tant que la seconde porte une vraie adresse. */
    const third = (cells[2] ?? '').trim();
    const raw = third !== '' ? third : (cells[1] ?? '').trim();
    const email = raw.replace(/\s+/g, '');
    if (!EMAIL_RE.test(email)) return;
    const key = contactNameKey(name);
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    out.push({ name, email: email.slice(0, 80) });
  });

  return out;
}