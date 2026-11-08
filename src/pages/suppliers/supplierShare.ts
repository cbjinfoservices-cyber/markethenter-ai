import type { Supplier } from '@/pages/suppliers/supplierStore';

/** Les libellés dont le résumé a besoin, déjà traduits par la page. */
export type SummaryLabels = {
  title: string;
  when: string;
  /** « 4 Chine · 2 France », posé juste sous le titre. */
  countries?: string;
  noCountry: string;
  noLead: string;
  noEmail: string;
  lead: (value: number) => string;
};

/** La liste affichée, en un bloc de texte : nom, pays, délai, adresse.
 *  Prêt à coller dans WhatsApp sans retoucher une seule ligne. */
export function buildSuppliersSummary(list: Supplier[], labels: SummaryLabels): string {
  const lines = list.map((supplier, index) => {
    const country = supplier.country.trim() === '' ? labels.noCountry : supplier.country.trim();
    const lead = supplier.leadDays > 0 ? labels.lead(supplier.leadDays) : labels.noLead;
    const email = supplier.email.trim() === '' ? labels.noEmail : supplier.email.trim();
    return `${index + 1}. ${supplier.name} — ${country} · ${lead} · ${email}`;
  });
  const head = [`${labels.title} · ${labels.when}`];
  if (labels.countries !== undefined && labels.countries !== '') {
    head.push(labels.countries);
  }
  return [...head, '', ...lines].join('\n');
}