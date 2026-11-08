/** Qui attend encore son message.
 *
 * Une carte peut porter deux devis : chacun a son propre e-mail. Un fournisseur
 * est « à relancer » dès que son message bilingue peut être construit et que
 * rien n'est encore parti vers lui. Le filtre du tableau de bord s'appuie
 * exactement sur la même règle que le badge ambre des cartes.
 */

import {
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { PsychoRule, Values } from '@/pages/home/calcModel';
import { mailKey } from '@/pages/dashboard/mailLog';
import type { MailLog, MailSide } from '@/pages/dashboard/mailLog';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';

/** Le devis d'un côté de la carte : le second fournisseur a son propre prix. */
export function quoteValuesOf(row: DashboardRow, side: MailSide): Values {
  if (side === 'b' && row.seriesB && row.seriesB.length > 0) {
    return {
      ...row.scenario.values,
      supplier: String(row.seriesB[row.seriesB.length - 1]),
    };
  }
  return row.scenario.values;
}

/** Un e-mail bilingue est-il seulement possible pour ce devis ? */
export function mailBuildable(
  row: DashboardRow,
  side: MailSide,
  goodFloor: number,
  psychoRule: PsychoRule,
): boolean {
  const values = quoteValuesOf(row, side);
  const floor = priceForMargin(values, goodFloor);
  if (floor === null) return false;
  const sale = psychoFloorPrice(floor, psychoRule);
  return maxSupplierFor(values, sale, goodFloor) !== null;
}

/** Les devis de la carte qui ont réellement un message prêt à partir. */
export function mailSidesOf(
  row: DashboardRow,
  goodFloor: number,
  psychoRule: PsychoRule,
): MailSide[] {
  const sides: MailSide[] = [];
  if (mailBuildable(row, 'a', goodFloor, psychoRule)) sides.push('a');
  const hasSecond = Boolean(row.comparison) && Boolean(row.seriesB?.length);
  if (hasSecond && mailBuildable(row, 'b', goodFloor, psychoRule)) sides.push('b');
  return sides;
}

/** Au moins un fournisseur de la carte attend encore son message. */
export function needsFollowUp(
  row: DashboardRow,
  mailLog: MailLog,
  goodFloor: number,
  psychoRule: PsychoRule,
): boolean {
  return mailSidesOf(row, goodFloor, psychoRule).some(
    (side) => !(Number(mailLog[mailKey(row.scenario.id, side)]) > 0),
  );
}