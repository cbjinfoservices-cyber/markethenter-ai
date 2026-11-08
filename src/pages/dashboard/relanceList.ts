/** La liste des relances, prête à coller.
 *
 * Pour chaque fournisseur qui attend encore son message : le nom du scénario,
 * son nom, son adresse, puis les deux chiffres négociés — le prix de vente
 * plancher et le prix d'achat visé. Même règle que le badge ambre et que le
 * filtre : un e-mail constructible, jamais parti.
 */

import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { PsychoRule } from '@/pages/home/calcModel';
import {
  SECOND_SUFFIX,
  loadSupplierEmails,
  loadSupplierNames,
} from '@/pages/home/priceHistory';
import { supplierNameOf } from '@/pages/home/supplierCompare';
import { mailKey } from '@/pages/dashboard/mailLog';
import type { MailLog, MailSide } from '@/pages/dashboard/mailLog';
import { mailSidesOf, quoteValuesOf } from '@/pages/dashboard/relance';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

type Translate = (key: string, options?: Record<string, string | number>) => string;

export type RelanceContact = {
  /** Nom du scénario, pour retrouver la carte dans le tableau de bord. */
  scenario: string;
  supplier: string;
  email: string;
  /** Prix de vente plancher arrondi au prix psychologique, hors TVA de calcul. */
  sale: number | null;
  /** Prix d'achat maximum qui tient encore ce plancher. */
  buy: number | null;
  /** Net par vente, pour trier les urgences en premier. */
  net: number;
};

type SupplierMemory = {
  names: Record<string, string>;
  emails: Record<string, string>;
};

/** Le contact d'un seul devis : le même bloc que dans la liste complète. */
function contactOf(
  row: DashboardRow,
  side: MailSide,
  scenarioName: string,
  memory: SupplierMemory,
  t: Translate,
  goodFloor: number,
  psychoRule: PsychoRule,
): RelanceContact {
  const values = quoteValuesOf(row, side);
  const floor = priceForMargin(values, goodFloor);
  const sale = floor === null ? null : psychoFloorPrice(floor, psychoRule);
  const buy = sale === null ? null : maxSupplierFor(values, sale, goodFloor);
  const supplierKey = side === 'b' ? `s${row.scenario.id}${SECOND_SUFFIX}` : `s${row.scenario.id}`;
  return {
    scenario: scenarioName,
    supplier: supplierNameOf(
      memory.names,
      supplierKey,
      t(side === 'b' ? 'home.calc.historySupplierB' : 'home.calc.historySupplierA'),
    ),
    email: memory.emails[supplierKey] ?? '',
    sale,
    buy,
    net: row.metrics.net,
  };
}

/** Un fournisseur précis, pour copier sa seule relance depuis sa carte. */
export function relanceContactOf(
  row: DashboardRow,
  side: MailSide,
  scenarioName: string,
  t: Translate,
  goodFloor: number,
  psychoRule: PsychoRule,
): RelanceContact {
  return contactOf(
    row,
    side,
    scenarioName,
    { names: loadSupplierNames(), emails: loadSupplierEmails() },
    t,
    goodFloor,
    psychoRule,
  );
}

/** Les fournisseurs en attente, le net le plus faible en premier. */
export function relanceContacts(
  rows: DashboardRow[],
  mailLog: MailLog,
  t: Translate,
  goodFloor: number,
  psychoRule: PsychoRule,
): RelanceContact[] {
  const memory: SupplierMemory = {
    names: loadSupplierNames(),
    emails: loadSupplierEmails(),
  };
  const contacts: RelanceContact[] = [];

  rows.forEach((row, index) => {
    const scenarioName =
      row.scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
    mailSidesOf(row, goodFloor, psychoRule).forEach((side) => {
      if (Number(mailLog[mailKey(row.scenario.id, side)]) > 0) return;
      contacts.push(contactOf(row, side, scenarioName, memory, t, goodFloor, psychoRule));
    });
  });

  return contacts.sort((a, b) => a.net - b.net);
}

/** Le texte brut : nom, adresse et chiffres, prêt à coller dans un message. */
export function buildRelanceList(
  contacts: RelanceContact[],
  locale: string,
  t: Translate,
): string {
  const { eur } = makeFormatters(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date());
  const lines = [t('home.dash.relanceCopyTitle', { count: contacts.length, date })];

  contacts.forEach((contact, index) => {
    lines.push('');
    lines.push(`${index + 1}. ${contact.scenario}`);
    lines.push(`   ${contact.supplier} — ${contact.email.trim() || t('home.dash.relanceCopyNoEmail')}`);
    lines.push(
      contact.sale === null || contact.buy === null
        ? `   ${t('home.dash.relanceCopyNoPrices')}`
        : `   ${t('home.dash.relanceCopyPrices', {
            sale: eur(contact.sale),
            buy: eur(contact.buy),
          })}`,
    );
  });

  return lines.join('\n');
}

/** Le nom du fichier texte : daté, pour retrouver la bonne relance. */
export function relanceFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `markethunter-relances-${stamp}.txt`;
}

/**
 * Enregistre la liste sur l'ordinateur, hors du navigateur.
 *
 * Le fichier garde le même texte que la copie, avec la marque d'encodage en
 * tête pour que les accents s'affichent dans n'importe quel bloc-notes.
 */
export function downloadRelanceText(filename: string, content: string): boolean {
  try {
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/plain;charset=utf-8;' });
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