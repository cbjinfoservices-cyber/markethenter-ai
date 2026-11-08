import type {
  ImportedView,
  SavedView,
  ViewFilter,
  ViewOrder,
  ViewOrderPin,
  ViewSort,
} from '@/pages/suppliers/savedViews';
import { readSupplier } from '@/pages/suppliers/supplierStore';
import type { Supplier } from '@/pages/suppliers/supplierStore';
import { readJsonView } from '@/pages/suppliers/viewsImport';

/** LA SAUVEGARDE COMPLÈTE DU CARNET — un seul fichier JSON qui emporte les
 *  fiches fournisseurs, les vues gardées et les seuils du carnet. Là où
 *  l'export des vues ne garde que les pastilles, celui-ci garde aussi les
 *  contacts et les réglages, de quoi retrouver le carnet entier ailleurs. */

export const CARNET_JSON_APP = 'markethunter';
export const CARNET_JSON_KIND = 'supplier-carnet';
export const CARNET_JSON_VERSION = 1;

/** Les seuils et réglages de la page, tels qu'ils sont à l'écran. */
export type CarnetSettings = {
  /** Seuil de délai appliqué, en jours, 0 quand il est retiré. */
  lead: number;
  /** Seuil de référence des pastilles, gardé même filtre retiré. */
  leadRef: number;
  sort: ViewSort;
  filter: ViewFilter;
  order: ViewOrder;
  orderPin: ViewOrderPin;
  /** La vue reposée à l'ouverture, vide quand il n'y en a pas. */
  lastView: string;
};

export type CarnetJson = {
  app: string;
  kind: string;
  version: number;
  exportedAt: string;
  settings: CarnetSettings;
  suppliers: Supplier[];
  views: SavedView[];
};

export function buildCarnetJson(input: {
  suppliers: Supplier[];
  views: SavedView[];
  settings: CarnetSettings;
  date?: Date;
}): string {
  const date = input.date ?? new Date();
  const payload: CarnetJson = {
    app: CARNET_JSON_APP,
    kind: CARNET_JSON_KIND,
    version: CARNET_JSON_VERSION,
    exportedAt: date.toISOString(),
    settings: input.settings,
    suppliers: input.suppliers.map((supplier) => ({
      ...supplier,
      scenarioIds: [...supplier.scenarioIds],
    })),
    views: input.views.map((view) => ({ ...view })),
  };
  return JSON.stringify(payload, null, 2);
}

export function carnetJsonFilename(date = new Date()): string {
  return `markethunter-carnet-fournisseurs-${date.toISOString().slice(0, 10)}.json`;
}

/** CE QUE LE FICHIER REND — les fiches, les vues et les seuils, relus tels
 *  quels. Un fichier d'un autre genre rend null : il ne doit rien écraser. */
export type ParsedCarnet = {
  exportedAt: string;
  /** Les seuils du carnet, null quand le fichier n'en portait pas. */
  settings: CarnetSettings | null;
  suppliers: Supplier[];
  views: ImportedView[];
  order: ViewOrder | null;
  orderPin: ViewOrderPin | null;
};

function asLead(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(400, Math.round(value));
}

/** LES SEUILS — un fichier d'une version antérieure peut n'en porter que
 *  quelques-uns : seuls ceux qui sont là sont relus. */
function asSettings(raw: unknown): CarnetSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const sort: ViewSort =
    row.sort === 'country' || row.sort === 'lead' ? row.sort : 'name';
  const filter: ViewFilter =
    row.filter === 'due' || row.filter === 'todo' || row.filter === 'unlinked'
      ? row.filter
      : 'all';
  const order: ViewOrder = row.order === 'used' ? 'used' : 'saved';
  const orderPin: ViewOrderPin = row.orderPin === 'ignore' ? 'ignore' : 'top';
  return {
    lead: asLead(row.lead),
    leadRef: asLead(row.leadRef),
    sort,
    filter,
    order,
    orderPin,
    lastView: typeof row.lastView === 'string' ? row.lastView : '',
  };
}

/** RELIRE LA SAUVEGARDE — le même fichier que celui écrit plus haut, rouvert
 *  sur un autre navigateur pour y reposer le carnet entier. */
export function parseCarnetJson(text: string): ParsedCarnet | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  /* Un fichier de vues seul n'est pas un carnet : il a son propre import. */
  if (root.kind !== CARNET_JSON_KIND) return null;

  const suppliers: Supplier[] = [];
  const seenNames = new Set<string>();
  if (Array.isArray(root.suppliers)) {
    root.suppliers.forEach((entry) => {
      const supplier = readSupplier(entry);
      if (!supplier) return;
      const key = supplier.name.toLowerCase();
      if (seenNames.has(key)) return;
      seenNames.add(key);
      suppliers.push(supplier);
    });
  }

  const views: ImportedView[] = [];
  const seenViews = new Set<string>();
  if (Array.isArray(root.views)) {
    root.views.forEach((entry) => {
      const view = readJsonView(entry);
      if (!view) return;
      const key = view.name.toLowerCase();
      if (seenViews.has(key)) return;
      seenViews.add(key);
      views.push(view);
    });
  }

  if (suppliers.length === 0 && views.length === 0 && root.settings === undefined) {
    return null;
  }

  const order = root.order === 'used' || root.order === 'saved' ? root.order : null;
  const orderPin =
    root.orderPin === 'ignore' || root.orderPin === 'top' ? root.orderPin : null;
  const settingsRaw = asSettings(root.settings);
  const settings = settingsRaw
    ? { ...settingsRaw, order: order ?? settingsRaw.order, orderPin: orderPin ?? settingsRaw.orderPin }
    : null;

  return {
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : '',
    settings,
    suppliers,
    views,
    order,
    orderPin,
  };
}