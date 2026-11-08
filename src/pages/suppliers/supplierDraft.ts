import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { PsychoRule, Scenario } from '@/pages/home/calcModel';
import { buildSupplierMail } from '@/pages/home/supplierMail';
import type { Supplier } from '@/pages/suppliers/supplierStore';

/** Le message prêt à partir depuis une fiche du carnet. */
export type SupplierDraft = {
  /** Objet du message, bilingue comme celui du sourcing. */
  subject: string;
  /** Corps du message, prêt à envoyer. */
  body: string;
  /** Lien `mailto:` complet : l'adresse, l'objet et le texte. */
  href: string;
  /** Prix de vente plancher arrondi, celui du sourcing. */
  sale: number;
  /** Prix d'achat maximum qui tient encore ce plancher. */
  buy: number;
  /** La fiche d'achat qui a fourni les chiffres. */
  sheet: string;
};

/**
 * Le même message type que le comparatif du sourcing, mais écrit depuis le
 * carnet.
 *
 * Les chiffres ne sont pas inventés : ils viennent de la première fiche
 * d'achat rattachée au fournisseur qui permet encore de calculer un plancher
 * au seuil vert. Sans adresse, ou sans fiche rattachée, il n'y a rien à
 * préparer — la fiche le dit au lieu d'ouvrir un message à trous.
 */
export function supplierDraftOf(
  supplier: Supplier,
  scenarios: Scenario[],
  sheetNames: Record<number, string>,
  goodFloor: number,
  psychoRule: PsychoRule,
  locale: string,
): SupplierDraft | null {
  const email = supplier.email.trim();
  if (email === '') return null;
  const { eur } = makeFormatters(locale);

  for (let index = 0; index < supplier.scenarioIds.length; index += 1) {
    const id = supplier.scenarioIds[index];
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) continue;

    const floor = priceForMargin(scenario.values, goodFloor);
    if (floor === null) continue;
    const sale = psychoFloorPrice(floor, psychoRule);
    const buy = maxSupplierFor(scenario.values, sale, goodFloor);
    if (buy === null) continue;

    const sheet = sheetNames[scenario.id] ?? '';
    const mail = buildSupplierMail('bi', {
      name: sheet,
      sale: eur(sale),
      buy: eur(buy),
    });

    return {
      subject: mail.subject,
      body: mail.body,
      href: `mailto:${email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`,
      sale,
      buy,
      sheet,
    };
  }

  return null;
}