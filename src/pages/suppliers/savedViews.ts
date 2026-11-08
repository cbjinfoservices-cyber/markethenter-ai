import { isComplete } from '@/pages/suppliers/supplierStore';
import type { Supplier } from '@/pages/suppliers/supplierStore';

/** Les vues gardées du carnet : un seuil de délai, un tri et un filtre
 *  rangés sous un nom, rappelés d'un seul clic. */

export type ViewFilter = 'all' | 'due' | 'todo' | 'unlinked';
export type ViewSort = 'name' | 'country' | 'lead';

export type SavedView = {
  id: string;
  name: string;
  /** Seuil de délai en jours, 0 quand la vue ne filtre pas sur le délai. */
  lead: number;
  sort: ViewSort;
  filter: ViewFilter;
  savedAt: number;
  /** Épinglée : la pastille reste en tête de liste, quoi qu'on enregistre
   *  ensuite. Une seule chose compte pour l'ordre, pas la date. */
  pinned: boolean;
  /** Rang parmi les épinglées : 1 en tête, 0 quand la vue n'est pas épinglée.
   *  C'est lui qui permet de les réordonner entre elles. */
  pinRank: number;
  /** Combien de fois la pastille a été rappelée : c'est ce compte qui ordonne
   *  la rangée quand on trie par « la plus utilisée ». */
  recalls: number;
  /** La dernière fois qu'elle a été rappelée, 0 quand elle ne l'a jamais été. */
  lastUsedAt: number;
};

const STORAGE_KEY = 'mh:suppliers:views';
export const VIEWS_EVENT = 'mh:suppliers:views:changed';
export const MAX_VIEWS = 8;
const MAX_NAME = 32;

function makeId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function readView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME) : '';
  if (name === '') return null;
  const lead = Number(entry.lead);
  const sort: ViewSort =
    entry.sort === 'country' || entry.sort === 'lead' ? entry.sort : 'name';
  const filter: ViewFilter =
    entry.filter === 'due' || entry.filter === 'todo' || entry.filter === 'unlinked'
      ? entry.filter
      : 'all';
  const savedAt = Number(entry.savedAt);
  const recalls = Number(entry.recalls);
  const lastUsedAt = Number(entry.lastUsedAt);
  return {
    id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : makeId(),
    name,
    lead: Number.isFinite(lead) && lead > 0 ? Math.min(400, Math.round(lead)) : 0,
    sort,
    filter,
    savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now(),
    pinned: entry.pinned === true,
    pinRank:
      entry.pinned === true && Number.isFinite(Number(entry.pinRank)) && Number(entry.pinRank) > 0
        ? Math.round(Number(entry.pinRank))
        : 0,
    recalls: Number.isFinite(recalls) && recalls > 0 ? Math.round(recalls) : 0,
    lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : 0,
  };
}

/** Donne à chaque épinglée un rang propre, 1, 2, 3… dans l'ordre d'affichage.
 *  Les anciennes vues enregistrées avant les rangs partent en fin de série. */
function normalizePins(list: SavedView[]): SavedView[] {
  const pinned = list
    .filter((view) => view.pinned)
    .sort((a, b) => {
      const rankA = a.pinRank > 0 ? a.pinRank : Number.MAX_SAFE_INTEGER;
      const rankB = b.pinRank > 0 ? b.pinRank : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.savedAt - b.savedAt;
    });
  const ranks = new Map<string, number>();
  pinned.forEach((view, index) => ranks.set(view.id, index + 1));
  return list.map((view) =>
    view.pinned ? { ...view, pinRank: ranks.get(view.id) ?? view.pinRank } : { ...view, pinRank: 0 },
  );
}

