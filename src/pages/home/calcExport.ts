import { FIELDS, FIELD_KEYS, INITIAL, compute, num, priceForMargin } from '@/pages/home/calcModel';
import type { Scenario, Values } from '@/pages/home/calcModel';
import {
  HISTORY_MONTHS,
  SECOND_SUFFIX,
  buildDefaultHistory,
  monthLabels,
} from '@/pages/home/priceHistory';
import { quotesOfScenario, supplierNameOf } from '@/pages/home/supplierCompare';
import { loadQuoteCosts, quoteValues } from '@/pages/home/quoteCosts';
import { FIELD_MEMORY_MAX } from '@/pages/home/fieldMemory';
import type { FieldMemory } from '@/pages/home/fieldMemory';

type Translate = (key: string) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function buildScenariosCsv(
  scenarios: Scenario[],
  locale: string,
  t: Translate,
  histories: Record<string, number[]> = {},
  supplierNames: Record<string, string> = {},
  supplierEmails: Record<string, string> = {},
  memory: FieldMemory = {},
  goodFloor = 20,
): string {
  const secondNameOf = (id: number) =>
    (supplierNames[`s${id}${SECOND_SUFFIX}`] ?? '').trim() || t('home.calc.historySupplierB');
  const nf = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 });
  const money = (value: number) => nf.format(Math.round(value * 100) / 100);
  const rate = (value: number) => nf.format(Math.round(value * 10) / 10);

  const header = [
    t('home.calc.nameLabel'),
    t('home.calc.csvSupplierEmail'),
    ...FIELDS.map((f) => `${t(`home.calc.${f.key}`)} (${f.unit})`),
    `${t('home.calc.totalCost')} (EUR)`,
    `${t('home.calc.priceHT')} (EUR)`,
    `${t('home.calc.vatAmount')} (EUR)`,
    `${t('home.calc.netProfit')} (EUR)`,
    `${t('home.calc.netMargin')} (%)`,
    `${t('home.calc.csvGreenFloor')} (%)`,
    `${t('home.calc.csvGreenPrice')} (EUR)`,
    `${t('home.calc.netHT')} (EUR)`,
    `${t('home.calc.netMarginHT')} (%)`,
    `${t('home.calc.roi')} (%)`,
    `${t('home.calc.monthly')} (EUR)`,
  ];

  const lines = [header.map(escapeCell).join(';')];

  scenarios.forEach((scenario, index) => {
    const metrics = compute(scenario.values);
    const name =
      scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
    /* The green floor and the sale price that reaches it sit right next to the
       net margin, so the sheet reads as a decision and not just figures. */
    const greenPrice = priceForMargin(scenario.values, goodFloor);
    const row = [
      name,
      (supplierEmails[`s${scenario.id}`] ?? '').trim(),
      ...FIELDS.map((f) => nf.format(num(scenario.values[f.key]))),
      money(metrics.totalCost),
      money(metrics.priceHT),
      money(metrics.vatAmount),
      money(metrics.net),
      rate(metrics.netMargin),
      rate(goodFloor),
      greenPrice === null ? '' : money(greenPrice),
      money(metrics.netHT),
      rate(metrics.netMarginHT),
      rate(metrics.roi),
      money(metrics.monthly),
    ];
    lines.push(row.map(escapeCell).join(';'));
  });

  const months = monthLabels(locale, HISTORY_MONTHS);
  const names = scenarios.map(
    (scenario, index) =>
      scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`,
  );

  /* One column per scenario, plus a second column when a second supplier
     quote was recorded for it — the supplier reads the two curves side by side. */
  const costs = loadQuoteCosts();
  const columns: { values: Values; series: number[] }[] = [];
  scenarios.forEach((scenario) => {
    const key = `s${scenario.id}`;
    const stored = histories[key];
    columns.push({
      values: scenario.values,
      series:
        stored && stored.length === months.length
          ? stored
          : buildDefaultHistory(key, num(scenario.values.supplier)),
    });
    const secondStored = histories[`${key}${SECOND_SUFFIX}`];
    if (secondStored && secondStored.length === months.length) {
      columns.push({
        values: quoteValues(scenario.values, costs[`${key}${SECOND_SUFFIX}`]),
        series: secondStored,
      });
    }
  });

  const columnNames: string[] = [];
  scenarios.forEach((scenario, index) => {
    const name = names[index];
    columnNames.push(name);
    if (histories[`s${scenario.id}${SECOND_SUFFIX}`]?.length === months.length) {
      columnNames.push(`${name} · ${secondNameOf(scenario.id)}`);
    }
  });

  /* Headline verdict right at the head of the history section: which supplier
     won the 12-month comparison, for how many months and how much it saves. */
  lines.push('');
  lines.push(escapeCell(t('home.calc.csvVerdictTitle')));
  lines.push(
    [
      t('home.calc.csvVerdictScenario'),
      t('home.calc.csvVerdictWinner'),
      t('home.calc.csvVerdictMonths'),
      t('home.calc.csvVerdictGap'),
    ]
      .map(escapeCell)
      .join(';'),
  );
  scenarios.forEach((scenario, index) => {
    const quotes = quotesOfScenario(scenario, histories);
    const comparison = quotes.comparison;
    if (!comparison) {
      lines.push(
        [names[index], t('home.calc.csvVerdictSingle'), '', ''].map(escapeCell).join(';'),
      );
      return;
    }
    const nameA = supplierNameOf(
      supplierNames,
      `s${scenario.id}`,
      t('home.calc.historySupplierA'),
    );
    const nameB = supplierNameOf(
      supplierNames,
      `s${scenario.id}${SECOND_SUFFIX}`,
      t('home.calc.historySupplierB'),
    );
    const tied = comparison.winner === 'tie';
    const winner = tied
      ? t('home.calc.csvVerdictTie')
      : comparison.winner === 'b'
        ? nameB
        : nameA;
    const wonMonths = tied
      ? ''
      : `${comparison.winner === 'b' ? comparison.winsB : comparison.winsA}/${months.length}`;
    lines.push(
      [names[index], winner, wonMonths, tied ? '' : money(Math.abs(comparison.gap))]
        .map(escapeCell)
        .join(';'),
    );
  });

  /* Supplier curve(s), scenario by scenario: the supplier sees the 12-month trend. */
  lines.push('');
  lines.push(escapeCell(`${t('home.calc.historyCsvTitle')} — ${t('home.calc.historyCsvPrice')}`));
  lines.push([t('home.calc.historyCsvMonth'), ...columnNames].map(escapeCell).join(';'));
  months.forEach((month, index) => {
    lines.push(
      [month.long, ...columns.map((column) => money(column.series[index]))]
        .map(escapeCell)
        .join(';'),
    );
  });

  /* What the same month would have earned at the scenario's sale price. */
  lines.push('');
  lines.push(escapeCell(`${t('home.calc.historyCsvTitle')} — ${t('home.calc.historyCsvNet')}`));
  lines.push([t('home.calc.historyCsvMonth'), ...columnNames].map(escapeCell).join(';'));
  months.forEach((month, index) => {
    lines.push(
      [
        month.long,
        ...columns.map((column) => {
          const price = column.series[index];
          return money(compute({ ...column.values, supplier: String(price) }).net);
        }),
      ]
        .map(escapeCell)
        .join(';'),
    );
  });

  /* What was typed on each field, newest first: one column per field, so the
     back-and-forth on a single number reads straight down the sheet. */
  lines.push('');
  lines.push(escapeCell(t('home.calc.csvMemTitle')));
  lines.push(
    [
      t('home.calc.csvMemRank'),
      ...FIELDS.map((f) => `${t(`home.calc.${f.key}`)} (${f.unit})`),
    ]
      .map(escapeCell)
      .join(';'),
  );
  for (let rank = 0; rank < FIELD_MEMORY_MAX; rank += 1) {
    const row = [String(rank + 1)];
    FIELDS.forEach((f) => {
      row.push(memory[f.key]?.[rank] ?? '');
    });
    lines.push(row.map(escapeCell).join(';'));
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export type SensitivityRow = {
  price: number;
  net: number;
  margin: number;
  roi: number;
  tag: string;
};

/**
 * Stand-alone CSV of the sale-price sensitivity grid, so the seller can send
 * the price/margin ladder straight to the supplier.
 */
export function buildSensitivityCsv(
  rows: SensitivityRow[],
  locale: string,
  t: Translate,
  label: string,
  suppliers: { name: string; email: string }[] = [],
): string {
  const nf = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 });
  const money = (value: number) => nf.format(Math.round(value * 100) / 100);
  const rate = (value: number) => nf.format(Math.round(value * 10) / 10);

  const lines = [escapeCell(`${t('home.calc.sensitivityCsvTitle')} — ${label}`)];

  /* Le destinataire voyage avec la grille : la fiche fournisseur du calculateur
     donne le nom et l'adresse, le fichier se suffit donc à lui-même. */
  const mails = suppliers.filter((item) => item.email.trim() !== '');
  if (mails.length > 0) {
    mails.forEach((item) => {
      lines.push(
        [
          t('home.calc.supplier'),
          item.name,
          t('home.calc.csvSupplierEmail'),
          item.email.trim(),
        ]
          .map(escapeCell)
          .join(';'),
      );
    });
    lines.push('');
  }

  lines.push(
    [
      t('home.calc.sensitivityCsvPrice'),
      `${t('home.calc.netProfit')} (EUR)`,
      `${t('home.calc.netMargin')} (%)`,
      `${t('home.calc.roi')} (%)`,
      t('home.calc.sensitivityCsvTag'),
    ]
      .map(escapeCell)
      .join(';'),
  );

  rows.forEach((row) => {
    lines.push(
      [money(row.price), money(row.net), rate(row.margin), rate(row.roi), row.tag]
        .map(escapeCell)
        .join(';'),
    );
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export type CsvRecipient = { name: string; email: string };

/* Un morceau de nom de fichier sans accent, sans espace : le document reste
   lisible dans un dossier de téléchargements, sur n'importe quel système. */
const slugPart = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

/** Les destinataires du fichier, écrits dans son nom : on retrouve le bon
 * document dans les téléchargements sans l'ouvrir. */
export function recipientFileTag(recipients: CsvRecipient[] = []): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  recipients.forEach((item) => {
    const email = item.email.trim();
    if (email === '') return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const tag = [slugPart(item.name), slugPart(email)].filter(Boolean).join('-');
    if (tag !== '') parts.push(tag);
  });
  return parts.join('_').slice(0, 80);
}

export function sensitivityFilename(
  date = new Date(),
  recipients: CsvRecipient[] = [],
): string {
  const stamp = date.toISOString().slice(0, 10);
  const tag = recipientFileTag(recipients);
  return `markethunter-sensibilite-prix-${stamp}${tag === '' ? '' : `-${tag}`}.csv`;
}

export function downloadCsv(filename: string, content: string): boolean {
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export function csvFilename(date = new Date(), recipients: CsvRecipient[] = []): string {
  const stamp = date.toISOString().slice(0, 10);
  const tag = recipientFileTag(recipients);
  return `markethunter-scenarios-${stamp}${tag === '' ? '' : `-${tag}`}.csv`;
}

type Rows = string[][];

const SEPARATOR_HINTS = [';', ','];

function parseRows(text: string): Rows {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const semis = firstLine.split(';').length - 1;
  const commas = firstLine.split(',').length - 1;
  const separator = semis >= commas ? SEPARATOR_HINTS[0] : SEPARATOR_HINTS[1];

  const rows: Rows = [];
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
  const cleaned = cell.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

const looksLikeHeader = (row: string[]): boolean =>
  row
    .slice(1, 2 + FIELD_KEYS.length)
    .some((cell) => cell.trim() !== '' && !Number.isFinite(toNumber(cell)));

export type ImportedScenarios = {
  scenarios: Scenario[];
  skipped: number;
  truncated: boolean;
};

/**
 * Reads back a CSV produced by `buildScenariosCsv` (or the same columns
 * retouched in Excel): name first, then the eleven input fields in order.
 * Result columns are ignored, invalid rows are skipped.
 */
export function parseScenariosCsv(text: string): ImportedScenarios | null {
  const rows = parseRows(text);
  if (rows.length === 0) return null;

  const start = looksLikeHeader(rows[0]) ? 1 : 0;
  const scenarios: Scenario[] = [];
  let skipped = 0;

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    /* A single non-numeric cell opens an annex (supplier verdict, price curve,
       recent field values): nothing past it is a scenario. */
    if (row.length === 1 && row[0].trim() !== '' && !Number.isFinite(toNumber(row[0]))) {
      break;
    }
    /* The supplier e-mail sits right after the name: a non-numeric second cell
       means the column is there, so the numbers start one cell later. */
    const offset = row.length > 1 && !Number.isFinite(toNumber(row[1] ?? '')) ? 2 : 1;
    if (row.length < offset + FIELD_KEYS.length) {
      skipped += 1;
      continue;
    }
    const values: Values = { ...INITIAL };
    let valid = true;
    for (let j = 0; j < FIELD_KEYS.length; j += 1) {
      const value = toNumber(row[j + offset] ?? '');
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
    scenarios.push({
      id: scenarios.length + 1,
      name: (row[0] ?? '').trim().slice(0, 28),
      values,
    });
  }

  if (scenarios.length === 0) return null;
  return {
    scenarios: scenarios.slice(0, 3),
    skipped,
    truncated: scenarios.length > 3,
  };
}