/** Le compteur « à relancer » du menu burger.
 *
 * Même règle que le badge ambre des cartes et que le filtre du tableau de
 * bord : un fournisseur attend son message dès qu'un e-mail bilingue peut être
 * construit et que rien n'est encore parti vers lui. Le compteur se lit sans
 * ouvrir le tableau de bord, et le menu pointe directement sur la liste filtrée.
 *
 * Les scénarios de ce navigateur suffisent ici : le burger est présent sur
 * toutes les pages, on évite d'y charger tout l'espace de travail.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { PsychoRule, Values } from '@/pages/home/calcModel';
import { loadScenarios } from '@/pages/home/calcModel';
import {
  HISTORY_MONTHS,
  readStoredHistoryOnly,
  secondKey,
} from '@/pages/home/priceHistory';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import { MAIL_LOG_EVENT, loadMailLog, mailKey } from '@/pages/dashboard/mailLog';
import type { MailLog, MailSide } from '@/pages/dashboard/mailLog';

/** Le devis d'un côté : le second fournisseur a son propre prix d'achat. */
function quoteValues(values: Values, side: MailSide, latestB: number | null): Values {
  if (side === 'b' && latestB !== null) {
    return { ...values, supplier: String(latestB) };
  }
  return values;
}

/** Un message bilingue est-il possible pour ce devis ? */
function buildable(values: Values, goodFloor: number, psychoRule: PsychoRule): boolean {
  const floor = priceForMargin(values, goodFloor);
  if (floor === null) return false;
  const sale = psychoFloorPrice(floor, psychoRule);
  return maxSupplierFor(values, sale, goodFloor) !== null;
}

/** Nombre de scénarios dont au moins un fournisseur attend encore son message. */
export function countFollowUp(
  mailLog: MailLog,
  goodFloor: number,
  psychoRule: PsychoRule,
): number {
  let count = 0;
  loadScenarios().forEach((scenario) => {
    const key = `s${scenario.id}`;
    const storedB = readStoredHistoryOnly(secondKey(key));
    const latestB =
      storedB && storedB.length === HISTORY_MONTHS ? storedB[storedB.length - 1] : null;
    const sides: MailSide[] = latestB === null ? ['a'] : ['a', 'b'];
    const waiting = sides.some((side) => {
      const values = quoteValues(scenario.values, side, latestB);
      if (!buildable(values, goodFloor, psychoRule)) return false;
      return !(Number(mailLog[mailKey(scenario.id, side)]) > 0);
    });
    if (waiting) count += 1;
  });
  return count;
}

/** Compteur vivant : il suit les copies d'e-mail et le seuil de marge. */
export function useRelanceCount(): number {
  const [goodFloor] = useGoodFloor();
  const [psychoRule] = usePsychoRule();
  const [mailLog, setMailLog] = useState<MailLog>(() => loadMailLog());

  useEffect(() => {
    const sync = () => setMailLog(loadMailLog());
    window.addEventListener(MAIL_LOG_EVENT, sync);
    return () => window.removeEventListener(MAIL_LOG_EVENT, sync);
  }, []);

  return useMemo(
    () => countFollowUp(mailLog, goodFloor, psychoRule),
    [mailLog, goodFloor, psychoRule],
  );
}