export function loadViews(): SavedView[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const out: SavedView[] = [];
    parsed.forEach((entry) => {
      const view = readView(entry);
      if (view) out.push(view);
    });
    return sortViews(normalizePins(out)).slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

/** Les épinglées d'abord, puis l'ordre d'enregistrement : une vue mise en
 *  avant le reste en tête sans réécrire les dates des autres. */
export function sortViews(list: SavedView[]): SavedView[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) {
      const rankA = a.pinRank > 0 ? a.pinRank : Number.MAX_SAFE_INTEGER;
      const rankB = b.pinRank > 0 ? b.pinRank : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
    }
    if (a.savedAt !== b.savedAt) return a.savedAt - b.savedAt;
    return a.name.localeCompare(b.name);
  });
}

function persistViews(list: SavedView[]): SavedView[] {
  const clean = sortViews(normalizePins(list)).slice(0, MAX_VIEWS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new Event(VIEWS_EVENT));
  } catch {
    /* stockage bloqué : la liste reste valable pour cette visite */
  }
  return clean;
}

/** Range la vue sous son nom. Un nom déjà pris remplace les réglages de la
 *  vue existante, sans créer de doublon. */
export function addView(input: {
  name: string;
  lead: number;
  sort: ViewSort;
  filter: ViewFilter;
}): SavedView[] {
  const list = loadViews();
  const name = input.name.trim().slice(0, MAX_NAME);
  if (name === '') return list;
  const lead = Number.isFinite(input.lead) && input.lead > 0
    ? Math.min(400, Math.round(input.lead))
    : 0;
  const index = list.findIndex((view) => view.name.toLowerCase() === name.toLowerCase());
  const entry: SavedView = {
    id: index >= 0 ? list[index].id : makeId(),
    name,
    lead,
    sort: input.sort,
    filter: input.filter,
    /* Un nom déjà pris garde sa date et son épinglage : on met à jour les
       réglages, pas la place de la pastille dans la liste. */
    savedAt: index >= 0 ? list[index].savedAt : Date.now(),
    pinned: index >= 0 ? list[index].pinned : false,
    pinRank: index >= 0 ? list[index].pinRank : 0,
    /* Le compte de rappels suit la vue, pas ses réglages. */
    recalls: index >= 0 ? list[index].recalls : 0,
    lastUsedAt: index >= 0 ? list[index].lastUsedAt : 0,
  };
  const next = index >= 0
    ? list.map((view, position) => (position === index ? entry : view))
    : [...list, entry];
  return persistViews(next);
}

export function removeView(id: string): SavedView[] {
  return persistViews(loadViews().filter((view) => view.id !== id));
}

/** ANNULER UN RETRAIT — la pastille revient exactement comme elle était :
 *  même nom, mêmes réglages, même épinglage et même rang. */
export type RestoreResult = {
  views: SavedView[];
  reason: 'ok' | 'full' | 'taken';
};

export function restoreView(view: SavedView): RestoreResult {
  const list = loadViews();
  if (list.some((item) => item.id === view.id)) return { views: list, reason: 'ok' };
  if (list.length >= MAX_VIEWS) return { views: list, reason: 'full' };
  const taken = list.some(
    (item) => item.name.toLowerCase() === view.name.toLowerCase(),
  );
  if (taken) return { views: list, reason: 'taken' };
  return { views: persistViews([...list, view]), reason: 'ok' };
}

/** TOUT RETIRER — la liste entière part d'un coup, et revient de la même
 *  façon qu'une seule pastille : rien n'est perdu tant que l'offre est là. */
export function removeAllViews(): SavedView[] {
  return persistViews([]);
}

/** RENDRE UNE SÉRIE — chaque pastille retrouve son nom, ses réglages, son
 *  épinglage et son rang. Les noms repris entre-temps et les places déjà
 *  prises sont comptés, jamais avalés en silence. */
export type RestoreManyResult = {
  views: SavedView[];
  restored: number;
  skipped: number;
  reason: 'ok' | 'full' | 'taken';
};

