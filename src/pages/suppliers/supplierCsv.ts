import type { Supplier } from '@/pages/suppliers/supplierStore';

type Translate = (key: string) => string;

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Le fichier reprend exactement les colonnes de la fiche : nom, contact,
 *  conditions, scénarios rattachés et état de la relance. La ligne des pays
 *  part en tête, comme dans le résumé copié. */
export function buildSuppliersCsv(
  suppliers: Supplier[],
  locale: string,
  t: Translate,
  scenarioNames: Record<number, string>,
  dateFmt: Intl.DateTimeFormat,
  countryLine = '',
  titleLine = '',
): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const header = [
    t('home.suppliers.csvName'),
    t('home.suppliers.csvCountry'),
    t('home.suppliers.csvEmail'),
    `${t('home.suppliers.lead')} (${t('home.suppliers.days')})`,
    t('home.suppliers.moq'),
    `${t('home.suppliers.unitPrice')} (EUR)`,
    t('home.suppliers.csvScenarios'),
    t('home.suppliers.csvLastContact'),
    t('home.suppliers.csvFollowUp'),
    t('home.suppliers.csvNote'),
  ];

  const lines = [header.map(escapeCell).join(';')];

  /* La phrase d'accroche de la vue part en toute première ligne, comme le
     titre du résumé copié : le fichier dit ce qu'il contient avant tout. */
  const title = titleLine.trim();
  if (title !== '') {
    lines.unshift(escapeCell(title));
  }

  /* « Par pays ; 4 Chine · 2 France » : la même phrase que le bloc WhatsApp,
     posée avant les colonnes pour qu'on sache ce que le fichier raconte. */
  const tally = countryLine.trim();
  if (tally !== '') {
    lines.unshift([t('home.suppliers.tallyLab'), tally].map(escapeCell).join(';'));
  }

  suppliers.forEach((supplier) => {
    const attached = supplier.scenarioIds
      .map((id) => scenarioNames[id])
      .filter((name): name is string => typeof name === 'string' && name !== '');
    const row = [
      supplier.name,
      supplier.country,
      supplier.email,
      supplier.leadDays > 0 ? nf.format(supplier.leadDays) : '',
      supplier.moq > 0 ? nf.format(supplier.moq) : '',
      supplier.unitPrice > 0 ? nf.format(supplier.unitPrice) : '',
      attached.join(' | '),
      supplier.lastContact === null ? '' : dateFmt.format(new Date(supplier.lastContact)),
      supplier.followUp ? t('home.suppliers.followUpOn') : '',
      supplier.note,
    ];
    lines.push(row.map(escapeCell).join(';'));
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function suppliersFilename(date = new Date()): string {
  return `markethunter-fournisseurs-${date.toISOString().slice(0, 10)}.csv`;
}