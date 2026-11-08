/** The supplier negotiation e-mail, written in two languages.
 *
 * The text is deliberately NOT read from the app locale: a French seller may
 * negotiate with a contact who only reads English (and the other way round),
 * so the language is picked on the sheet itself and stays fixed whatever the
 * interface language is.
 *
 * A third option sends both texts side by side, French first then English:
 * that is the version to use when the contact forwards the message to a
 * colleague who does not read the same language.
 */

export type SupplierMailLang = 'fr' | 'en' | 'bi';

export type SupplierMailVars = {
  name: string;
  sale: string;
  buy: string;
};

type SupplierMailTemplate = {
  subject: string;
  body: string;
};

const TEMPLATES: Record<'fr' | 'en', SupplierMailTemplate> = {
  fr: {
    subject: 'Prix de vente {{sale}} — objectif d’achat {{buy}}',
    body: "Bonjour,\n\nNous souhaitons maintenir un prix de vente de {{sale}} par unité pour {{name}}. Pour tenir ce prix, notre prix d'achat ne doit pas dépasser {{buy}} l'unité, fret et douane inchangés.\n\nPouvez-vous nous confirmer votre meilleur prix sur cette base ?\n\nBien cordialement,",
  },
  en: {
    subject: 'Sale price {{sale}} — purchase target {{buy}}',
    body: 'Hello,\n\nWe would like to hold a sale price of {{sale}} per unit for {{name}}. To keep that price, our purchase price must not exceed {{buy}} per unit, freight and customs unchanged.\n\nCould you confirm your best price on that basis?\n\nBest regards,',
  },
};

/** Separator between the two languages: visible enough to be read as a break,
 * light enough to stay clean in a plain-text e-mail. */
const BILINGUAL_RULE = '— — —';

const fill = (template: string, vars: SupplierMailVars) =>
  template
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{sale\}\}/g, vars.sale)
    .replace(/\{\{buy\}\}/g, vars.buy);

/** Subject and body of the supplier e-mail, in the chosen language. */
export function buildSupplierMail(
  lang: SupplierMailLang,
  vars: SupplierMailVars,
): SupplierMailTemplate {
  if (lang === 'bi') {
    const fr = TEMPLATES.fr;
    const en = TEMPLATES.en;
    return {
      /* The French subject first, then the English one: the recipient reads the
         first line in the language they opened the message with. */
      subject: `${fill(fr.subject, vars)} / ${fill(en.subject, vars)}`,
      body: `${fill(fr.body, vars)}\n\n${BILINGUAL_RULE}\n\n${fill(en.body, vars)}`,
    };
  }
  const template = TEMPLATES[lang];
  return {
    subject: fill(template.subject, vars),
    body: fill(template.body, vars),
  };
}