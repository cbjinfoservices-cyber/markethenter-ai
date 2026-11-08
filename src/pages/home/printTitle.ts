import type { CsvRecipient } from '@/pages/home/calcExport';

/** Le nom du PDF enregistré vient du titre du document.
 *
 * On y met donc la feuille, puis le nom et l'adresse du destinataire : dans un
 * dossier de téléchargements rempli de « Récapitulatif fournisseur (3).pdf »,
 * le fournisseur reconnaît son propre document sans l'ouvrir.
 *
 * Les caractères interdits dans un nom de fichier sont retirés au passage
 * (barres obliques, deux-points, guillemets…), sinon le navigateur coupe le nom
 * au premier caractère refusé.
 */
const cleanPart = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function printDocumentTitle(title: string, recipients: CsvRecipient[] = []): string {
  const seen = new Set<string>();
  const who: string[] = [];

  recipients.forEach((item) => {
    const email = item.email.trim();
    if (email === '') return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = item.name.trim();
    who.push(name === '' ? email : `${name} — ${email}`);
  });

  const base = cleanPart(title);
  if (who.length === 0) return base;
  return cleanPart(`${base} — ${who.join(' · ')}`);
}