export function restoreViews(views: SavedView[]): RestoreManyResult {
  const current = loadViews();
  const next = [...current];
  const ids = new Set(next.map((view) => view.id));
  const names = new Set(next.map((view) => view.name.toLowerCase()));
  let restored = 0;
  let skipped = 0;
  let reason: 'ok' | 'full' | 'taken' = 'ok';
  views.forEach((view) => {
    if (ids.has(view.id)) {
      restored += 1;
      return;
    }
    if (next.length >= MAX_VIEWS) {
      skipped += 1;
      reason = 'full';
      return;
    }
    if (names.has(view.name.toLowerCase())) {
      skipped += 1;
      if (reason === 'ok') reason = 'taken';
      return;
    }
    next.push(view);
    ids.add(view.id);
    names.add(view.name.toLowerCase());
    restored += 1;
  });
  if (restored === 0) return { views: current, restored, skipped, reason };
  return { views: persistViews(next), restored, skipped, reason };
}

/** DUPLIQUER — une copie de la pastille, réglages identiques et nom distinct,
 *  pour n'avoir plus qu'un seul réglage à retoucher avant de la garder. */
export type DuplicateResult = {
  views: SavedView[];
  created: SavedView | null;
  reason: 'ok' | 'full' | 'missing';
};

export function duplicateView(id: string, suffix: string): DuplicateResult {
  const list = loadViews();
  const source = list.find((view) => view.id === id);
  if (!source) return { views: list, created: null, reason: 'missing' };
  if (list.length >= MAX_VIEWS) return { views: list, created: null, reason: 'full' };
  const base = `${source.name} · ${suffix.trim()}`.slice(0, MAX_NAME);
  const taken = (candidate: string) =>
    list.some((view) => view.name.toLowerCase() === candidate.toLowerCase());
  let name = base;
  let attempt = 2;
  while (taken(name)) {
    const tail = ` ${attempt}`;
    name = `${base.slice(0, MAX_NAME - tail.length)}${tail}`;
    attempt += 1;
  }
  const lastRank = list
    .filter((view) => view.pinned)
    .reduce((max, view) => Math.max(max, view.pinRank), 0);
  const copy: SavedView = {
    id: makeId(),
    name,
    lead: source.lead,
    sort: source.sort,
    filter: source.filter,
    savedAt: Date.now(),
    pinned: source.pinned,
    pinRank: source.pinned ? lastRank + 1 : 0,
    /* Une copie neuve n'a encore jamais été rappelée. */
    recalls: 0,
    lastUsedAt: 0,
  };
  return { views: persistViews([...list, copy]), created: copy, reason: 'ok' };
}

/** Épingle ou détache une vue : la pastille monte en tête de liste, ou
 *  retrouve sa place dans l'ordre d'enregistrement. */
export function togglePin(id: string): SavedView[] {
  const list = loadViews();
  const target = list.find((view) => view.id === id);
  if (!target) return list;
  const lastRank = list
    .filter((view) => view.pinned)
    .reduce((max, view) => Math.max(max, view.pinRank), 0);
  return persistViews(
    list.map((view) =>
      view.id === id
        ? { ...view, pinned: !view.pinned, pinRank: view.pinned ? 0 : lastRank + 1 }
        : view,
    ),
  );
}

/** Réordonne les épinglées entre elles : la pastille monte ou descend d'un
 *  cran sans être détachée, et son rang est réécrit à la suite. */
export function movePinned(id: string, direction: -1 | 1): SavedView[] {
  const list = loadViews();
  const pinned = list
    .filter((view) => view.pinned)
    .sort((a, b) => a.pinRank - b.pinRank);
  const index = pinned.findIndex((view) => view.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pinned.length) return list;
  const swapped = [...pinned];
  const buffer = swapped[index];
  swapped[index] = swapped[target];
  swapped[target] = buffer;
  const ranks = new Map<string, number>();
  swapped.forEach((view, position) => ranks.set(view.id, position + 1));
  return persistViews(
    list.map((view) =>
      view.pinned && ranks.has(view.id)
        ? { ...view, pinRank: ranks.get(view.id) ?? view.pinRank }
        : view,
    ),
  );
}

