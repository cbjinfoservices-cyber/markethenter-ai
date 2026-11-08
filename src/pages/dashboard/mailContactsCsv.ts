/** L'archive de la négociation terminée : les contacts déjà servis.
 *
 * Une ligne par message parti — scénario, fournisseur, adresse et date d'envoi.
 * Le fichier sort du tableau de bord pour être classé avec les devis, une fois
 * la négociation close.
 */

import {
  SECOND_SUFFIX,
  loadSupplierEmails,
  loadSupplierNames,
} from '@/pages/home/priceHistory';
import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { PsychoRule, Values } from '@/pages/home/calcModel';
import { supplierNameOf } from '@/pages/home/supplierCompare';
import type { MailLog, MailSide } from '@/pages/dashboard/mailLog';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

type Translate = (key: string, options?: Record<string, string | number>) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const KEY_PATTERN = /^s(\d+):(a|b)$/;

const stampOf = (stamp: number, locale: string): string => {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

/** Le devis d'un côté de la carte : le second fournisseur a son propre prix. */
function quoteValuesOf(row: DashboardRow, side: MailSide): Values {
  if (side === 'b' && row.seriesB && row.seriesB.length > 0) {
    return row.secondValues;
  }
  return row.scenario.values;
}

/**
 * Les deux chiffres négociés face à chaque adresse : le prix de vente plancher
 * (le plancher vert arrondi au prix psychologique) et le prix d'achat maximum
 * qui le tient encore — exactement les chiffres envoyés dans l'e-mail
 * bilingue. Null quand aucun achat ne tient le plancher.
 */
function quotePricesOf(
  row: DashboardRow,
  side: MailSide,
  goodFloor: number,
  psychoRule: PsychoRule,
): { sale: number; buy: number } | null {
  const values = quoteValuesOf(row, side);
  const floor = priceForMargin(values, goodFloor);
  if (floor === null) return null;
  const sale = psychoFloorPrice(floor, psychoRule);
  const buy = maxSupplierFor(values, sale, goodFloor);
  if (buy === null) return null;
  return { sale, buy };
}

/** One row per sent message, newest first. */
export function buildMailContactsCsv(
  rows: DashboardRow[],
  mailLog: MailLog,
  locale: string,
  t: Translate,
  goodFloor: number,
  psychoRule: PsychoRule,
): string {
  const names = loadSupplierNames();
  const emails = loadSupplierEmails();
  const { eur } = makeFormatters(locale);

  const entries = Object.entries(mailLog)
    .map(([key, stamp]) => {
      const match = KEY_PATTERN.exec(key);
      if (!match) return null;
      const id = Number(match[1]);
      if (!Number.isFinite(id)) return null;
      return { id, side: match[2] as MailSide, stamp: Number(stamp) };
    })
    .filter((entry): entry is { id: number; side: MailSide; stamp: number } =>
      entry !== null && Number.isFinite(entry.stamp) && entry.stamp > 0,
    )
    .sort((a, b) => b.stamp - a.stamp);

  const header = [
    t('home.dash.mailCsvScenario'),
    t('home.dash.mailCsvSupplier'),
    t('home.dash.mailCsvEmail'),
    t('home.dash.mailCsvSale'),
    t('home.dash.mailCsvTarget'),
    t('home.dash.mailCsvWhen'),
  ];
  const lines = [header.map(escapeCell).join(';')];

  entries.forEach((entry) => {
    const index = rows.findIndex((row) => row.scenario.id === entry.id);
    if (index < 0) return;
    const scenario = rows[index].scenario;
    const scenarioName =
      scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
    const supplierKey = entry.side === 'b' ? `s${entry.id}${SECOND_SUFFIX}` : `s${entry.id}`;
    const supplierName = supplierNameOf(
      names,
      supplierKey,
      t(entry.side === 'b' ? 'home.calc.historySupplierB' : 'home.calc.historySupplierA'),
    );
    const prices = quotePricesOf(rows[index], entry.side, goodFloor, psychoRule);
    lines.push(
      [
        scenarioName,
        supplierName,
        emails[supplierKey] ?? '',
        prices === null ? '' : eur(prices.sale),
        prices === null ? '' : eur(prices.buy),
        stampOf(entry.stamp, locale),
      ]
        .map(escapeCell)
        .join(';'),
    );
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function mailContactsFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `markethunter-contacts-fournisseurs-${stamp}.csv`;
}