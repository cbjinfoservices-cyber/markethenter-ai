import type { ViewFilter, ViewSort } from '@/pages/suppliers/savedViews';

type Translate = (key: string) => string;

/** Les libellés d'une vue, partagés par la pastille et par l'export : le
 *  fichier dit exactement ce que la liste affiche. */
export const VIEW_SORT_LABEL: Record<ViewSort, string> = {
  name: 'home.suppliers.sortName',
  country: 'home.suppliers.sortCountry',
  lead: 'home.suppliers.sortLead',
};

export const VIEW_FILTER_LABEL: Record<ViewFilter, string> = {
  all: 'home.suppliers.filterAll',
  due: 'home.suppliers.filterDue',
  todo: 'home.suppliers.filterTodo',
  unlinked: 'home.suppliers.filterUnlinked',
};

const escapeCell = (value: string): string =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export type ViewRow = {
  name: string;
  /** Seuil de délai en jours, 0 quand la vue ne filtre pas sur le délai. */
  lead: number;
  sortLabel: string;
  filterLabel: string;
  /** Combien de fiches la vue retient. */
  count: number;
  /** Le délai le plus lent qu'elle contient, 0 quand elle est vide. */
  slowest: number;
  /** Combien de fois la vue a été rappelée : c'est lui qui ordonne la rangée
   *  « la plus utilisée », et il voyage avec le fichier. */
  recalls: number;
  /** La date du dernier rappel, 0 quand la vue n'a jamais été rappelée. */
  lastUsedAt: number;
  /** La pastille était-elle épinglée en tête de liste ? */
  pinned: boolean;
  /** Son rang parmi les épinglées, 0 quand elle ne l'était pas. */
  pinRank: number;
};

/** Une ligne par vue gardée : le nom, ses réglages, et ce qu'elle contient
 *  vraiment — les deux badges de la pastille, mis à plat. */
export function buildViewsCsv(rows: ViewRow[], t: Translate, titleLine = ''): string {
  const header = [
    t('home.suppliers.viewsCsvName'),
    t('home.suppliers.viewsCsvLead'),
    t('home.suppliers.viewsCsvSort'),
    t('home.suppliers.viewsCsvFilter'),
    t('home.suppliers.viewsCsvCount'),
    t('home.suppliers.viewsCsvSlowest'),
    t('home.suppliers.viewsCsvRecalls'),
    t('home.suppliers.viewsCsvLastUsed'),
    t('home.suppliers.viewsCsvPinned'),
    t('home.suppliers.viewsCsvPinRank'),
  ];

  const lines = [header.map(escapeCell).join(';')];

  const title = titleLine.trim();
  if (title !== '') lines.unshift(escapeCell(title));

  rows.forEach((row) => {
    const cells = [
      row.name,
      row.lead > 0 ? String(row.lead) : '',
      row.sortLabel,
      row.filterLabel,
      String(row.count),
      row.slowest > 0 ? String(row.slowest) : '',
      String(row.recalls),
      row.lastUsedAt > 0 ? new Date(row.lastUsedAt).toISOString() : '',
      row.pinned
        ? t('home.suppliers.viewsCsvPinnedYes')
        : t('home.suppliers.viewsCsvPinnedNo'),
      row.pinned && row.pinRank > 0 ? String(row.pinRank) : '',
    ];
    lines.push(cells.map(escapeCell).join(';'));
  });

  return `\uFEFF${lines.join('\r\n')}`;
}

export function viewsFilename(date = new Date()): string {
  return `markethunter-vues-fournisseurs-${date.toISOString().slice(0, 10)}.csv`;
}