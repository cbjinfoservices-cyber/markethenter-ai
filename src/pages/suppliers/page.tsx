import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBackToTopShortcut } from '@/pages/home/useBackToTopShortcut';
import { loadScenarios } from '@/pages/home/calcModel';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
import { readComfort } from '@/pages/home/comfortPref';
import '@/pages/home/film.css';
import '@/pages/dashboard/dash.css';
/* Le plancher de contraste et la lecture confort des pages de travail. */
import '@/pages/home/workContrast.css';
import '@/pages/home/comfort.css';
import '@/pages/suppliers/suppliers.css';
import AccountMenu from '@/pages/home/components/AccountMenu';
import PageBurger from '@/pages/home/components/PageBurger';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import SupplierCard from '@/pages/suppliers/components/SupplierCard';
import SupplierDialog from '@/pages/suppliers/components/SupplierDialog';
import SavedViews from '@/pages/suppliers/components/SavedViews';
import ShortcutsHelp from '@/pages/suppliers/components/ShortcutsHelp';
import RestoreHistory from '@/pages/suppliers/components/RestoreHistory';
import { tallyCountries } from '@/pages/suppliers/countryTally';
import { slowestLeadOf, countInView, clearLastView, isSameView, loadViews, mergeImportedViews, movePinned, noteViewUse, orderViews, readLastViewId, readViewOrder, readViewOrderPin, rememberLastView, writeViewOrder, writeViewOrderPin, VIEWS_EVENT } from '@/pages/suppliers/savedViews';
import type { SavedView } from '@/pages/suppliers/savedViews';
import { useViewCycleShortcut } from '@/pages/suppliers/useViewCycleShortcut';
import { buildSuppliersCsv, suppliersFilename } from '@/pages/suppliers/supplierCsv';
import { buildCarnetJson, carnetJsonFilename, parseCarnetJson } from '@/pages/suppliers/carnetJson';
import type { ParsedCarnet } from '@/pages/suppliers/carnetJson';
import { mergeCarnetSuppliers, previewCarnet } from '@/pages/suppliers/carnetPreview';
import { noteRestore, readRestoreLog, removeRestore } from '@/pages/suppliers/restoreLog';
import type { RestoreRecord } from '@/pages/suppliers/restoreLog';
import { useBackupDrop } from '@/pages/suppliers/useBackupDrop';
import { useBackupShortcut } from '@/pages/suppliers/useBackupShortcut';
import { useHelpShortcut } from '@/pages/suppliers/useHelpShortcut';
import { useNewSupplierShortcut } from '@/pages/suppliers/useNewSupplierShortcut';
import { usePinReorderShortcut } from '@/pages/suppliers/usePinReorderShortcut';
import { useDeleteSupplierShortcut } from '@/pages/suppliers/useDeleteSupplierShortcut';
import type { CarnetChange, CarnetPreview } from '@/pages/suppliers/carnetPreview';
import { VIEW_FILTER_LABEL, VIEW_SORT_LABEL } from '@/pages/suppliers/viewsCsv';
import { supplierDraftOf } from '@/pages/suppliers/supplierDraft';
import { buildSuppliersSummary } from '@/pages/suppliers/supplierShare';
import type { SupplierDraft } from '@/pages/suppliers/supplierDraft';
import { downloadCsv } from '@/pages/home/calcExport';
import {
  SUPPLIERS_EVENT,
  createSupplier,
  isComplete,
  loadSuppliers,
  markContacted,
  persistSuppliers,
  removeSupplier,
  saveSupplier,
  setFollowUp,
  suppliersFromScenarios,
} from '@/pages/suppliers/supplierStore';
import type { Supplier } from '@/pages/suppliers/supplierStore';

type Filter = 'all' | 'due' | 'todo' | 'unlinked';
type SortMode = 'name' | 'country' | 'lead';
type Toast =
  | 'saved'
  | 'dated'
  | 'deleted'
  | 'exported'
  | 'exportFail'
  | 'imported'
  | 'importNone'
  | 'backup'
  | 'backupFail'
  | 'backupRestored'
  | 'backupBad'
  | 'restoreCleared'
  | 'restoreLineRemoved'
  | 'restored';

/** Le fichier de sauvegarde lu, mais pas encore reposé : l'aperçu dit ce
 *  qu'il changerait dans les fiches, les vues et les seuils. */
type CarnetPending = {
  file: string;
  data: ParsedCarnet;
  preview: CarnetPreview;
};

const SORT_KEY = 'mh:suppliers:sort';
const LEAD_KEY = 'mh:suppliers:leadMin';
/** Le seuil de référence, gardé même quand le filtre de délai est retiré. */
const LEAD_REF_KEY = 'mh:suppliers:leadRef';
/** Les seuils proposés d'un seul clic, à côté du champ libre. */
const LEAD_PRESETS = [15, 30, 45, 60];

