import { MAX_VIEWS } from '@/pages/suppliers/savedViews';
import type {
  ImportedView,
  SavedView,
  ViewFilter,
  ViewSort,
} from '@/pages/suppliers/savedViews';

/** L'APERÇU AVANT IMPORT — le fichier est lu, comparé au carnet, mais rien
 *  n'est encore appliqué. Chaque ligne dit ce qu'elle deviendrait : une
 *  pastille nouvelle, une pastille retouchée, une pastille identique, ou une
 *  ligne laissée de côté faute de place. */

export type PreviewField = 'lead' | 'sort' | 'filter' | 'recalls' | 'pinned' | 'pinRank';

export type PreviewChange = {
  field: PreviewField;
  /** Valeur avant, telle qu'elle est tenue dans le carnet. */
  before: string | number;
  /** Valeur après, telle que le fichier la repose. */
  after: string | number;
};

export type PreviewStatus = 'new' | 'update' | 'same' | 'full';

export type PreviewRow = {
  name: string;
  status: PreviewStatus;
  /** Les réglages que la ligne porterait une fois importée. */
  lead: number;
  sort: ViewSort;
  filter: ViewFilter;
  recalls: number;
  pinned: boolean;
  /** Ce qui change vraiment sur une vue déjà présente. */
  changes: PreviewChange[];
};

export type ViewsPreview = {
  rows: PreviewRow[];
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

export function previewViews(imported: ImportedView[], current: SavedView[]): ViewsPreview {
  const rows: PreviewRow[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  imported.forEach((entry) => {
    const name = entry.name.trim();
    if (name === '') return;
    const lead = Number.isFinite(entry.lead) && entry.lead > 0
      ? Math.min(400, Math.round(entry.lead))
      : 0;
    const recalls = Number.isFinite(entry.recalls) && entry.recalls > 0
      ? Math.round(entry.recalls)
      : 0;
    const pinned = entry.hasPin && entry.pinned;
    const seat = current.findIndex(
      (view) => view.name.toLowerCase() === name.toLowerCase(),
    );

    if (seat < 0) {
      /* Une pastille nouvelle n'entre que s'il reste une place : le compte
         se fait à mesure, comme le fera l'import. */
      if (current.length + added >= MAX_VIEWS) {
        skipped += 1;
        rows.push({
          name,
          status: 'full',
          lead,
          sort: entry.sort,
          filter: entry.filter,
          recalls,
          pinned,
          changes: [],
        });
        return;
      }
      added += 1;
      rows.push({
        name,
        status: 'new',
        lead,
        sort: entry.sort,
        filter: entry.filter,
        recalls,
        pinned,
        changes: [],
      });
      return;
    }

    const view = current[seat];
    const changes: PreviewChange[] = [];
    if (view.lead !== lead) {
      changes.push({ field: 'lead', before: view.lead, after: lead });
    }
    if (view.sort !== entry.sort) {
      changes.push({ field: 'sort', before: view.sort, after: entry.sort });
    }
    if (view.filter !== entry.filter) {
      changes.push({ field: 'filter', before: view.filter, after: entry.filter });
    }
    /* Un ancien fichier ne portait pas les colonnes d'usage : il ne doit pas
       effacer les compteurs tenus ici, l'aperçu n'en promet donc aucun. */
    if (entry.hasUsage && view.recalls !== recalls) {
      changes.push({ field: 'recalls', before: view.recalls, after: recalls });
    }
    if (entry.hasPin) {
      const pinRank = pinned ? entry.pinRank : 0;
      if (view.pinned !== pinned) {
        changes.push({
          field: 'pinned',
          before: view.pinned ? 1 : 0,
          after: pinned ? 1 : 0,
        });
      } else if (pinned && view.pinRank !== pinRank) {
        changes.push({ field: 'pinRank', before: view.pinRank, after: pinRank });
      }
    }

    if (changes.length === 0) {
      unchanged += 1;
      rows.push({
        name,
        status: 'same',
        lead,
        sort: entry.sort,
        filter: entry.filter,
        recalls: entry.hasUsage ? recalls : view.recalls,
        pinned,
        changes,
      });
      return;
    }

    updated += 1;
    rows.push({
      name,
      status: 'update',
      lead,
      sort: entry.sort,
      filter: entry.filter,
      recalls: entry.hasUsage ? recalls : view.recalls,
      pinned,
      changes,
    });
  });

  return { rows, added, updated, unchanged, skipped };
}