/** Le glisser-déposer : la pastille lâchée prend la place de celle qu'elle
 *  survole, les autres se resserrent. Aucune n'est détachée au passage. */
export function reorderPinned(draggedId: string, targetId: string): SavedView[] {
  const list = loadViews();
  if (draggedId === targetId) return list;
  const pinned = list
    .filter((view) => view.pinned)
    .sort((a, b) => a.pinRank - b.pinRank);
  const from = pinned.findIndex((view) => view.id === draggedId);
  const to = pinned.findIndex((view) => view.id === targetId);
  if (from < 0 || to < 0) return list;
  const reordered = [...pinned];
  const [held] = reordered.splice(from, 1);
  reordered.splice(to, 0, held);
  const ranks = new Map<string, number>();
  reordered.forEach((view, position) => ranks.set(view.id, position + 1));
  return persistViews(
    list.map((view) =>
      view.pinned && ranks.has(view.id)
        ? { ...view, pinRank: ranks.get(view.id) ?? view.pinRank }
        : view,
    ),
  );
}

/** Le délai le plus lent que porte une vue, calculé sans la rappeler :
 *  c'est ce chiffre qui permet de choisir la bonne pastille d'un coup d'œil.
 *  La recherche n'appartient pas à la vue, elle n'entre donc pas ici. */
/** La fiche entre-t-elle dans la vue ? Le seuil, le filtre et le tri de la
 *  vue, rien d'autre : la recherche n'appartient pas à la vue. */
function viewRetains(view: SavedView, supplier: Supplier): boolean {
  if (view.filter === 'due' && !supplier.followUp) return false;
  if (view.filter === 'todo' && isComplete(supplier)) return false;
  if (view.filter === 'unlinked' && supplier.scenarioIds.length > 0) return false;
  if (view.lead > 0 && supplier.leadDays <= view.lead) return false;
  return true;
}

export function slowestLeadOf(view: SavedView, suppliers: Supplier[]): number {
  let slowest = 0;
  suppliers.forEach((supplier) => {
    if (!viewRetains(view, supplier)) return;
    if (supplier.leadDays > slowest) slowest = supplier.leadDays;
  });
  return slowest;
}

/** Combien de fiches la vue retient, comptées sans la rappeler : le chiffre
 *  s'affiche à côté du délai le plus lent, sur la pastille. */
export function countInView(view: SavedView, suppliers: Supplier[]): number {
  let total = 0;
  suppliers.forEach((supplier) => {
    if (viewRetains(view, supplier)) total += 1;
  });
  return total;
}

/** REMETTRE LES COMPTEURS À ZÉRO — les pastilles, leurs réglages et leur
 *  épinglage ne bougent pas : seuls le nombre de rappels et la date du
 *  dernier usage repartent de zéro. */
export type RecallSnapshot = { id: string; recalls: number; lastUsedAt: number };

export function resetAllRecalls(): { views: SavedView[]; backup: RecallSnapshot[] } {
  const list = loadViews();
  const backup = list
    .filter((view) => view.recalls > 0 || view.lastUsedAt > 0)
    .map((view) => ({ id: view.id, recalls: view.recalls, lastUsedAt: view.lastUsedAt }));
  if (backup.length === 0) return { views: list, backup: [] };
  return {
    views: persistViews(list.map((view) => ({ ...view, recalls: 0, lastUsedAt: 0 }))),
    backup,
  };
}

/** LA GOMME D'UNE SEULE PASTILLE — le compteur de cette vue repart de zéro,
 *  sans toucher aux autres. Ses réglages, son épinglage, son rang et sa place
 *  dans la liste ne bougent pas d'un pouce. */
