import type {
  SavedView,
  ViewFilter,
  ViewOrder,
  ViewOrderPin,
  ViewSort,
} from '@/pages/suppliers/savedViews';

/** Le fichier JSON des vues : les réglages bruts, pas les libellés traduits.
 *  C'est ce qui permet un aller-retour parfait — le même fichier relu ici ou
 *  ailleurs repose exactement la même rangée, sans passer par un tableur. */

export const VIEWS_JSON_APP = 'markethunter';
export const VIEWS_JSON_KIND = 'supplier-views';
export const VIEWS_JSON_VERSION = 1;

export type JsonViewEntry = {
  name: string;
  lead: number;
  sort: ViewSort;
  filter: ViewFilter;
  recalls: number;
  lastUsedAt: number;
  pinned: boolean;
  pinRank: number;
};

export type ViewsJson = {
  app: string;
  kind: string;
  version: number;
  exportedAt: string;
  order: ViewOrder;
  orderPin: ViewOrderPin;
  views: JsonViewEntry[];
};

export function buildViewsJson(
  views: SavedView[],
  order: ViewOrder,
  orderPin: ViewOrderPin,
  date = new Date(),
): string {
  const payload: ViewsJson = {
    app: VIEWS_JSON_APP,
    kind: VIEWS_JSON_KIND,
    version: VIEWS_JSON_VERSION,
    exportedAt: date.toISOString(),
    order,
    orderPin,
    views: views.map((view) => ({
      name: view.name,
      lead: view.lead,
      sort: view.sort,
      filter: view.filter,
      recalls: view.recalls,
      lastUsedAt: view.lastUsedAt,
      pinned: view.pinned,
      pinRank: view.pinRank,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function viewsJsonFilename(date = new Date()): string {
  return `markethunter-vues-fournisseurs-${date.toISOString().slice(0, 10)}.json`;
}