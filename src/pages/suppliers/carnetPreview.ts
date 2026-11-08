import type { CarnetSettings, ParsedCarnet } from '@/pages/suppliers/carnetJson';
import { previewViews } from '@/pages/suppliers/viewsPreview';
import type { ViewsPreview } from '@/pages/suppliers/viewsPreview';
import type {
  SavedView,
  ViewFilter,
  ViewOrder,
  ViewOrderPin,
  ViewSort,
} from '@/pages/suppliers/savedViews';
import type { Supplier } from '@/pages/suppliers/supplierStore';

/** L'APERÇU DE LA SAUVEGARDE COMPLÈTE — ce que le fichier repose vraiment :
 *  les fiches fournisseurs, les pastilles gardées et les seuils du carnet.
 *  Rien n'est appliqué tant que ce tableau n'a pas été validé. */

export type CarnetField = 'lead' | 'leadRef' | 'sort' | 'filter' | 'order' | 'orderPin' | 'lastView';

export type CarnetChange = {
  field: CarnetField;
  before: string | number;
  after: string | number;
};

export type CarnetPreview = {
  /** Les fiches portées par le fichier, comptées une à une. */
  supplierTotal: number;
  supplierNew: number;
  supplierUpdated: number;
  supplierSame: number;
  /** Les pastilles, lues par le même aperçu que l'import des vues. */
  views: ViewsPreview;
  settings: CarnetChange[];
  /** Tout ce que la restauration changerait, seuils compris. */
  actions: number;
};

export type CarnetContext = {
  suppliers: Supplier[];
  views: SavedView[];
  settings: CarnetSettings;
};

/** Deux fiches se ressemblent quand elles portent les mêmes conditions et le
 *  même état : c'est ce qui permet de dire « identique » sans bruit. */
function sameSupplier(a: Supplier, b: Supplier): boolean {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    a.country.trim() === b.country.trim() &&
    a.email.trim() === b.email.trim() &&
    a.leadDays === b.leadDays &&
    a.moq === b.moq &&
    a.unitPrice === b.unitPrice &&
    a.followUp === b.followUp &&
    a.note.trim() === b.note.trim() &&
    a.lastContact === b.lastContact &&
    a.scenarioIds.join(',') === b.scenarioIds.join(',')
  );
}

function settingsChanges(
  incoming: CarnetSettings,
  current: CarnetSettings,
): CarnetChange[] {
  const changes: CarnetChange[] = [];
  if (incoming.lead !== current.lead) {
    changes.push({ field: 'lead', before: current.lead, after: incoming.lead });
  }
  if (incoming.leadRef !== current.leadRef) {
    changes.push({ field: 'leadRef', before: current.leadRef, after: incoming.leadRef });
  }
  if (incoming.sort !== current.sort) {
    changes.push({ field: 'sort', before: current.sort, after: incoming.sort });
  }
  if (incoming.filter !== current.filter) {
    changes.push({ field: 'filter', before: current.filter, after: incoming.filter });
  }
  if (incoming.order !== current.order) {
    changes.push({ field: 'order', before: current.order, after: incoming.order });
  }
  if (incoming.orderPin !== current.orderPin) {
    changes.push({ field: 'orderPin', before: current.orderPin, after: incoming.orderPin });
  }
  if (incoming.lastView !== current.lastView) {
    changes.push({ field: 'lastView', before: current.lastView, after: incoming.lastView });
  }
  return changes;
}

export function previewCarnet(data: ParsedCarnet, ctx: CarnetContext): CarnetPreview {
  const seats = new Map<string, Supplier>();
  ctx.suppliers.forEach((supplier) => {
    seats.set(supplier.name.trim().toLowerCase(), supplier);
  });

  let supplierNew = 0;
  let supplierUpdated = 0;
  let supplierSame = 0;
  data.suppliers.forEach((supplier) => {
    const before = seats.get(supplier.name.trim().toLowerCase());
    if (!before) {
      supplierNew += 1;
      return;
    }
    if (sameSupplier(before, supplier)) supplierSame += 1;
    else supplierUpdated += 1;
  });

  const views = previewViews(data.views, ctx.views);
  const settings = data.settings ? settingsChanges(data.settings, ctx.settings) : [];
  const actions =
    supplierNew +
    supplierUpdated +
    views.added +
    views.updated +
    settings.length;

  return {
    supplierTotal: data.suppliers.length,
    supplierNew,
    supplierUpdated,
    supplierSame,
    views,
    settings,
    actions,
  };
}

/** LA RESTAURATION DES FICHES — un nom déjà présent garde sa place et son
 *  identifiant, le fichier remet ses conditions à jour ; les inconnues
 *  arrivent à la suite, jamais par-dessus une fiche d'un autre nom. */
export function mergeCarnetSuppliers(
  imported: Supplier[],
  current: Supplier[],
): { list: Supplier[]; added: number; updated: number } {
  const next = [...current];
  const seats = new Map<string, number>();
  next.forEach((supplier, index) => {
    seats.set(supplier.name.trim().toLowerCase(), index);
  });
  const ids = new Set(next.map((supplier) => supplier.id));
  let added = 0;
  let updated = 0;

  imported.forEach((supplier) => {
    const key = supplier.name.trim().toLowerCase();
    const seat = seats.get(key);
    if (seat !== undefined) {
      next[seat] = { ...supplier, id: next[seat].id };
      updated += 1;
      return;
    }
    /* Un identifiant déjà pris ailleurs : la fiche repart sur un neuf plutôt
       que d'écraser la voisine. */
    const id = ids.has(supplier.id)
      ? `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      : supplier.id;
    next.push({ ...supplier, id });
    ids.add(id);
    seats.set(key, next.length - 1);
    added += 1;
  });

  return { list: next, added, updated };
}

/** Les libellés de tri et de filtre, pour dire un changement sans jargon. */
export type CarnetModes = {
  sort: Record<ViewSort, string>;
  filter: Record<ViewFilter, string>;
  order: Record<ViewOrder, string>;
  orderPin: Record<ViewOrderPin, string>;
};