export function resetViewRecalls(id: string): {
  views: SavedView[];
  backup: RecallSnapshot[];
} {
  const list = loadViews();
  const target = list.find((view) => view.id === id);
  if (!target || (target.recalls === 0 && target.lastUsedAt === 0)) {
    return { views: list, backup: [] };
  }
  const backup: RecallSnapshot[] = [
    { id: target.id, recalls: target.recalls, lastUsedAt: target.lastUsedAt },
  ];
  return {
    views: persistViews(
      list.map((view) =>
        view.id === id ? { ...view, recalls: 0, lastUsedAt: 0 } : view,
      ),
    ),
    backup,
  };
}

/** Le retour arrière de la remise à zéro : chaque pastille retrouve son
 *  compte et sa date, rien d'autre ne change. */
export function restoreRecalls(backup: RecallSnapshot[]): SavedView[] {
  if (backup.length === 0) return loadViews();
  const seats = new Map<string, RecallSnapshot>();
  backup.forEach((entry) => seats.set(entry.id, entry));
  return persistViews(
    loadViews().map((view) => {
      const seat = seats.get(view.id);
      return seat
        ? { ...view, recalls: seat.recalls, lastUsedAt: seat.lastUsedAt }
        : view;
    }),
  );
}

/** Un nom déjà porté par une autre vue ? Le renommage s'arrête là :
 *  deux pastilles du même nom seraient impossibles à distinguer. */
export function isNameTaken(id: string, name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (needle === '') return false;
  return loadViews().some(
    (view) => view.id !== id && view.name.toLowerCase() === needle,
  );
}

/** Renomme une vue sur place : le seuil, le tri et le filtre qu'elle porte
 *  restent intacts, seul le nom change. */
export function renameView(id: string, name: string): SavedView[] {
  const trimmed = name.trim().slice(0, MAX_NAME);
  const list = loadViews();
  if (trimmed === '') return list;
  if (!list.some((view) => view.id === id)) return list;
  if (isNameTaken(id, trimmed)) return list;
  return persistViews(
    list.map((view) => (view.id === id ? { ...view, name: trimmed } : view)),
  );
}

/** Deux vues se ressemblent quand elles reposent exactement les mêmes
 *  réglages : le bouton de rappel s'allume alors. */
export function isSameView(
  view: SavedView,
  current: { lead: number; sort: ViewSort; filter: ViewFilter },
): boolean {
  return view.lead === current.lead && view.sort === current.sort && view.filter === current.filter;
}

/** UNE VUE IMPORTÉE — trois réglages et un nom, lus dans un fichier CSV
 *  exporté depuis un autre navigateur. */
export type ImportedView = {
  name: string;
  lead: number;
  sort: ViewSort;
  filter: ViewFilter;
  /** Le nombre de rappels lu dans le fichier, pour retrouver la même rangée
   *  « la plus utilisée » sur un autre navigateur. */
  recalls: number;
  /** La date du dernier usage, 0 quand le fichier n'en porte pas. */
  lastUsedAt: number;
  /** Le fichier porte-t-il les deux colonnes d'usage ? Un ancien export ne
   *  les a pas : il ne doit pas effacer les compteurs déjà tenus ici. */
  hasUsage: boolean;
  /** La pastille était-elle épinglée sur l'autre navigateur ? */
  pinned: boolean;
  /** Son rang parmi les épinglées, 0 quand elle ne l'était pas. */
  pinRank: number;
  /** Le fichier porte-t-il les colonnes d'épinglage ? Un ancien export ne
   *  les a pas : il ne détache alors aucune pastille déjà épinglée ici. */
  hasPin: boolean;
};

export type ImportResult = {
  views: SavedView[];
  added: number;
  updated: number;
  skipped: number;
};

/** Range une série de vues lues dans un CSV. Un nom déjà présent met à jour
 *  ses réglages sans perdre son épinglage ; les nouvelles pastilles arrivent
 *  à la suite, dans l'ordre du fichier, sans dépasser les huit places. */
