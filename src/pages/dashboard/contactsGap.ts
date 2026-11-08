/** Les fiches dont le contact reste à compléter.
 *
 * Deux cas bien distincts, que le comparatif imprimé sépare et que le menu
 * burger additionne pour donner un ordre de grandeur :
 *   — aucune adresse connue : la fiche est à compléter ;
 *   — adresse connue mais jamais contactée : la fiche est à écrire.
 *
 * Le compteur lit ce navigateur (scénarios, colonnes du comparatif), comme le
 * compteur « à relancer » : le burger est présent sur toutes les pages, on
 * évite d'y charger tout l'espace de travail.
 */

import { useEffect, useState } from 'react';
import { loadScenarios } from '@/pages/home/calcModel';
import {
  SECOND_SUFFIX,
  SUPPLIER_EMAILS_EVENT,
  loadSupplierEmails,
} from '@/pages/home/priceHistory';
import { MAIL_LOG_EVENT, loadMailLog, mailKey } from '@/pages/dashboard/mailLog';
import { PRODUCT_MAIL_EVENT, loadProductMail } from '@/pages/sourcing/productMailLog';
import {
  COMPARE_RECIPIENTS_EVENT,
  readCompareRecipients,
} from '@/pages/sourcing/compareRecipients';
import { COMPARE_MEMORY_EVENT, readCompare } from '@/pages/sourcing/compareMemory';

/** Les deux adresses d'un scénario : le premier et le second fournisseur. */
function scenarioEmails(id: number): { a: string; b: string } {
  const emails = loadSupplierEmails();
  return {
    a: (emails[`s${id}`] ?? '').trim(),
    b: (emails[`s${id}${SECOND_SUFFIX}`] ?? '').trim(),
  };
}

/**
 * Nombre de fiches à compléter : scénarios du tableau de bord sans aucune
 * adresse, plus les colonnes du comparatif (sans adresse, ou avec une adresse
 * mais aucun message parti).
 */
export function countContactGaps(): number {
  if (typeof window === 'undefined') return 0;
  const mailLog = loadMailLog();
  const productMail = loadProductMail();
  const recipients = readCompareRecipients();
  const compare = readCompare();

  let count = 0;
  const noEmail = new Set<number>();

  loadScenarios().forEach((scenario) => {
    const { a, b } = scenarioEmails(scenario.id);
    if (a !== '' || b !== '') return;
    noEmail.add(scenario.id);
    count += 1;
  });

  /* Colonnes « produit sourcé » : l'adresse vit sur la colonne elle-même. */
  compare.products.forEach((id) => {
    const email = (recipients[id]?.email ?? '').trim();
    if (email === '') {
      count += 1;
      return;
    }
    if (!(Number(productMail[id]) > 0)) count += 1;
  });

  /* Colonne « scénario » du comparatif : déjà comptée si elle n'a pas d'adresse. */
  const scenarioId = compare.scenarioId;
  if (scenarioId !== null && !noEmail.has(scenarioId)) {
    const { a, b } = scenarioEmails(scenarioId);
    if (a === '' && b === '') {
      count += 1;
    } else if (
      !(Number(mailLog[mailKey(scenarioId, 'a')]) > 0) &&
      !(Number(mailLog[mailKey(scenarioId, 'b')]) > 0)
    ) {
      count += 1;
    }
  }

  return count;
}

/** Compteur vivant : il suit les copies d'e-mail et les contacts saisis. */
export function useContactGapCount(): number {
  const [count, setCount] = useState<number>(() => countContactGaps());

  useEffect(() => {
    const sync = () => setCount(countContactGaps());
    const events = [
      MAIL_LOG_EVENT,
      PRODUCT_MAIL_EVENT,
      COMPARE_RECIPIENTS_EVENT,
      COMPARE_MEMORY_EVENT,
      SUPPLIER_EMAILS_EVENT,
      'storage',
    ];
    events.forEach((name) => window.addEventListener(name, sync));
    return () => {
      events.forEach((name) => window.removeEventListener(name, sync));
    };
  }, []);

  return count;
}