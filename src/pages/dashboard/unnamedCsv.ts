/** Les fiches à baptiser, prêtes à nommer hors du navigateur.
 *
 * La liste filtrée du tableau de bord ne sert qu'à l'écran : une fois dans
 * Excel, on nomme les fournisseurs tranquillement, sans rouvrir chaque fiche.
 * Le fichier reprend donc la fiche, la colonne fournisseur marquée « à
 * baptiser » (comme le journal et la feuille imprimée), l'adresse déjà connue
 * et les trois chiffres qui aident à reconnaître le devis.
 */

import { loadSupplierEmails, loadSupplierNames, SECOND_SUFFIX } from '@/pages/home/priceHistory';
import { num } from '@/pages/home/calcModel';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

type Translate = (key: string, options?: Record<string, string | number>) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Le nom de la fiche, ou son rang dans la liste — jamais une case vide. */
function sheetNameOf(row: DashboardRow, index: number, t: Translate): string {
  const typed = row.scenario.name.trim();
  if (typed !== '') return typed;
  return `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
}

export function buildUnnamedCsv(
  rows: DashboardRow[],
  locale: string,
  t: Translate,
): string {
  const names = loadSupplierNames();
  const emails = loadSupplierEmails();
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const rate = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const header = [
    t('home.dash.unnamedCsvRef'),
    t('home.dash.importLogSheet'),
    t('home.dash.importLogSupplier'),
    t('home.dash.importLogEmail'),
    t('home.dash.unnamedCsvBuy'),
    t('home.dash.unnamedCsvSell'),
    t('home.dash.unnamedCsvNet'),
    t('home.dash.unnamedCsvMargin'),
  ];
  const lines = [header.map(escapeCell).join(';')];

  rows.forEach((row, index) => {
    const id = row.scenario.id;
    const email =
      (emails[`s${id}`] ?? '').trim() || (emails[`s${id}${SECOND_SUFFIX}`] ?? '').trim();
    /* Le nom déjà saisi, s'il en existe un : la ligne part remplie plutôt que
       d'obliger à retaper ce que la fiche sait déjà. */
    const typed = (names[`s${id}`] ?? '').trim() || (names[`scenario-${id}`] ?? '').trim();
    lines.push(
      [
        /* La référence de la fiche : c'est elle qui la retrouve au retour du
           fichier, même si son nom a changé entre-temps. */
        `S${id}`,
        sheetNameOf(row, index, t),
        typed !== '' ? typed : t('home.sourcing.printLogSupplierMissing'),
        email,
        amount.format(num(row.scenario.values.supplier)),
        amount.format(row.metrics.price),
        amount.format(row.metrics.net),
        `${rate.format(row.metrics.netMargin)} %`,
      ]
        .map(escapeCell)
        .join(';'),
    );
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function unnamedCsvFilename(date = new Date()): string {
  return `markethunter-fiches-a-baptiser-${date.toISOString().slice(0, 10)}.csv`;
}