export function mergeImportedViews(imported: ImportedView[]): ImportResult {
  const current = loadViews();
  const next = [...current];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  imported.forEach((entry, index) => {
    const name = entry.name.trim().slice(0, MAX_NAME);
    if (name === '') {
      skipped += 1;
      return;
    }
    const lead = Number.isFinite(entry.lead) && entry.lead > 0
      ? Math.min(400, Math.round(entry.lead))
      : 0;
    const recalls = Number.isFinite(entry.recalls) && entry.recalls > 0
      ? Math.round(entry.recalls)
      : 0;
    const lastUsedAt =
      Number.isFinite(entry.lastUsedAt) && entry.lastUsedAt > 0 ? entry.lastUsedAt : 0;
    const seat = next.findIndex((view) => view.name.toLowerCase() === name.toLowerCase());
    if (seat >= 0) {
      /* Le fichier fait foi pour l'usage aussi : c'est lui qui remet la
         rangée dans le même ordre sur ce navigateur. */
      next[seat] = {
        ...next[seat],
        lead,
        sort: entry.sort,
        filter: entry.filter,
        recalls: entry.hasUsage ? recalls : next[seat].recalls,
        lastUsedAt: entry.hasUsage ? lastUsedAt : next[seat].lastUsedAt,
        /* L'épinglage et le rang voyagent aussi : la pastille se remet à sa
           place exacte sur l'autre navigateur. */
        pinned: entry.hasPin ? entry.pinned : next[seat].pinned,
        pinRank: entry.hasPin
          ? entry.pinned
            ? entry.pinRank
            : 0
          : next[seat].pinRank,
      };
      updated += 1;
      return;
    }
    if (next.length >= MAX_VIEWS) {
      skipped += 1;
      return;
    }
    next.push({
      id: makeId(),
      name,
      lead,
      sort: entry.sort,
      filter: entry.filter,
      /* Les vues importées gardent l'ordre du fichier entre elles. */
      savedAt: Date.now() + index,
      pinned: entry.hasPin ? entry.pinned : false,
      pinRank: entry.hasPin && entry.pinned ? entry.pinRank : 0,
      recalls: entry.hasUsage ? recalls : 0,
      lastUsedAt: entry.hasUsage ? lastUsedAt : 0,
    });
    added += 1;
  });
  return { views: persistViews(next), added, updated, skipped };
}

/** LA DERNIÈRE VUE RAPPELÉE — le carnet se rouvre sur la même liste, sans
 *  avoir à retrouver la pastille à chaque visite. */
const LAST_KEY = 'mh:suppliers:lastView';

export function rememberLastView(id: string) {
  try {
    window.localStorage.setItem(LAST_KEY, id);
  } catch {
    /* stockage bloqué : la vue ne sera pas reposée à la prochaine visite */
  }
}

export function readLastViewId(): string {
  try {
    const stored = window.localStorage.getItem(LAST_KEY);
    return typeof stored === 'string' ? stored : '';
  } catch {
    return '';
  }
}

export function clearLastView() {
  try {
    window.localStorage.removeItem(LAST_KEY);
  } catch {
    /* stockage bloqué : rien à oublier */
  }
}

/** COMPTER LES RAPPELS — chaque pastille rappelée gagne un cran et retient
 *  l'instant du rappel. C'est ce compte qui ordonne la rangée quand on
 *  choisit « la plus utilisée », et la date qui s'affiche dans la bulle. */
export function noteViewUse(id: string): SavedView[] {
  const list = loadViews();
  if (!list.some((view) => view.id === id)) return list;
  return persistViews(
    list.map((view) =>
      view.id === id
        ? { ...view, recalls: view.recalls + 1, lastUsedAt: Date.now() }
        : view,
    ),
  );
}

/** L'ORDRE DE LA RANGÉE — l'ordre d'enregistrement, ou la plus utilisée
 *  d'abord. Les épinglées gardent la tête dans les deux cas. */
export type ViewOrder = 'saved' | 'used';
const ORDER_KEY = 'mh:suppliers:viewOrder';
/** L'ordre et l'épinglage ont changé : la rangée se remet à jour toute
 *  seule, même quand le changement vient d'une sauvegarde relue. */