/** Le seuil de délai revient à la prochaine visite. */
function readLeadMin(): number {
  try {
    const stored = Number(window.localStorage.getItem(LEAD_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.min(400, Math.round(stored)) : 0;
  } catch {
    return 0;
  }
}

/** Le seuil de référence : la dernière valeur posée, qui reste affichée en
 *  pastille sur les fiches les plus lentes même une fois le filtre retiré. */
function readLeadRef(): number {
  try {
    const stored = Number(window.localStorage.getItem(LEAD_REF_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.min(400, Math.round(stored)) : 0;
  } catch {
    return 0;
  }
}

function writeLeadRef(value: number) {
  try {
    if (value > 0) window.localStorage.setItem(LEAD_REF_KEY, String(value));
    else window.localStorage.removeItem(LEAD_REF_KEY);
  } catch {
    /* stockage bloqué : la pastille vaut pour cette visite */
  }
}

/** Le seuil porté par l'adresse (`?lead=45`) : c'est lui qui rouvre la vue
 *  telle qu'elle a été partagée. Absent de l'adresse, il ne dit rien. */
function leadFromUrl(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(400, Math.round(parsed));
}

/** Le tri choisi revient à la prochaine visite. */
function readSortMode(): SortMode {
  try {
    const stored = window.localStorage.getItem(SORT_KEY);
    return stored === 'country' || stored === 'lead' ? stored : 'name';
  } catch {
    return 'name';
  }
}

/** Le tri porté par l'adresse (`?sort=country`) : un lien partagé ouvre
 *  exactement le même ordre de fiches. */
function sortFromUrl(value: string | null): SortMode {
  return value === 'country' || value === 'lead' ? value : 'name';
}

/** Un lien du type `/fournisseurs?filter=due` ouvre le carnet déjà filtré. */
function filterFromUrl(value: string | null): Filter | null {
  return value === 'due' || value === 'todo' || value === 'unlinked' ? value : null;
}

/** Le carnet des fournisseurs : les contacts qu'on rappelle, les conditions
 *  qu'on a négociées, et les fiches d'achat qu'ils servent. */
export default function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';

  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  const [comfort] = useState<boolean>(() => readComfort());
  /* Le même seuil vert et la même terminaison que le sourcing : le message
     préparé porte exactement les chiffres de la feuille fournisseur. */
  const [goodFloor] = useGoodFloor();
  const [psychoRule] = usePsychoRule();
  /* La pastille « Relances dues » des autres pages amène ici sur la liste
     déjà filtrée. */
  const [searchParams, setSearchParams] = useSearchParams();
  /* Un lien partagé du type `/fournisseurs?lead=45` rouvre la vue filtrée. */
  const urlLead = leadFromUrl(searchParams.get('lead'));
  const urlSort = sortFromUrl(searchParams.get('sort'));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadSuppliers());
  const [filter, setFilter] = useState<Filter>(
    () => filterFromUrl(searchParams.get('filter')) ?? 'all',
  );
  const [sort, setSort] = useState<SortMode>(() =>
    searchParams.get('sort') !== null ? urlSort : readSortMode(),
  );
  /* Le seuil « délai supérieur à X jours » : 0 = pas de filtre. */
  const [leadMin, setLeadMin] = useState<number>(() => urlLead ?? readLeadMin());
  const [leadDraft, setLeadDraft] = useState<string>(() => {
    const initial = urlLead ?? readLeadMin();
    return initial > 0 ? String(initial) : '';
  });
  /* Le seuil de référence des pastilles : il survit au retrait du filtre. */
  const [leadRef, setLeadRef] = useState<number>(() => Math.max(urlLead ?? 0, readLeadRef()));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /* Le retour de la copie du lien et du résumé se lit sur les boutons. */
  const [linkState, setLinkState] = useState<'idle' | 'done' | 'fail'>('idle');
  const [summaryState, setSummaryState] = useState<'idle' | 'done' | 'fail'>('idle');
  /* Le nom de la vue reposée automatiquement à l'ouverture, pour pouvoir
     l'oublier d'un clic. */
  const [restoredFrom, setRestoredFrom] = useState('');
  /* Les vues gardées, relues ici pour le raccourci clavier. */
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadViews());
  /* « Vue 2/4 : Les lents Chine » — le retour du raccourci, effacé seul. */
  const [cycleNote, setCycleNote] = useState('');
  /* La sauvegarde complète choisie, en attente de confirmation. */
  const [carnetPending, setCarnetPending] = useState<CarnetPending | null>(null);
  /* Les trois dernières restaurations : fichier, instant et fiches reposées. */
  const [restores, setRestores] = useState<RestoreRecord[]>(() => readRestoreLog());
  /* Le récapitulatif des raccourcis, ouvert par le bouton ou le clavier. */
  const [helpOpen, setHelpOpen] = useState(false);
  /* La fiche sélectionnée au clavier : c'est elle qu'Alt + Suppr visera. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* La fiche en attente de confirmation, avant tout retrait. */
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  /* La fiche qui vient de partir par Alt + Suppr : l'offre de la remettre
     reste affichée le temps de revenir dessus. */
  const [removedSupplier, setRemovedSupplier] = useState<Supplier | null>(null);
  const carnetRef = useRef<HTMLInputElement | null>(null);

  /* L'adresse décrit la vue telle qu'elle est à l'écran : seuil de délai,
     filtre et tri. Un lien partagé s'ouvre donc à l'identique. */
  const writeView = (next: { lead?: number; sort?: SortMode; filter?: Filter }) => {
    const leadValue = next.lead !== undefined ? next.lead : leadMin;
    const sortValue = next.sort !== undefined ? next.sort : sort;
    const filterValue = next.filter !== undefined ? next.filter : filter;
    const params = new URLSearchParams(searchParams);
    if (leadValue > 0) params.set('lead', String(leadValue));
    else params.delete('lead');
    if (sortValue !== 'name') params.set('sort', sortValue);
    else params.delete('sort');
    if (filterValue !== 'all') params.set('filter', filterValue);
    else params.delete('filter');
    setSearchParams(params, { replace: true });
  };

  /* L'adresse suit le filtre choisi ici, pour que le lien copié et la
     navigation arrière retrouvent la même liste. */
  useEffect(() => {
    const next = filterFromUrl(searchParams.get('filter'));
    if (next !== null) setFilter(next);
  }, [searchParams]);

  /* La navigation arrière ramène aussi l'ordre de la liste. */
  useEffect(() => {
    if (searchParams.get('sort') === null) return;
    setSort(urlSort);
  }, [urlSort, searchParams]);

  const chooseSort = (mode: SortMode) => {
    setSort(mode);
    try {
      window.localStorage.setItem(SORT_KEY, mode);
    } catch {
      /* stockage bloqué : le tri vaut pour cette visite */
    }
    writeView({ sort: mode });
  };

  /* Le filtre part aussi dans l'adresse : le lien copié rouvre la même liste. */
  const chooseFilter = (key: Filter) => {
    setFilter(key);
    writeView({ filter: key });
  };

  /* Le seuil et sa mémoire, sans toucher à l'adresse : une vue gardée
     repose les trois réglages d'un seul coup, puis l'adresse suit. */
  const commitLead = (next: number) => {
    setLeadMin(next);
    setLeadDraft(next > 0 ? String(next) : '');
    /* La pastille garde le dernier seuil posé, même quand le filtre tombe. */
    if (next > 0) {
      setLeadRef(next);
      writeLeadRef(next);
    }
    try {
      if (next > 0) window.localStorage.setItem(LEAD_KEY, String(next));
      else window.localStorage.removeItem(LEAD_KEY);
    } catch {
      /* stockage bloqué : le seuil vaut pour cette visite */
    }
  };

  /* Le seuil de délai : 0 retire le filtre, une valeur le pose. Le seuil
     part aussi dans l'adresse, pour qu'un lien rouvre la même vue. */
  const setLeadFloor = (value: number) => {
    const next = Number.isFinite(value) && value > 0 ? Math.min(400, Math.round(value)) : 0;
    commitLead(next);
    writeView({ lead: next });
  };

  /* Une vue gardée repose son seuil, son tri et son filtre d'un seul clic.
     C'est elle qui sera reposée à la prochaine ouverture du carnet. */
  const applyView = (view: SavedView) => {
    /* Chaque rappel compte : c'est ce qui ordonne la rangée par usage et ce
       qui date le dernier passage dans la bulle. */
    noteViewUse(view.id);
    setFilter(view.filter);
    setSort(view.sort);
    try {
      window.localStorage.setItem(SORT_KEY, view.sort);
    } catch {
      /* stockage bloqué : le tri vaut pour cette visite */
    }
    commitLead(view.lead);
    writeView({ lead: view.lead, sort: view.sort, filter: view.filter });
    rememberLastView(view.id);
    setRestoredFrom('');
  };

  /* Alt + flèche : la pastille suivante ou précédente se repose d'elle-même.
     Quand la liste ne correspond à aucune vue, on entre par la première
     (ou la dernière, en remontant) — jamais par une vue au hasard. */
  const stepView = (direction: -1 | 1) => {
    /* L'ordre suivi est celui réellement affiché, tri d'usage et option
       d'épinglage comprises. */
    const ordered = orderViews(savedViews, readViewOrder(), readViewOrderPin());
    if (ordered.length === 0) {
      setCycleNote(t('home.suppliers.viewCycleEmpty'));
      return;
    }
    const seat = ordered.findIndex((view) =>
      isSameView(view, { lead: leadMin, sort, filter }),
    );
    const total = ordered.length;
    const next =
      seat < 0
        ? direction === 1
          ? 0
          : total - 1
        : (seat + direction + total) % total;
    const target = ordered[next];
    applyView(target);
    setCycleNote(
      t('home.suppliers.viewCycleNote', {
        name: target.name,
        index: next + 1,
        total,
      }),
    );
  };

  /* Alt + 1 à 8 : la pastille de ce rang se repose directement, sans
     traverser les autres vues. Le rang est celui de la liste à l'écran. */
  const pickView = (seat: number) => {
    const ordered = orderViews(savedViews, readViewOrder(), readViewOrderPin());
    const target = ordered[seat];
    if (!target) return;
    applyView(target);
    setCycleNote(
      t('home.suppliers.viewCycleNote', {
        name: target.name,
        index: seat + 1,
        total: ordered.length,
      }),
    );
  };

  useViewCycleShortcut(stepView, pickView);

  /* Alt + Maj + flèche : la vue épinglée affichée à l'écran monte ou descend
     d'un cran parmi les épinglées. C'est le même geste que les petites
     flèches de la pastille, mais sans la souris. */
  const nudgePinned = (direction: -1 | 1) => {
    const target = savedViews.find((view) =>
      isSameView(view, { lead: leadMin, sort, filter }),
    );
    if (!target) {
      setCycleNote(t('home.suppliers.pinMoveNone'));
      return;
    }
    if (!target.pinned) {
      setCycleNote(t('home.suppliers.pinMoveNotPinned', { name: target.name }));
      return;
    }
    const pinnedCount = savedViews.filter((view) => view.pinned).length;
    if (pinnedCount < 2) {
      setCycleNote(t('home.suppliers.pinMoveAlone', { name: target.name }));
      return;
    }
    setSavedViews(movePinned(target.id, direction));
    setCycleNote(t('home.suppliers.pinMoveDone', { name: target.name }));
  };

  usePinReorderShortcut(nudgePinned);

  /* Alt + B ouvre le sélecteur de sauvegarde sans passer par la souris. */
  useBackupShortcut(() => carnetRef.current?.click());

  /* Alt + N ouvre une fiche vierge sans lâcher le clavier. */
  useNewSupplierShortcut(() => setEditing(createSupplier()));

  /* La fiche sélectionnée au clavier, retrouvée dans le carnet. */
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedId) ?? null,
    [suppliers, selectedId],
  );

  /* RETIRER LA FICHE SÉLECTIONNÉE — Alt + Suppr demande d'abord, puis
     confirme au second appui. Rien ne part sans ce second geste. */
  const confirmDeleteSelected = () => {
    const target = pendingDelete;
    if (target === null) return;
    setSuppliers(removeSupplier(target.id));
    setPendingDelete(null);
    setSelectedId((prev) => (prev === target.id ? null : prev));
    /* La fiche retirée reste en mémoire : un clic la remet exactement comme
       elle était, avec son nom, sa note et ses fiches rattachées. */
    setRemovedSupplier(target);
    setToast('deleted');
  };

  /* REVENIR SUR UN Alt + Suppr — la fiche reprend sa place dans le carnet,
     et redevient la fiche sélectionnée au clavier. */
  const undoDeleteSelected = () => {
    const target = removedSupplier;
    if (target === null) return;
    setSuppliers(saveSupplier(target));
    setSelectedId(target.id);
    setRemovedSupplier(null);
    setToast('restored');
  };

  const askDeleteSelected = () => {
    if (pendingDelete !== null) {
      confirmDeleteSelected();
      return;
    }
    if (selectedSupplier === null) {
      setCycleNote(t('home.suppliers.deleteSelNone'));
      return;
    }
    setPendingDelete(selectedSupplier);
  };

  useDeleteSupplierShortcut(askDeleteSelected);

  /* Échap referme la confirmation sans rien retirer. */
  useEffect(() => {
    if (pendingDelete === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  /* Une fiche retirée ailleurs ne reste pas sélectionnée dans le vide. */
  useEffect(() => {
    if (selectedId === null) return;
    if (suppliers.some((supplier) => supplier.id === selectedId)) return;
    setSelectedId(null);
    setPendingDelete(null);
  }, [suppliers, selectedId]);

  /* Changer de vue retire la sélection : on ne vise jamais une fiche qui
     n'est plus à l'écran, et la confirmation ne peut pas rester en l'air. */
  useEffect(() => {
    setSelectedId(null);
    setPendingDelete(null);
  }, [filter, sort, leadMin, search]);

  /* La dernière vue rappelée se repose à l'ouverture, pour retrouver la même
     liste sans fouiller les pastilles. Un lien partagé garde la priorité :
     l'adresse décrit une vue précise, elle ne doit pas être écrasée. */
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current) return undefined;
    restoredOnce.current = true;
    const fromUrl =
      searchParams.get('lead') !== null ||
      searchParams.get('sort') !== null ||
      searchParams.get('filter') !== null;
    if (fromUrl) return undefined;
    const lastId = readLastViewId();
    if (lastId === '') return undefined;
    const view = loadViews().find((item) => item.id === lastId);
    if (!view) {
      clearLastView();
      return undefined;
    }
    setFilter(view.filter);
    setSort(view.sort);
    try {
      window.localStorage.setItem(SORT_KEY, view.sort);
    } catch {
      /* stockage bloqué : le tri vaut pour cette visite */
    }
    commitLead(view.lead);
    setRestoredFrom(view.name);
    const timer = window.setTimeout(() => setRestoredFrom(''), 8000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Un lien partagé, ou la navigation arrière, ramène le seuil de l'adresse. */
  useEffect(() => {
    if (urlLead === null) return;
    setLeadMin((prev) => (prev === urlLead ? prev : urlLead));
    setLeadDraft(urlLead > 0 ? String(urlLead) : '');
    if (urlLead > 0) {
      setLeadRef(urlLead);
      writeLeadRef(urlLead);
    }
  }, [urlLead]);

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  /* La liste suit le stockage : une fiche modifiée dans un autre onglet
     apparaît ici sans recharger la page. */
  useEffect(() => {
    const sync = () => setSuppliers(loadSuppliers());
    window.addEventListener(SUPPLIERS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SUPPLIERS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* L'offre de remettre la fiche retirée s'efface d'elle-même, après le
     temps de la lire et de cliquer. */
  useEffect(() => {
    if (removedSupplier === null) return undefined;
    const timer = window.setTimeout(() => setRemovedSupplier(null), 9000);
    return () => window.clearTimeout(timer);
  }, [removedSupplier]);

  /* La liste des pastilles suit le stockage : le raccourci clavier travaille
     toujours sur les vues réellement gardées. */
  useEffect(() => {
    const sync = () => setSavedViews(loadViews());
    window.addEventListener(VIEWS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(VIEWS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (cycleNote === '') return undefined;
    const timer = window.setTimeout(() => setCycleNote(''), 2600);
    return () => window.clearTimeout(timer);
  }, [cycleNote]);

  useBackToTopShortcut();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /* Les scénarios du calculateur, lus une fois : ils donnent les fiches
     auxquelles rattacher un fournisseur. */
  const scenarios = useMemo(
    () =>
      loadScenarios().map((scenario, index) => ({
        id: scenario.id,
        name:
          scenario.name.trim() !== ''
            ? scenario.name.trim()
            : `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers.length, lang],
  );

  const scenarioNames = useMemo(() => {
    const map: Record<number, string> = {};
    scenarios.forEach((scenario) => {
      map[scenario.id] = scenario.name;
    });
    return map;
  }, [scenarios]);

  const counts = useMemo(() => {
    let due = 0;
    let complete = 0;
    let linked = 0;
    suppliers.forEach((supplier) => {
      if (supplier.followUp) due += 1;
      if (isComplete(supplier)) complete += 1;
      if (supplier.scenarioIds.length > 0) linked += 1;
    });
    return { due, complete, linked, total: suppliers.length };
  }, [suppliers]);

  /* Relances dues d'abord, puis les noms dans l'ordre de l'alphabet local. */
  const visible = useMemo(() => {
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    const needle = search.trim().toLowerCase();
    const list = suppliers.filter((supplier) => {
      if (filter === 'due' && !supplier.followUp) return false;
      if (filter === 'todo' && isComplete(supplier)) return false;
      if (filter === 'unlinked' && supplier.scenarioIds.length > 0) return false;
      /* Le seuil de délai : on ne garde que les plus lents que X jours.
         Les fiches sans délai renseigné n'ont pas de rang, elles sortent. */
      if (leadMin > 0 && supplier.leadDays <= leadMin) return false;
      if (needle === '') return true;
      return (
        supplier.name.toLowerCase().includes(needle) ||
        supplier.country.toLowerCase().includes(needle) ||
        supplier.email.toLowerCase().includes(needle) ||
        supplier.note.toLowerCase().includes(needle)
      );
    });
    return list.sort((a, b) => {
      /* Les plus lents d'abord : c'est tout l'intérêt du tri par délai, donc
         la relance ne passe pas devant — les fiches dues gardent leur
         pastille et le filtre « Relance due » reste à un clic. */
      if (sort === 'lead') {
        const leadA = a.leadDays > 0 ? a.leadDays : -1;
        const leadB = b.leadDays > 0 ? b.leadDays : -1;
        if (leadA !== leadB) return leadB - leadA;
        return collator.compare(a.name, b.name);
      }
      /* Par pays, les pays sans réponse à la fin : ils n'ont pas de rang. */
      if (sort === 'country') {
        const countryA = a.country.trim() === '' ? '\uffff' : a.country.trim();
        const countryB = b.country.trim() === '' ? '\uffff' : b.country.trim();
        const byCountry = collator.compare(countryA, countryB);
        if (byCountry !== 0) return byCountry;
        return collator.compare(a.name, b.name);
      }
      if (a.followUp !== b.followUp) return a.followUp ? -1 : 1;
      return collator.compare(a.name, b.name);
    });
  }, [suppliers, filter, search, sort, locale, leadMin]);

  /* Combien de fiches dépassent le seuil, indépendamment des autres filtres. */
  const leadAboveCount = useMemo(
    () => (leadMin > 0 ? suppliers.filter((item) => item.leadDays > leadMin).length : 0),
    [suppliers, leadMin],
  );

  /* Les fiches par pays, en tête de liste : où sont vraiment les fournisseurs.
     Comptées sur la vue filtrée mais sans la recherche, pour qu'on puisse
     passer d'un pays à l'autre sans que la liste des pastilles fonde. */
  const countries = useMemo(() => {
    const list = suppliers.filter((supplier) => {
      if (filter === 'due' && !supplier.followUp) return false;
      if (filter === 'todo' && isComplete(supplier)) return false;
      if (filter === 'unlinked' && supplier.scenarioIds.length > 0) return false;
      if (leadMin > 0 && supplier.leadDays <= leadMin) return false;
      return true;
    });
    return tallyCountries(list);
  }, [suppliers, filter, leadMin]);

  /* La ligne « 4 Chine · 2 France » du résumé copié : elle décrit les fiches
     réellement à l'écran, recherche comprise. */
  const summaryCountries = useMemo(() => {
    if (visible.length === 0) return '';
    return tallyCountries(visible)
      .map(
        (entry) =>
          `${entry.count} ${entry.unknown ? t('home.suppliers.tallyUnknown') : entry.key}`,
      )
      .join(' · ');
  }, [visible, t]);

  /* La phrase d'accroche de la vue, partagée par le résumé copié et par le
     fichier CSV : les deux racontent exactement la même chose. */
  const viewTitle = useMemo(() => {
    const many = visible.length > 1;
    let titleKey = many ? 'home.suppliers.summaryTitle' : 'home.suppliers.summaryTitleOne';
    if (leadMin > 0) {
      titleKey = many ? 'home.suppliers.summaryTitleLead' : 'home.suppliers.summaryTitleLeadOne';
    } else if (filter === 'due') {
      titleKey = many ? 'home.suppliers.summaryTitleDue' : 'home.suppliers.summaryTitleDueOne';
    } else if (filter === 'todo' || filter === 'unlinked') {
      titleKey = many
        ? 'home.suppliers.summaryTitleFiltered'
        : 'home.suppliers.summaryTitleFilteredOne';
    } else if (sort === 'lead') {
      titleKey = many ? 'home.suppliers.summaryTitleSlow' : 'home.suppliers.summaryTitleSlowOne';
    }
    return t(titleKey, { count: visible.length, value: leadMin });
  }, [visible.length, leadMin, filter, sort, t]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    [locale],
  );

  /* La date de la dernière restauration, avec l'heure : on retrouve le
     fichier relu et le moment exact du retour du carnet. */
  const restoreFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  /* Copier le lien : la vue telle qu'elle est à l'écran, seuil, filtre et tri
     compris, pour la partager sans repasser par la barre d'adresse. */
  const copyViewLink = async () => {
    const params = new URLSearchParams();
    if (leadMin > 0) params.set('lead', String(leadMin));
    if (sort !== 'name') params.set('sort', sort);
    if (filter !== 'all') params.set('filter', filter);
    const query = params.toString();
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(url);
      setLinkState('done');
    } catch {
      setLinkState('fail');
    }
    window.setTimeout(() => setLinkState('idle'), 2400);
  };

  /* Copier le résumé : nom, pays, délai et adresse de chaque fiche affichée,
     en un bloc prêt à coller dans WhatsApp. La phrase d'accroche dit ce que
     la vue a de particulier — les plus lents, les relances, le tri. */
  const copySummary = async () => {
    if (visible.length === 0) return;
    const text = buildSuppliersSummary(visible, {
      title: viewTitle,
      when: dateFmt.format(new Date()),
      countries: summaryCountries,
      noCountry: t('home.suppliers.unknown'),
      noLead: t('home.suppliers.summaryNoLead'),
      noEmail: t('home.suppliers.summaryNoEmail'),
      lead: (value: number) => t('home.suppliers.summaryLead', { value }),
    });
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      setSummaryState('done');
    } catch {
      setSummaryState('fail');
    }
    window.setTimeout(() => setSummaryState('idle'), 2400);
  };

  /* Le message type du sourcing, préparé fiche par fiche. */
  const drafts = useMemo(() => {
    const raw = loadScenarios();
    const names: Record<number, string> = {};
    scenarios.forEach((scenario) => {
      names[scenario.id] = scenario.name;
    });
    const map: Record<string, SupplierDraft | null> = {};
    suppliers.forEach((supplier) => {
      map[supplier.id] = supplierDraftOf(
        supplier,
        raw,
        names,
        goodFloor,
        psychoRule,
        locale,
      );
    });
    return map;
  }, [suppliers, scenarios, goodFloor, psychoRule, locale]);

  const exportCsv = () => {
    if (visible.length === 0) return;
    /* La ligne des pays part en tête du fichier, comme dans le résumé
       copié : l'export raconte la même chose que WhatsApp. */
    const csv = buildSuppliersCsv(
      visible,
      locale,
      t,
      scenarioNames,
      dateFmt,
      summaryCountries,
      viewTitle,
    );
    setToast(downloadCsv(suppliersFilename(), csv) ? 'exported' : 'exportFail');
  };

  /* LA SAUVEGARDE COMPLÈTE — un seul fichier JSON avec les fiches, les vues
     et les seuils du carnet, de quoi tout retrouver ailleurs. */
  const exportBackup = () => {
    const json = buildCarnetJson({
      suppliers,
      views: loadViews(),
      settings: {
        lead: leadMin,
        leadRef,
        sort,
        filter,
        order: readViewOrder(),
        orderPin: readViewOrderPin(),
        lastView: readLastViewId(),
      },
    });
    setToast(downloadCsv(carnetJsonFilename(), json) ? 'backup' : 'backupFail');
  };

  /** Les seuils du carnet, tels qu'ils sont à l'écran : c'est cette photo
   *  qu'on compare au fichier avant de reposer quoi que ce soit. */
  const carnetSettings = () => ({
    lead: leadMin,
    leadRef,
    sort,
    filter,
    order: readViewOrder(),
    orderPin: readViewOrderPin(),
    lastView: readLastViewId(),
  });

  /* RELIRE LA SAUVEGARDE — le fichier est lu et comparé au carnet, mais rien
     n'est reposé tant que l'aperçu n'a pas été validé. */
  const readBackup = async (file: File) => {
    let text = '';
    try {
      text = await file.text();
    } catch {
      setToast('backupBad');
      return;
    }
    const data = parseCarnetJson(text);
    if (data === null) {
      setToast('backupBad');
      return;
    }
    setCarnetPending({
      file: file.name,
      data,
      preview: previewCarnet(data, {
        suppliers,
        views: loadViews(),
        settings: carnetSettings(),
      }),
    });
  };

  /* RESTAURER — c'est ici, et seulement ici, que fiches, vues et seuils
     reviennent d'un coup. */
  const restoreBackup = () => {
    if (carnetPending === null) return;
    const { data, file } = carnetPending;
    const merged = mergeCarnetSuppliers(data.suppliers, suppliers);
    const restored = merged.added + merged.updated;
    /* Les pastilles reposées sont comptées à part : une vue déjà identique
       ne revient pas, elle n'est donc pas annoncée. */
    let viewsReposed = 0;
    setSuppliers(persistSuppliers(merged.list));
    if (data.views.length > 0) {
      const result = mergeImportedViews(data.views);
      viewsReposed = result.added + result.updated;
      setSavedViews(result.views);
    }
    if (data.settings !== null) {
      const settings = data.settings;
      setFilter(settings.filter);
      setSort(settings.sort);
      try {
        window.localStorage.setItem(SORT_KEY, settings.sort);
      } catch {
        /* stockage bloqué : le tri vaut pour cette visite */
      }
      commitLead(settings.lead);
      setLeadRef(settings.leadRef);
      writeLeadRef(settings.leadRef);
      writeViewOrder(settings.order);
      writeViewOrderPin(settings.orderPin);
      if (settings.lastView !== '') rememberLastView(settings.lastView);
      else clearLastView();
      writeView({ lead: settings.lead, sort: settings.sort, filter: settings.filter });
    }
    /* L'historique sous les boutons garde le fichier, l'instant et les
       fiches reposées : trois lignes au plus, la plus récente en tête. */
    setRestores(noteRestore(file, restored, viewsReposed));
    setToast('backupRestored');
    setCarnetPending(null);
  };

  /* Le même raccourci d'aide que la page : Alt + H ou « ? » ouvre et
     referme le récapitulatif, Échap le referme sans rien toucher. */
  useHelpShortcut(
    () => setHelpOpen((prev) => !prev),
    () => setHelpOpen(false),
  );

  /* RETIRER UNE SEULE LIGNE — l'historique se vide ligne par ligne : celle
     qu'on écarte part seule, les autres restent en place. */
  const dropRestoreLine = (at: number) => {
    setRestores(removeRestore(at));
    setToast('restoreLineRemoved');
  };

  /* Un fichier de sauvegarde glissé n'importe où sur la page ouvre le même
     aperçu que le bouton : rien n'est reposé avant la confirmation. */
  const dropActive = useBackupDrop(readBackup);

  /** Le nom d'une vue, retrouvé depuis son identifiant : c'est lui qui
   *  s'affiche dans l'aperçu, jamais la clé technique. */
  const viewNameOf = (id: string | number): string => {
    const found = loadViews().find((view) => view.id === id);
    return found ? found.name : '';
  };

  /** Un seuil du fichier, dit en clair et dans la langue de la page. */
  const carnetChangeText = (change: CarnetChange): string => {
    const none = t('home.suppliers.viewPreviewNone');
    const days = (value: string | number) => (Number(value) > 0 ? `${value}` : none);
    if (change.field === 'lead' || change.field === 'leadRef') {
      return t('home.suppliers.viewPreviewLead', {
        before: days(change.before),
        after: days(change.after),
      });
    }
    if (change.field === 'sort') {
      return t('home.suppliers.viewPreviewSort', {
        before: t(VIEW_SORT_LABEL[change.before as SortMode]),
        after: t(VIEW_SORT_LABEL[change.after as SortMode]),
      });
    }
    if (change.field === 'filter') {
      return t('home.suppliers.viewPreviewFilter', {
        before: t(VIEW_FILTER_LABEL[change.before as Filter]),
        after: t(VIEW_FILTER_LABEL[change.after as Filter]),
      });
    }
    if (change.field === 'order') {
      return t('home.suppliers.viewPreviewOrder', {
        order: t(
          change.after === 'used'
            ? 'home.suppliers.viewOrderUsed'
            : 'home.suppliers.viewOrderSaved',
        ),
      });
    }
    if (change.field === 'orderPin') {
      return t('home.suppliers.viewPreviewOrderPin', {
        mode: t(
          change.after === 'ignore'
            ? 'home.suppliers.viewOrderPinIgnore'
            : 'home.suppliers.viewOrderPinTop',
        ),
      });
    }
    const name = viewNameOf(change.after);
    return t('home.suppliers.carnetPreviewLastView', {
      name: name !== '' ? `« ${name} »` : none,
    });
  };

  const pullFromScenarios = () => {
    const seeds = suppliersFromScenarios();
    if (seeds.length === 0) {
      setToast('importNone');
      return;
    }
    const known = new Set(suppliers.map((supplier) => supplier.name.trim().toLowerCase()));
    const added = seeds.filter((seed) => !known.has(seed.name.trim().toLowerCase()));
    if (added.length === 0) {
      setToast('importNone');
      return;
    }
    setSuppliers(persistSuppliers([...suppliers, ...added]));
    setToast('imported');
  };

  const { items: burgerItems } = useSiteNavigation();

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('home.suppliers.filterAll'), count: counts.total },
    { key: 'due', label: t('home.suppliers.filterDue'), count: counts.due },
    {
      key: 'todo',
      label: t('home.suppliers.filterTodo'),
      count: counts.total - counts.complete,
    },
    {
      key: 'unlinked',
      label: t('home.suppliers.filterUnlinked'),
      count: counts.total - counts.linked,
    },
  ];

  const sortOptions: { key: SortMode; label: string; hint: string; icon: string }[] = [
    {
      key: 'name',
      label: t('home.suppliers.sortName'),
      hint: t('home.suppliers.sortNameHint'),
      icon: 'ri-user-line',
    },
    {
      key: 'country',
      label: t('home.suppliers.sortCountry'),
      hint: t('home.suppliers.sortCountryHint'),
      icon: 'ri-earth-line',
    },
    {
      key: 'lead',
      label: t('home.suppliers.sortLead'),
      hint: t('home.suppliers.sortLeadHint'),
      icon: 'ri-hourglass-line',
    },
  ];

  /* Le délai le plus long de la liste affichée : le premier du tri par délai. */
  const slowestLead = useMemo(() => {
    if (sort !== 'lead') return 0;
    return visible.reduce((max, supplier) => Math.max(max, supplier.leadDays), 0);
  }, [sort, visible]);

  return (
    <div className="dash-page sup-page" data-dash-skin={skin} data-comfort={comfort ? 'on' : 'off'}>
      <header className="dash-nav">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="dash-nav-links" aria-label={t('home.suppliers.navLabel')}>
          <SiteNavigationLinks items={burgerItems} />
        </nav>
        <div className="nav-right">
          <button
            type="button"
            className={`dash-skin${skin === 'light' ? ' is-on' : ''}`}
            onClick={() => setSkin((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-pressed={skin === 'light'}
            title={t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}
          >
            <i
              className={skin === 'light' ? 'ri-moon-clear-line' : 'ri-sun-line'}
              aria-hidden="true"
            />
            <span>{t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}</span>
          </button>
          <AccountMenu />
          <PageBurger items={burgerItems} />
        </div>
      </header>

      <main className="dash">
        <section className="dash-hero sup-hero">
          <div className="dash-hero-copy">
            <p className="stamp">{t('home.suppliers.stamp')}</p>
            <h1>{t('home.suppliers.title')}</h1>
            <p className="dash-sub">{t('home.suppliers.intro')}</p>
            <div className="dash-hero-actions">
              <button type="button" className="btn" onClick={() => setEditing(createSupplier())}>
                <i className="ri-add-line" aria-hidden="true" />
                {t('home.suppliers.add')}
              </button>
              <button
                type="button"
                className="btn sup-btn-ghost"
                onClick={exportCsv}
                disabled={visible.length === 0}
              >
                <i className="ri-file-excel-2-line" aria-hidden="true" />
                {t('home.suppliers.export')}
              </button>
              <button
                type="button"
                className="btn sup-btn-ghost"
                onClick={exportBackup}
                title={t('home.suppliers.backupHint')}
              >
                <i className="ri-archive-2-line" aria-hidden="true" />
                {t('home.suppliers.backup')}
              </button>
              <input
                ref={carnetRef}
                type="file"
                accept=".json,application/json"
                className="sup-view-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readBackup(file);
                }}
              />
              <button
                type="button"
                className="btn sup-btn-ghost"
                onClick={() => carnetRef.current?.click()}
                title={`${t('home.suppliers.backupRestoreHint')} ${t(
                  'home.suppliers.backupRestoreKeys',
                )}`}
              >
                <i className="ri-archive-drawer-line" aria-hidden="true" />
                {t('home.suppliers.backupRestore')}
              </button>
              <button
                type="button"
                className="btn sup-btn-ghost sup-help-btn"
                onClick={() => setHelpOpen(true)}
                title={t('home.suppliers.shortcutsHint')}
                aria-haspopup="dialog"
              >
                <i className="ri-keyboard-line" aria-hidden="true" />
                {t('home.suppliers.shortcutsBtn')}
              </button>
            </div>
            <p className="sup-restore-keys">
              <kbd>Alt</kbd>
              <kbd>B</kbd>
              {t('home.suppliers.backupRestoreKeys')}
              <span className="sup-restore-keys-sep" aria-hidden="true">
                ·
              </span>
              <kbd>Alt</kbd>
              <kbd>N</kbd>
              {t('home.suppliers.newKeys')}
              <span className="sup-restore-keys-sep" aria-hidden="true">
                ·
              </span>
              <kbd>Alt</kbd>
              <kbd>H</kbd>
              {t('home.suppliers.shortcutsOpenKeys')}
              <span className="sup-restore-keys-sep" aria-hidden="true">
                ·
              </span>
              <kbd>Alt</kbd>
              <kbd>{t('home.suppliers.keyDelete')}</kbd>
              {t('home.suppliers.deleteSelKeys')}
            </p>
            {restores.length > 0 && (
              <RestoreHistory
                records={restores}
                onRemove={dropRestoreLine}
                format={(date) => restoreFmt.format(date)}
              />
            )}
          </div>

          <div className="dash-readout sup-readout">
            <span className="dash-readout-lab">{t('home.suppliers.readLab')}</span>
            <b className="sup-readout-value">{counts.total}</b>
            <span className="dash-readout-name">{t('home.suppliers.readUnit')}</span>
            <div className="dash-readout-grid">
              <div>
                <span>{t('home.suppliers.readDue')}</span>
                <b className={counts.due > 0 ? 'is-due' : undefined}>{counts.due}</b>
              </div>
              <div>
                <span>{t('home.suppliers.readComplete')}</span>
                <b>
                  {counts.complete}/{counts.total}
                </b>
              </div>
              <div>
                <span>{t('home.suppliers.readLinked')}</span>
                <b>
                  {counts.linked}/{counts.total}
                </b>
              </div>
            </div>
            <span className="dash-readout-note">{t('home.suppliers.readNote')}</span>
          </div>
        </section>

        <section className="dash-section" id="suppliers">
          <div className="dash-section-head">
            <h2>{t('home.suppliers.listTitle')}</h2>
            <p>{t('home.suppliers.listIntro')}</p>
          </div>

          <div className="sup-tools">
            <div className="sup-search">
              <i className="ri-search-line" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('home.suppliers.searchPh')}
                aria-label={t('home.suppliers.searchAria')}
                className="sup-search-input"
              />
              {search !== '' && (
                <button
                  type="button"
                  className="sup-search-x"
                  onClick={() => setSearch('')}
                  aria-label={t('home.suppliers.searchClear')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="sup-filters" role="group" aria-label={t('home.suppliers.filterLab')}>
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`sup-filter${filter === item.key ? ' is-on' : ''}`}
                  onClick={() => chooseFilter(item.key)}
                  aria-pressed={filter === item.key}
                >
                  {item.label}
                  <span className="sup-filter-count">{item.count}</span>
                </button>
              ))}
            </div>

            <div className="sup-sort" role="group" aria-label={t('home.suppliers.sortLab')}>
              <span className="sup-sort-lab" aria-hidden="true">
                <i className="ri-sort-asc" />
                {t('home.suppliers.sortLab')}
              </span>
              {sortOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`sup-sort-btn${sort === item.key ? ' is-on' : ''}`}
                  onClick={() => chooseSort(item.key)}
                  aria-pressed={sort === item.key}
                  title={item.hint}
                >
                  <i className={item.icon} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>

            <div className={`sup-lead${leadMin > 0 ? ' is-on' : ''}`}>
              <span className="sup-lead-lab" aria-hidden="true">
                <i className="ri-hourglass-line" />
                {t('home.suppliers.leadLab')}
              </span>
              <div className="sup-lead-presets" role="group" aria-label={t('home.suppliers.leadGroup')}>
                {LEAD_PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`sup-lead-preset${leadMin === value ? ' is-on' : ''}`}
                    onClick={() => setLeadFloor(value)}
                    aria-pressed={leadMin === value}
                    title={t('home.suppliers.leadPresetHint', { value })}
                  >
                    {t('home.suppliers.leadPreset', { value })}
                  </button>
                ))}
              </div>
              <div className="sup-lead-field">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={400}
                  step={1}
                  value={leadDraft}
                  onChange={(event) => setLeadDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setLeadFloor(Number(leadDraft));
                    }
                    if (event.key === 'Escape') setLeadFloor(0);
                  }}
                  placeholder={t('home.suppliers.leadPh')}
                  aria-label={t('home.suppliers.leadAria')}
                  className="sup-lead-input"
                />
                <span className="sup-lead-unit" aria-hidden="true">
                  {t('home.suppliers.leadUnit')}
                </span>
              </div>
              <button
                type="button"
                className="sup-lead-go"
                onClick={() => setLeadFloor(Number(leadDraft))}
                title={t('home.suppliers.leadApplyHint')}
              >
                {t('home.suppliers.leadApply')}
              </button>
              {leadMin > 0 && (
                <button
                  type="button"
                  className="sup-lead-x"
                  onClick={() => setLeadFloor(0)}
                  title={t('home.suppliers.leadClear')}
                  aria-label={t('home.suppliers.leadClear')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="button"
              className={`sup-link${linkState === 'done' ? ' is-done' : ''}${
                linkState === 'fail' ? ' is-fail' : ''
              }`}
              onClick={copyViewLink}
              title={t('home.suppliers.copyLinkHint')}
              aria-label={t('home.suppliers.copyLinkAria')}
            >
              <i
                className={
                  linkState === 'done'
                    ? 'ri-check-line'
                    : linkState === 'fail'
                      ? 'ri-error-warning-line'
                      : 'ri-link'
                }
                aria-hidden="true"
              />
              <span aria-live="polite">
                {t(
                  linkState === 'done'
                    ? 'home.suppliers.copyLinkDone'
                    : linkState === 'fail'
                      ? 'home.suppliers.copyLinkFail'
                      : 'home.suppliers.copyLink',
                )}
              </span>
            </button>

            <SavedViews
              current={{ lead: leadMin, sort, filter }}
              onApply={applyView}
              onCarnetFile={(file) => {
                void readBackup(file);
              }}
              slowestOf={(view) => slowestLeadOf(view, suppliers)}
              countOf={(view) => countInView(view, suppliers)}
            />

            {restoredFrom !== '' && (
              <p className="sup-view-restored" role="status">
                <i className="ri-history-line" aria-hidden="true" />
                <span>{t('home.suppliers.viewRestored', { name: restoredFrom })}</span>
                <button
                  type="button"
                  className="sup-view-restored-x"
                  onClick={() => {
                    clearLastView();
                    setRestoredFrom('');
                  }}
                  title={t('home.suppliers.viewRestoredForget')}
                  aria-label={t('home.suppliers.viewRestoredForget')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </p>
            )}

            {cycleNote !== '' && (
              <p className="sup-view-cycle" role="status">
                <i className="ri-arrow-left-right-line" aria-hidden="true" />
                {cycleNote}
              </p>
            )}

            <button
              type="button"
              className="sup-pull"
              onClick={pullFromScenarios}
              title={t('home.suppliers.pullHint')}
            >
              <i className="ri-download-cloud-2-line" aria-hidden="true" />
              {t('home.suppliers.pull')}
            </button>
          </div>

          {toast !== null && (
            <p className={`sup-toast is-${toast}`} role="status">
              <i
                className={
                  toast === 'exportFail' ||
                  toast === 'importNone' ||
                  toast === 'backupFail' ||
                  toast === 'backupBad'
                    ? 'ri-information-line'
                    : 'ri-check-line'
                }
                aria-hidden="true"
              />
              {t(`home.suppliers.toast.${toast}`)}
            </p>
          )}

          {carnetPending !== null && (
            <div className="sup-view-preview sup-carnet-preview">
              <div className="sup-view-preview-head">
                <span className="sup-view-preview-title">
                  <i className="ri-archive-2-line" aria-hidden="true" />
                  {t('home.suppliers.backupPreviewTitle', { file: carnetPending.file })}
                </span>
                <span className="sup-view-preview-counts">
                  {t('home.suppliers.backupPreviewCounts', {
                    suppliers: carnetPending.preview.supplierTotal,
                    views: carnetPending.data.views.length,
                    settings: carnetPending.preview.settings.length,
                  })}
                </span>
                <button
                  type="button"
                  className="sup-view-preview-x"
                  onClick={() => setCarnetPending(null)}
                  title={t('home.suppliers.viewPreviewCancelHint')}
                  aria-label={t('home.suppliers.viewPreviewCancelHint')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </div>
              <p className="sup-carnet-fiches">
                <i className="ri-store-2-line" aria-hidden="true" />
                {t('home.suppliers.backupPreviewFiches', {
                  count: carnetPending.preview.supplierTotal,
                  added: carnetPending.preview.supplierNew,
                  updated: carnetPending.preview.supplierUpdated,
                  same: carnetPending.preview.supplierSame,
                })}
              </p>
              <p className="sup-view-preview-hint">
                {t('home.suppliers.backupPreviewHint')}
              </p>
              {carnetPending.preview.views.rows.length > 0 && (
                <ul className="sup-view-preview-list">
                  {carnetPending.preview.views.rows.map((row) => (
                    <li
                      key={`${row.name}-${row.status}`}
                      className={`sup-view-preview-row is-${row.status}`}
                    >
                      <span className="sup-view-preview-name">{row.name}</span>
                      <span className="sup-view-preview-tag">
                        {t(
                          row.status === 'new'
                            ? 'home.suppliers.viewPreviewTagNew'
                            : row.status === 'update'
                              ? 'home.suppliers.viewPreviewTagUpdate'
                              : row.status === 'full'
                                ? 'home.suppliers.viewPreviewTagFull'
                                : 'home.suppliers.viewPreviewTagSame',
                        )}
                      </span>
                      {row.pinned && (
                        <span className="sup-view-preview-pin">
                          <i className="ri-pushpin-fill" aria-hidden="true" />
                        </span>
                      )}
                      <span className="sup-view-preview-meta">
                        {t('home.suppliers.viewTipRecallTimes', { count: row.recalls })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {carnetPending.preview.settings.length > 0 && (
                <ul className="sup-carnet-settings">
                  {carnetPending.preview.settings.map((change) => (
                    <li key={change.field}>
                      <i className="ri-settings-3-line" aria-hidden="true" />
                      {carnetChangeText(change)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="sup-view-preview-actions">
                <button
                  type="button"
                  className="sup-view-save"
                  onClick={restoreBackup}
                  disabled={carnetPending.preview.actions === 0}
                  title={
                    carnetPending.preview.actions === 0
                      ? t('home.suppliers.backupPreviewNothing')
                      : t('home.suppliers.backupPreviewConfirmHint')
                  }
                >
                  {t('home.suppliers.backupPreviewConfirm')}
                </button>
                <button
                  type="button"
                  className="sup-view-preview-cancel"
                  onClick={() => setCarnetPending(null)}
                >
                  {t('home.suppliers.viewPreviewCancel')}
                </button>
              </div>
            </div>
          )}

          {removedSupplier !== null && (
            <p className="sup-del-undo" role="status">
              <i className="ri-delete-bin-6-line" aria-hidden="true" />
              <span className="sup-del-undo-text">
                {t('home.suppliers.deleteUndoText', {
                  name:
                    removedSupplier.name.trim() !== ''
                      ? removedSupplier.name
                      : t('home.suppliers.deleteUndoUnnamed'),
                })}
              </span>
              <button
                type="button"
                className="sup-del-undo-btn"
                onClick={undoDeleteSelected}
                title={t('home.suppliers.deleteUndoHint')}
              >
                <i className="ri-arrow-go-back-line" aria-hidden="true" />
                {t('home.suppliers.deleteUndoBtn')}
              </button>
              <button
                type="button"
                className="sup-del-undo-x"
                onClick={() => setRemovedSupplier(null)}
                title={t('home.suppliers.deleteUndoDismiss')}
                aria-label={t('home.suppliers.deleteUndoDismiss')}
              >
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </p>
          )}

          {suppliers.length === 0 ? (
            <div className="sup-empty">
              <i className="ri-store-2-line" aria-hidden="true" />
              <h3>{t('home.suppliers.emptyTitle')}</h3>
              <p>{t('home.suppliers.emptyText')}</p>
              <div className="sup-empty-actions">
                <button type="button" className="btn" onClick={() => setEditing(createSupplier())}>
                  <i className="ri-add-line" aria-hidden="true" />
                  {t('home.suppliers.add')}
                </button>
                <button type="button" className="btn sup-btn-ghost" onClick={pullFromScenarios}>
                  <i className="ri-download-cloud-2-line" aria-hidden="true" />
                  {t('home.suppliers.pull')}
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <p className="sup-empty-line">
              <i className="ri-search-eye-line" aria-hidden="true" />
              {t('home.suppliers.noResult')}
            </p>
          ) : (
            <>
              <div className="sup-list-head">
                <p className="sup-count">
                  {t(visible.length > 1 ? 'home.suppliers.countMany' : 'home.suppliers.countOne', {
                    count: visible.length,
                  })}
                </p>
                <button
                  type="button"
                  className={`sup-summary${summaryState === 'done' ? ' is-done' : ''}${
                    summaryState === 'fail' ? ' is-fail' : ''
                  }`}
                  onClick={copySummary}
                  title={t('home.suppliers.summaryCopyHint')}
                  aria-label={t('home.suppliers.summaryCopyAria', { count: visible.length })}
                >
                  <i
                    className={
                      summaryState === 'done'
                        ? 'ri-check-line'
                        : summaryState === 'fail'
                          ? 'ri-error-warning-line'
                          : 'ri-file-copy-2-line'
                    }
                    aria-hidden="true"
                  />
                  <span aria-live="polite">
                    {t(
                      summaryState === 'done'
                        ? 'home.suppliers.summaryCopyDone'
                        : summaryState === 'fail'
                          ? 'home.suppliers.summaryCopyFail'
                          : 'home.suppliers.summaryCopy',
                    )}
                  </span>
                </button>
              </div>
              {pendingDelete !== null && (
                <div
                  className="sup-del-confirm"
                  role="alertdialog"
                  aria-label={t('home.suppliers.deleteSelAsk', { name: pendingDelete.name })}
                >
                  <i className="ri-delete-bin-6-line" aria-hidden="true" />
                  <span className="sup-del-confirm-text">
                    {t('home.suppliers.deleteSelAsk', { name: pendingDelete.name })}
                  </span>
                  <span className="sup-del-confirm-keys">
                    <kbd>Alt</kbd>
                    <kbd>{t('home.suppliers.keyDelete')}</kbd>
                    {t('home.suppliers.deleteSelHint')}
                  </span>
                  <span className="sup-del-confirm-actions">
                    <button
                      type="button"
                      className="sup-mini is-danger"
                      onClick={confirmDeleteSelected}
                    >
                      {t('home.suppliers.deleteSelYes')}
                    </button>
                    <button
                      type="button"
                      className="sup-mini"
                      onClick={() => setPendingDelete(null)}
                    >
                      {t('home.suppliers.deleteSelNo')}
                    </button>
                  </span>
                </div>
              )}
              {countries.length > 0 && (
                <div
                  className="sup-tally"
                  role="group"
                  aria-label={t('home.suppliers.tallyAria')}
                >
                  <span className="sup-tally-lab">
                    <i className="ri-earth-line" aria-hidden="true" />
                    {t('home.suppliers.tallyLab')}
                  </span>
                  {countries.map((entry) => {
                    if (entry.unknown) {
                      return (
                        <span
                          key="unknown"
                          className="sup-tally-pill is-static"
                          title={t('home.suppliers.tallyUnknownHint')}
                        >
                          {t('home.suppliers.tallyUnknown')}
                          <span className="sup-tally-count">{entry.count}</span>
                        </span>
                      );
                    }
                    const isOn = search.trim().toLowerCase() === entry.key.toLowerCase();
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        className={`sup-tally-pill${isOn ? ' is-on' : ''}`}
                        onClick={() => setSearch(isOn ? '' : entry.key)}
                        aria-pressed={isOn}
                        title={t('home.suppliers.tallyHint', { name: entry.key })}
                      >
                        {entry.key}
                        <span className="sup-tally-count">{entry.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {leadMin > 0 && (
                <p className="sup-lead-note">
                  <i className="ri-hourglass-line" aria-hidden="true" />
                  {t('home.suppliers.leadAbove', {
                    count: leadAboveCount,
                    value: leadMin,
                  })}
                </p>
              )}
              {leadMin === 0 && leadRef > 0 && (
                <p className="sup-lead-note is-ref">
                  <i className="ri-hourglass-line" aria-hidden="true" />
                  {t('home.suppliers.leadRefNote', { value: leadRef })}
                </p>
              )}
              {slowestLead > 0 && (
                <p className="sup-slow">
                  <i className="ri-hourglass-line" aria-hidden="true" />
                  {t('home.suppliers.slowest', { value: slowestLead })}
                </p>
              )}
              <div className="sup-grid">
                {visible.map((supplier) => (
                  <SupplierCard
                    key={supplier.id}
                    supplier={supplier}
                    locale={locale}
                    scenarioNames={scenarioNames}
                    draft={drafts[supplier.id] ?? null}
                    isSelected={selectedId === supplier.id}
                    onSelect={() => setSelectedId(supplier.id)}
                    onEdit={(item) => setEditing(item)}
                    onDelete={(item) => {
                      setSuppliers(removeSupplier(item.id));
                      setSelectedId((prev) => (prev === item.id ? null : prev));
                      setPendingDelete(null);
                      setToast('deleted');
                    }}
                    onContacted={(item) => {
                      setSuppliers(markContacted(item.id));
                      setToast('saved');
                    }}
                    onWritten={(item) => {
                      setSuppliers(markContacted(item.id));
                      setToast('dated');
                    }}
                    onFollowUp={(item, value) => setSuppliers(setFollowUp(item.id, value))}
                    leadFloor={leadRef}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="dash-foot">
        <span>{t('home.footer.rights')}</span>
        <span className="foot-links">
          <Link to="/calculateur#calculator">{t('home.calcPage.navCalc')}</Link>
          <Link to="/sourcing">{t('home.sourcing.nav')}</Link>
          <Link to="/">{t('home.calcPage.back')}</Link>
        </span>
      </footer>

      {dropActive && (
        <div className="sup-drop" role="presentation">
          <div className="sup-drop-card">
            <i className="ri-drag-drop-line" aria-hidden="true" />
            <b>{t('home.suppliers.dropTitle')}</b>
            <span>{t('home.suppliers.dropHint')}</span>
          </div>
        </div>
      )}

      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

      {editing !== null && (
        <SupplierDialog
          key={editing.id}
          supplier={editing}
          scenarios={scenarios}
          onCancel={() => setEditing(null)}
          onSave={(supplier) => {
            setSuppliers(saveSupplier(supplier));
            setEditing(null);
            setToast('saved');
          }}
        />
      )}
    </div>
  );
}