export const VIEW_ORDER_EVENT = 'mh:suppliers:viewOrder:changed';

/** L'ÉPINGLAGE DANS LE TRI — « top » garde les épinglées en tête, « ignore »
 *  les classe à leur vraie place, par nombre de rappels. */
export type ViewOrderPin = 'top' | 'ignore';
const ORDER_PIN_KEY = 'mh:suppliers:viewOrderPin';

export function readViewOrder(): ViewOrder {
  try {
    return window.localStorage.getItem(ORDER_KEY) === 'used' ? 'used' : 'saved';
  } catch {
    return 'saved';
  }
}

export function writeViewOrder(order: ViewOrder) {
  try {
    window.localStorage.setItem(ORDER_KEY, order);
  } catch {
    /* stockage bloqué : l'ordre vaut pour cette visite */
  }
  window.dispatchEvent(new Event(VIEW_ORDER_EVENT));
}

/** L'épingleage compte-t-il encore quand on trie par usage ? */
export function readViewOrderPin(): ViewOrderPin {
  try {
    return window.localStorage.getItem(ORDER_PIN_KEY) === 'ignore' ? 'ignore' : 'top';
  } catch {
    return 'top';
  }
}

export function writeViewOrderPin(pin: ViewOrderPin) {
  try {
    window.localStorage.setItem(ORDER_PIN_KEY, pin);
  } catch {
    /* stockage bloqué : le réglage vaut pour cette visite */
  }
  window.dispatchEvent(new Event(VIEW_ORDER_EVENT));
}

/** Le tri par usage, épinglage ignoré : les huit pastilles sont classées
 *  uniquement sur leur nombre de rappels, la plus rappelée en tête. */
function orderByUseOnly(list: SavedView[]): SavedView[] {
  return [...list].sort((a, b) => {
    if (a.recalls !== b.recalls) return b.recalls - a.recalls;
    if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
    return a.savedAt - b.savedAt;
  });
}

export function orderViews(
  list: SavedView[],
  order: ViewOrder,
  pinMode: ViewOrderPin = 'top',
): SavedView[] {
  if (order === 'saved') return list;
  if (pinMode === 'ignore') return orderByUseOnly(list);
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    /* Les épinglées gardent leur rang : les flèches et le glisser-déposer
       restent lisibles, même quand la rangée est triée par usage. */
    if (a.pinned && b.pinned) {
      const rankA = a.pinRank > 0 ? a.pinRank : Number.MAX_SAFE_INTEGER;
      const rankB = b.pinRank > 0 ? b.pinRank : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.savedAt - b.savedAt;
    }
    if (a.recalls !== b.recalls) return b.recalls - a.recalls;
    if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
    return a.savedAt - b.savedAt;
  });
}

/** LE TOTAL DES RAPPELS — la somme de toutes les pastilles, d'un coup d'œil
 *  dans la rangée d'outils, sans ouvrir une seule bulle. */
export function totalRecalls(list: SavedView[]): number {
  return list.reduce((sum, view) => sum + view.recalls, 0);
}

/** TOUT ÉPINGLER — la rangée entière monte en tête d'un clic, dans l'ordre
 *  où elle est justement affichée : rien ne se retrouve sens dessus dessous. */
export function pinAllViews(displayed: SavedView[] = loadViews()): SavedView[] {
  const list = loadViews();
  const sequence = displayed.length === list.length ? displayed : list;
  const ranks = new Map<string, number>();
  sequence.forEach((view, index) => ranks.set(view.id, index + 1));
  return persistViews(
    list.map((view) => ({
      ...view,
      pinned: true,
      pinRank: ranks.get(view.id) ?? view.pinRank,
    })),
  );
}

/** TOUT DÉTACHER — les pastilles reprennent l'ordre d'enregistrement. */
export function unpinAllViews(): SavedView[] {
  return persistViews(
    loadViews().map((view) => ({ ...view, pinned: false, pinRank: 0 })),
  );
}