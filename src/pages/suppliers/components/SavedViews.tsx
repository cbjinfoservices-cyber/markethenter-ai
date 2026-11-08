import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_VIEWS,
  VIEWS_EVENT,
  VIEW_ORDER_EVENT,
  addView,
  duplicateView,
  isNameTaken,
  isSameView,
  loadViews,
  mergeImportedViews,
  movePinned,
  orderViews,
  pinAllViews,
  readViewOrder,
  readViewOrderPin,
  removeAllViews,
  removeView,
  renameView,
  reorderPinned,
  resetAllRecalls,
  resetViewRecalls,
  restoreRecalls,
  restoreView,
  restoreViews,
  togglePin,
  totalRecalls,
  unpinAllViews,
  writeViewOrder,
  writeViewOrderPin,
} from '@/pages/suppliers/savedViews';
import type {
  SavedView,
  ViewFilter,
  ViewOrder,
  ViewOrderPin,
  ViewSort,
} from '@/pages/suppliers/savedViews';
import type { RecallSnapshot } from '@/pages/suppliers/savedViews';
import { VIEW_FILTER_LABEL, VIEW_SORT_LABEL, buildViewsCsv, viewsFilename } from '@/pages/suppliers/viewsCsv';
import { parseViewsCsv, parseViewsJson } from '@/pages/suppliers/viewsImport';
import { parseCarnetJson } from '@/pages/suppliers/carnetJson';
import { useViewsDrop } from '@/pages/suppliers/useViewsDrop';
import { previewViews } from '@/pages/suppliers/viewsPreview';
import type { PreviewChange, PreviewRow, ViewsPreview } from '@/pages/suppliers/viewsPreview';
import { buildViewsJson, viewsJsonFilename } from '@/pages/suppliers/viewsJson';
import { downloadCsv } from '@/pages/home/calcExport';

/** Le temps de maintien avant que la croix d'une pastille n'apparaisse. */
const CHIP_ARM_MS = 240;
/** Le temps de maintien complet, celui qui retire vraiment la pastille. */
const CHIP_HOLD_MS = 860;

type Props = {
  current: { lead: number; sort: ViewSort; filter: ViewFilter };
  onApply: (view: SavedView) => void;
  /** Un fichier de sauvegarde complète tombé sur la rangée repart vers son
   *  propre aperçu, celui des fiches et des seuils. */
  onCarnetFile: (file: File) => void;
  /** Le délai le plus lent contenu dans une vue, lu sans la rappeler. */
  slowestOf: (view: SavedView) => number;
  /** Combien de fiches la vue retient, lu sans la rappeler non plus. */
  countOf: (view: SavedView) => number;
};

/** Le fichier lu mais pas encore appliqué : l'aperçu dit ce qu'il changerait. */
type PendingImport = {
  file: string;
  kind: 'csv' | 'json';
  views: ReturnType<typeof parseViewsCsv>['views'];
  order: ViewOrder | null;
  orderPin: ViewOrderPin | null;
  preview: ViewsPreview;
};

/** « Garder cette vue » : le seuil, le tri et le filtre rangés sous un nom,
 *  puis rappelés d'un clic. */
export default function SavedViews({ current, onApply, onCarnetFile, slowestOf, countOf }: Props) {
  const { t, i18n } = useTranslation();
  const [views, setViews] = useState<SavedView[]>(() => loadViews());
  /* L'ordre de la rangée : l'enregistrement, ou la vue la plus rappelée. */
  const [order, setOrder] = useState<ViewOrder>(() => readViewOrder());
  /* L'épinglage compte-t-il encore dans ce tri ? */
  const [orderPin, setOrderPin] = useState<ViewOrderPin>(() => readViewOrderPin());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /* Le renommage se fait sur la pastille elle-même, sans la supprimer. */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  /* Le glisser-déposer des épinglées : l'identifiant tenu et celui survolé. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  /* Les pastilles qui viennent d'être retirées : « Annuler » les remet en
     place, qu'il y en ait une seule ou la liste entière. */
  const [removed, setRemoved] = useState<SavedView[]>([]);
  /* La vue existante dont on repart, choisie depuis la fenêtre de garde. */
  const [baseId, setBaseId] = useState<string | null>(null);
  /* Les compteurs remis à zéro, gardés le temps de pouvoir revenir dessus. */
  const [recallBackup, setRecallBackup] = useState<RecallSnapshot[]>([]);
  /* Le nom de la pastille gommée seule, pour que l'annulation dise de qui
     elle parle — le bouton global, lui, n'en a pas besoin. */
  const [recallName, setRecallName] = useState('');
  /* Le fichier choisi, en attente de confirmation : rien n'est appliqué
     tant que l'aperçu n'a pas été validé. */
  const [pending, setPending] = useState<PendingImport | null>(null);
  /* La bulle des réglages : la pastille survolée et le point d'ancrage. */
  const [tip, setTip] = useState<{ id: string; left: number; top: number } | null>(null);
  const tipTimer = useRef<number | null>(null);
  /* Le délai qui laisse le temps d'aller de la pastille jusqu'à la bulle. */
  const hideTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /* La rangée elle-même : c'est elle qui donne la barre d'outils à écouter
     pour le dépôt d'un fichier de vues. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  /* LA PASTILLE TENUE — l'appui long la retire, et la croix ne sort qu'à ce
     moment-là. Le maintien de l'historique suit exactement le même rythme. */
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const heldId = useRef<string | null>(null);
  /* Le maintien vient de retirer la pastille : le clic qui suit ne doit pas
     rappeler la vue dans la foulée. */
  const holdFired = useRef(false);

  useEffect(() => {
    const sync = () => setViews(loadViews());
    window.addEventListener(VIEWS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(VIEWS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /* L'ordre et l'épinglage viennent aussi d'ailleurs : une sauvegarde
     complète relue repose les mêmes réglages, la rangée suit. */
  useEffect(() => {
    const sync = () => {
      setOrder(readViewOrder());
      setOrderPin(readViewOrderPin());
    };
    window.addEventListener(VIEW_ORDER_EVENT, sync);
    return () => window.removeEventListener(VIEW_ORDER_EVENT, sync);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (renameId !== null) renameRef.current?.select();
  }, [renameId]);

  useEffect(() => {
    if (notice === '') return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* L'offre d'annulation s'efface d'elle-même, mais laisse le temps de
     revenir dessus des yeux puis du clic. */
  useEffect(() => {
    if (removed.length === 0) return undefined;
    const timer = window.setTimeout(() => setRemoved([]), 9000);
    return () => window.clearTimeout(timer);
  }, [removed]);

  /* L'offre de revenir sur les compteurs s'efface de la même façon. */
  useEffect(() => {
    if (recallBackup.length === 0) return undefined;
    const timer = window.setTimeout(() => setRecallBackup([]), 9000);
    return () => window.clearTimeout(timer);
  }, [recallBackup]);

  useEffect(() => () => {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
  }, []);

  /* La bulle s'ouvre avec un rien de retard : passer d'une pastille à
     l'autre au survol ne la fait pas clignoter. */
  const showTip = (element: HTMLElement, view: SavedView) => {
    /* Une bulle quittée à l'instant ne doit pas refermer celle qu'on ouvre. */
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setTip({ id: view.id, left: rect.left + rect.width / 2, top: rect.top });
    }, 150);
  };

  const hideTip = () => {
    if (tipTimer.current !== null) {
      window.clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setTip(null);
  };

  /* LA BULLE SE CLIQUE — la souris peut la quitter sans qu'elle disparaisse,
     sinon ses lignes serait impossibles à atteindre. */
  const holdTip = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const hideTipSoon = () => {
    holdTip();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setTip(null);
    }, 260);
  };

  /* REPOSER DEPUIS LA BULLE — un clic sur une ligne de « la plus rappelée
     d'abord » rappelle cette vue, sans passer par sa pastille. */
  const applyFromTip = (view: SavedView) => {
    hideTip();
    onApply(view);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.trim();
    if (name === '') {
      setError(t('home.suppliers.viewError'));
      return;
    }
    const taken = views.some((view) => view.name.toLowerCase() === name.toLowerCase());
    if (!taken && views.length >= MAX_VIEWS) {
      setError(t('home.suppliers.viewFull'));
      return;
    }
    setViews(addView({ name, lead: current.lead, sort: current.sort, filter: current.filter }));
    setOpen(false);
    setDraft('');
    setError('');
    setBaseId(null);
    setNotice(t('home.suppliers.viewSaved', { name }));
  };

  /** La vue qui repose déjà exactement les réglages à l'écran : le bouton
   *  « Garder cette vue » n'a alors plus rien à enregistrer. */
  const sameView = views.find((view) => isSameView(view, current)) ?? null;

  const startRename = (view: SavedView) => {
    setOpen(false);
    setDraft('');
    setError('');
    setBaseId(null);
    setRenameId(view.id);
    setRenameDraft(view.name);
    setRenameError('');
  };

  const stopRename = () => {
    setRenameId(null);
    setRenameDraft('');
    setRenameError('');
  };

  const confirmRename = (event: FormEvent<HTMLFormElement>, view: SavedView) => {
    event.preventDefault();
    const name = renameDraft.trim();
    if (name === '') {
      setRenameError(t('home.suppliers.viewError'));
      return;
    }
    if (name.toLowerCase() === view.name.toLowerCase()) {
      stopRename();
      return;
    }
    if (isNameTaken(view.id, name)) {
      setRenameError(t('home.suppliers.viewRenameTaken'));
      return;
    }
    setViews(renameView(view.id, name));
    stopRename();
    setNotice(t('home.suppliers.viewRenameDone', { name }));
  };

  /* L'export des vues : la liste entière, badges compris, en un fichier
     qui reprend les mêmes chiffres que les pastilles. */
  const exportViews = () => {
    if (views.length === 0) return;
    const rows = views.map((view) => ({
      name: view.name,
      lead: view.lead,
      sortLabel: t(VIEW_SORT_LABEL[view.sort]),
      filterLabel: t(VIEW_FILTER_LABEL[view.filter]),
      count: countOf(view),
      slowest: slowestOf(view),
      /* L'usage voyage avec le fichier : la même rangée se retrouve ailleurs. */
      recalls: view.recalls,
      lastUsedAt: view.lastUsedAt,
      /* L'épinglage et le rang aussi : la pastille revient à sa place exacte. */
      pinned: view.pinned,
      pinRank: view.pinRank,
    }));
    const csv = buildViewsCsv(
      rows,
      t,
      t('home.suppliers.viewsCsvTitle', { count: rows.length }),
    );
    setNotice(
      downloadCsv(viewsFilename(), csv)
        ? t('home.suppliers.viewExportDone', { count: rows.length })
        : t('home.suppliers.viewExportFail'),
    );
  };

  /* L'export JSON : les réglages bruts, l'usage et l'épinglage. Aucun
     tableur entre les deux, donc l'aller-retour rend la même rangée. */
  const exportJson = () => {
    if (views.length === 0) return;
    /* Le fichier garde l'ordre affiché, et note ce choix à part. */
    const ordered = orderViews(views, order, orderPin);
    const json = buildViewsJson(ordered, order, orderPin);
    setNotice(
      downloadCsv(viewsJsonFilename(), json)
        ? t('home.suppliers.viewJsonDone', { count: ordered.length })
        : t('home.suppliers.viewJsonFail'),
    );
  };

  /* LIRE LE FICHIER — on le compare au carnet et on montre l'aperçu, sans
     rien appliquer : la pastille ne bouge qu'après confirmation. */
  const importViewsText = (name: string, text: string) => {
    /* Le JSON se reconnaît à son extension ou à son accent ouvrant : il
       porte les réglages bruts, donc rien à relire dans un tableur. */
    if (/\.json$/i.test(name) || text.trimStart().startsWith('{')) {
      const parsed = parseViewsJson(text);
      if (parsed.views.length === 0) {
        setNotice(t('home.suppliers.viewJsonEmpty', { file: name }));
        return;
      }
      setPending({
        file: name,
        kind: 'json',
        views: parsed.views,
        order: parsed.order,
        orderPin: parsed.orderPin,
        preview: previewViews(parsed.views, views),
      });
      return;
    }
    const parsed = parseViewsCsv(text);
    if (parsed.views.length === 0) {
      setNotice(t('home.suppliers.viewImportEmpty', { file: name }));
      return;
    }
    setPending({
      file: name,
      kind: 'csv',
      views: parsed.views,
      order: null,
      orderPin: null,
      preview: previewViews(parsed.views, views),
    });
  };

  const importViews = async (file: File) => {
    let text = '';
    try {
      text = await file.text();
    } catch {
      setNotice(t('home.suppliers.viewImportFail'));
      return;
    }
    importViewsText(file.name, text);
  };

  /* DÉPOSER SUR LA RANGÉE D'OUTILS — un fichier de vues ouvre ici le même
     aperçu que le bouton « Importer ». Une sauvegarde complète, elle, repart
     vers son propre aperçu : les fiches et les seuils ne se mélangent pas. */
  const routeDroppedFile = async (file: File) => {
    let text = '';
    try {
      text = await file.text();
    } catch {
      setNotice(t('home.suppliers.viewImportFail'));
      return;
    }
    const looksJson = /\.json$/i.test(file.name) || text.trimStart().startsWith('{');
    if (looksJson) {
      if (parseCarnetJson(text) !== null) {
        onCarnetFile(file);
        return;
      }
      importViewsText(file.name, text);
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setNotice(t('home.suppliers.viewDropWrong', { file: file.name }));
      return;
    }
    importViewsText(file.name, text);
  };

  const viewsDrop = useViewsDrop(rootRef, (file) => {
    void routeDroppedFile(file);
  });

  /* CONFIRMER L'IMPORT — c'est ici, et seulement ici, que le carnet change. */
  const confirmImport = () => {
    if (pending === null) return;
    const result = mergeImportedViews(pending.views);
    setViews(result.views);
    /* L'ordre d'affichage voyage aussi : la rangée se rouvre pareille. */
    if (pending.order !== null) {
      setOrder(pending.order);
      writeViewOrder(pending.order);
    }
    if (pending.orderPin !== null) {
      setOrderPin(pending.orderPin);
      writeViewOrderPin(pending.orderPin);
    }
    let message = t(
      pending.kind === 'json'
        ? 'home.suppliers.viewJsonImportDone'
        : 'home.suppliers.viewImportDone',
      { added: result.added, updated: result.updated },
    );
    if (result.skipped > 0) {
      message += ` ${t('home.suppliers.viewImportSkipped', { count: result.skipped })}`;
    }
    setNotice(message);
    setPending(null);
  };

  const cancelImport = () => setPending(null);

  /** Un changement de l'aperçu, dit en clair et dans la langue de la page. */
  const previewChange = (change: PreviewChange): string => {
    const none = t('home.suppliers.viewPreviewNone');
    const lane = (value: string | number) => (Number(value) > 0 ? `${value}` : none);
    if (change.field === 'lead') {
      return t('home.suppliers.viewPreviewLead', {
        before: lane(change.before),
        after: lane(change.after),
      });
    }
    if (change.field === 'sort') {
      return t('home.suppliers.viewPreviewSort', {
        before: t(VIEW_SORT_LABEL[change.before as ViewSort]),
        after: t(VIEW_SORT_LABEL[change.after as ViewSort]),
      });
    }
    if (change.field === 'filter') {
      return t('home.suppliers.viewPreviewFilter', {
        before: t(VIEW_FILTER_LABEL[change.before as ViewFilter]),
        after: t(VIEW_FILTER_LABEL[change.after as ViewFilter]),
      });
    }
    if (change.field === 'recalls') {
      return t('home.suppliers.viewPreviewRecalls', {
        before: change.before,
        after: change.after,
      });
    }
    if (change.field === 'pinned') {
      return t('home.suppliers.viewPreviewPinned', {
        after: t(
          Number(change.after) > 0
            ? 'home.suppliers.viewPreviewPinnedOn'
            : 'home.suppliers.viewPreviewPinnedOff',
        ),
      });
    }
    return t('home.suppliers.viewPreviewPinRank', {
      before: change.before,
      after: change.after,
    });
  };

  /** Le réglage de la ligne d'aperçu, mis à plat sous son nom. */
  const previewMeta = (row: PreviewRow): string => {
    const parts = [
      row.lead > 0
        ? t('home.suppliers.viewLead', { value: row.lead })
        : t('home.suppliers.viewTipNoLead'),
      t(VIEW_SORT_LABEL[row.sort]),
      t(VIEW_FILTER_LABEL[row.filter]),
    ];
    if (row.recalls > 0) {
      parts.push(t('home.suppliers.viewTipRecallTimes', { count: row.recalls }));
    }
    return parts.join(' · ');
  };

  const startDrag = (event: DragEvent<HTMLLIElement>, view: SavedView) => {
    setDragId(view.id);
    setDropId(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', view.name);
  };

  const overChip = (event: DragEvent<HTMLLIElement>, view: SavedView) => {
    if (dragId === null || dragId === view.id || !view.pinned) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropId !== view.id) setDropId(view.id);
  };

  const dropOnChip = (event: DragEvent<HTMLLIElement>, view: SavedView) => {
    event.preventDefault();
    if (dragId !== null && dragId !== view.id && view.pinned) {
      setViews(reorderPinned(dragId, view.id));
      setNotice(t('home.suppliers.viewReorderDone', { name: view.name }));
    }
    setDragId(null);
    setDropId(null);
  };

  const endDrag = () => {
    setDragId(null);
    setDropId(null);
  };

  /* RETIRER — la pastille part, et l'offre de la remettre s'affiche juste
     en dessous : un clic et tout revient comme avant. */
  const dropView = (view: SavedView) => {
    hideTip();
    setRemoved([view]);
    setViews(removeView(view.id));
  };

  /* APPUI LONG SUR UNE PASTILLE — le même geste que sur l'historique :
     la pastille s'assombrit, sa croix sort au bout d'un quart de seconde,
     et le maintien complet la retire. Les petites commandes de la pastille
     gardent leur clic simple. */
  const clearChipTimers = () => {
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const cancelHold = () => {
    clearChipTimers();
    heldId.current = null;
    setHoldingId(null);
    setArmedId(null);
  };

  const startHold = (event: ReactPointerEvent<HTMLLIElement>, view: SavedView) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target !== null) {
      const button = target.closest('button');
      if (button !== null && !button.classList.contains('sup-view-apply')) return;
    }
    if (dragId !== null) return;
    clearChipTimers();
    hideTip();
    holdFired.current = false;
    heldId.current = view.id;
    setHoldingId(view.id);
    armTimer.current = window.setTimeout(() => setArmedId(view.id), CHIP_ARM_MS);
    holdTimer.current = window.setTimeout(() => {
      clearChipTimers();
      heldId.current = null;
      holdFired.current = true;
      setHoldingId(null);
      setArmedId(null);
      dropView(view);
    }, CHIP_HOLD_MS);
  };

  /* Le clic qui suit un maintien ne rappelle pas la vue qu'on vient de
     retirer. */
  const catchHoldClick = (event: ReactMouseEvent<HTMLLIElement>) => {
    if (!holdFired.current) return;
    holdFired.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /* TOUT RETIRER — les huit pastilles partent ensemble, avec exactement la
     même offre : un clic et la liste entière reprend sa place. */
  const clearAll = () => {
    if (views.length === 0) return;
    hideTip();
    setRemoved(views);
    setViews(removeAllViews());
  };

  const undoRemove = () => {
    if (removed.length === 0) return;
    const single = removed.length === 1 ? removed[0] : null;
    if (single !== null) {
      const result = restoreView(single);
      setViews(result.views);
      setNotice(
        result.reason === 'ok'
          ? t('home.suppliers.viewRestoreDone', { name: single.name })
          : t(
              result.reason === 'full'
                ? 'home.suppliers.viewRestoreFull'
                : 'home.suppliers.viewRestoreTaken',
              { name: single.name },
            ),
      );
      setRemoved([]);
      return;
    }
    const many = restoreViews(removed);
    setViews(many.views);
    let message =
      many.restored > 0
        ? t('home.suppliers.viewRestoreManyDone', { count: many.restored })
        : t('home.suppliers.viewRestoreManyNone');
    if (many.skipped > 0) {
      message += ` ${t('home.suppliers.viewRestoreManySkipped', { count: many.skipped })}`;
    }
    setNotice(message);
    setRemoved([]);
  };

  /* REMETTRE LES COMPTEURS À ZÉRO — les pastilles et leurs réglages ne
     bougent pas, seule la mémoire d'usage repart de zéro. */
  const resetRecalls = () => {
    hideTip();
    const result = resetAllRecalls();
    setViews(result.views);
    if (result.backup.length === 0) {
      setNotice(t('home.suppliers.viewRecallsResetNone'));
      return;
    }
    setRecallBackup(result.backup);
    setRecallName('');
    setNotice(t('home.suppliers.viewRecallsResetDone', { count: result.backup.length }));
  };

  /* LA GOMME D'UNE PASTILLE — son compteur seul repart de zéro, les autres
     vues gardent le leur. Les réglages et l'épinglage ne bougent pas. */
  const eraseRecalls = (view: SavedView) => {
    hideTip();
    const result = resetViewRecalls(view.id);
    setViews(result.views);
    if (result.backup.length === 0) {
      setNotice(t('home.suppliers.viewRecallEraseEmpty', { name: view.name }));
      return;
    }
    setRecallBackup(result.backup);
    setRecallName(view.name);
    setNotice(t('home.suppliers.viewRecallResetOne', { name: view.name }));
  };

  const undoResetRecalls = () => {
    if (recallBackup.length === 0) return;
    setViews(restoreRecalls(recallBackup));
    setNotice(
      recallName !== ''
        ? t('home.suppliers.viewRecallUndoOneDone', { name: recallName })
        : t('home.suppliers.viewRecallsUndoDone', { count: recallBackup.length }),
    );
    setRecallBackup([]);
    setRecallName('');
  };

  /* PARTIR D'UNE VUE EXISTANTE — la fenêtre de garde reste ouverte : les
     réglages de la vue choisie se reposent, son nom de copie se propose,
     et il ne reste qu'un réglage à retoucher. */
  const startFromView = (view: SavedView) => {
    onApply(view);
    const base = `${view.name} · ${t('home.suppliers.viewCopySuffix')}`.slice(0, 32);
    const taken = (candidate: string) =>
      views.some((item) => item.name.toLowerCase() === candidate.toLowerCase());
    let name = base;
    let attempt = 2;
    while (taken(name)) {
      const tail = ` ${attempt}`;
      name = `${base.slice(0, 32 - tail.length)}${tail}`;
      attempt += 1;
    }
    setDraft(name);
    setError('');
    setBaseId(view.id);
    inputRef.current?.focus();
  };

  /* DUPLIQUER — une copie prête à recevoir un seul réglage de plus. */
  const copyView = (view: SavedView) => {
    hideTip();
    const result = duplicateView(view.id, t('home.suppliers.viewCopySuffix'));
    setViews(result.views);
    if (result.created !== null) {
      setNotice(t('home.suppliers.viewDuplicateDone', { name: result.created.name }));
    } else {
      setNotice(t('home.suppliers.viewDuplicateFull'));
    }
  };

  /* L'ordre affiché : c'est lui que suivent les pastilles, la bulle et la
     touche Alt + chiffre du même coup. */
  const shown = useMemo(() => orderViews(views, order, orderPin), [views, order, orderPin]);
  const allPinned = shown.length > 0 && shown.every((view) => view.pinned);
  /* Le total des rappels : c'est lui qui dit s'il y a quelque chose à
     remettre à zéro, et qui donne le compte de toutes les vues d'un coup. */
  const recallTotal = useMemo(() => totalRecalls(views), [views]);
  /* LA PLUS RAPPELÉE D'ABORD — la rangée lue dans cet ordre, épinglage
     ignoré, pour la parcourir des yeux sans toucher aux flèches. */
  const byRecalls = useMemo(() => orderViews(views, 'used', 'ignore'), [views]);
  /* La date du dernier rappel, lue dans la langue de la page. */
  const usedFmt = useMemo(() => {
    const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
    return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [i18n.resolvedLanguage]);

  const toggleOrder = () => {
    const next: ViewOrder = order === 'used' ? 'saved' : 'used';
    setOrder(next);
    writeViewOrder(next);
    hideTip();
    setNotice(
      t(
        next === 'used'
          ? 'home.suppliers.viewOrderUsedDone'
          : 'home.suppliers.viewOrderSavedDone',
      ),
    );
  };

  /* L'ÉPINGLAGE DANS LE TRI — quand la rangée est classée par usage, on
     peut choisir de vraies places : les épinglées rentrent dans le rang. */
  const toggleOrderPin = () => {
    const next: ViewOrderPin = orderPin === 'top' ? 'ignore' : 'top';
    setOrderPin(next);
    writeViewOrderPin(next);
    hideTip();
    setNotice(
      t(
        next === 'ignore'
          ? 'home.suppliers.viewOrderPinIgnoreDone'
          : 'home.suppliers.viewOrderPinTopDone',
      ),
    );
  };

  /* TOUT ÉPINGLER / TOUT DÉTACHER — la rangée se réordonne d'un seul clic,
     en gardant l'ordre qu'elle a justement à l'écran. */
  const pinEveryChip = () => {
    hideTip();
    if (allPinned) {
      setViews(unpinAllViews());
      setNotice(t('home.suppliers.viewUnpinAllDone', { count: shown.length }));
      return;
    }
    setViews(pinAllViews(shown));
    setNotice(t('home.suppliers.viewPinAllDone', { count: shown.length }));
  };

  /* La pastille dont la bulle est ouverte, lue dans la liste à jour. */
  const tipView = tip !== null ? views.find((view) => view.id === tip.id) ?? null : null;
  /* Son rang dans la liste affichée : c'est la touche qui la repose. */
  const tipSeat = tipView !== null ? shown.findIndex((view) => view.id === tipView.id) : -1;

  return (
    <div className="sup-views" ref={rootRef}>
      {viewsDrop && (
        <p className="sup-view-drop" role="presentation">
          <i className="ri-drag-drop-line" aria-hidden="true" />
          <b>{t('home.suppliers.viewDropTitle')}</b>
          <span>{t('home.suppliers.viewDropHint')}</span>
        </p>
      )}
      {open ? (
        <form className="sup-view-form" onSubmit={save}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={32}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error !== '') setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                setDraft('');
                setError('');
                setBaseId(null);
              }
            }}
            placeholder={t('home.suppliers.viewNamePh')}
            aria-label={t('home.suppliers.viewNamePh')}
            className="sup-view-input"
          />
          <button
            type="submit"
            className="sup-view-save"
            title={t('home.suppliers.viewSaveHint')}
          >
            {t('home.suppliers.viewSave')}
          </button>
          <button
            type="button"
            className="sup-view-x"
            onClick={() => {
              setOpen(false);
              setDraft('');
              setError('');
              setBaseId(null);
            }}
            title={t('home.suppliers.viewCancel')}
            aria-label={t('home.suppliers.viewCancel')}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={`sup-view-keep${sameView !== null ? ' is-same' : ''}`}
          onClick={() => setOpen(true)}
          disabled={sameView !== null}
          title={
            sameView !== null
              ? t('home.suppliers.viewKeepSameHint', { name: sameView.name })
              : t('home.suppliers.viewKeepHint')
          }
        >
          <i
            className={sameView !== null ? 'ri-bookmark-fill' : 'ri-bookmark-line'}
            aria-hidden="true"
          />
          {t('home.suppliers.viewKeep')}
        </button>
      )}

      {open && views.length > 0 && (
        <div className="sup-view-bases">
          <span className="sup-view-bases-lab">
            <i className="ri-bookmark-3-line" aria-hidden="true" />
            {t('home.suppliers.viewBaseLab')}
          </span>
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`sup-view-base${baseId === view.id ? ' is-on' : ''}`}
              onClick={() => startFromView(view)}
              title={t('home.suppliers.viewBaseHint', { name: view.name })}
              aria-pressed={baseId === view.id}
            >
              <i className="ri-file-copy-line" aria-hidden="true" />
              {view.name}
            </button>
          ))}
          {baseId !== null && (
            <span className="sup-view-base-note">
              <i className="ri-information-line" aria-hidden="true" />
              {t('home.suppliers.viewBaseNote')}
            </span>
          )}
        </div>
      )}

      {sameView !== null && !open && (
        <span className="sup-view-same">
          <i className="ri-check-line" aria-hidden="true" />
          {t('home.suppliers.viewSameNote', { name: sameView.name })}
        </span>
      )}

      {views.length > 0 && (
        <ul className="sup-view-list" aria-label={t('home.suppliers.viewListAria')}>
          {shown.map((view) => {
            if (renameId === view.id) {
              return (
                <li key={view.id} className="sup-view-chip is-renaming">
                  <form
                    className="sup-view-rename-form"
                    onSubmit={(event) => confirmRename(event, view)}
                  >
                    <input
                      ref={renameRef}
                      type="text"
                      value={renameDraft}
                      maxLength={32}
                      onChange={(event) => {
                        setRenameDraft(event.target.value);
                        if (renameError !== '') setRenameError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') stopRename();
                      }}
                      aria-label={t('home.suppliers.viewRenameAria', { name: view.name })}
                      className="sup-view-input"
                    />
                    <button
                      type="submit"
                      className="sup-view-save"
                      title={t('home.suppliers.viewRenameHint')}
                    >
                      {t('home.suppliers.viewSave')}
                    </button>
                    <button
                      type="button"
                      className="sup-view-x"
                      onClick={stopRename}
                      title={t('home.suppliers.viewCancel')}
                      aria-label={t('home.suppliers.viewCancel')}
                    >
                      <i className="ri-close-line" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              );
            }
            const slowest = slowestOf(view);
            const pinnedCount = shown.filter((item) => item.pinned).length;
            const pinIndex = shown.filter((item) => item.pinned).indexOf(view);
            /* Quand le tri ignore l'épinglage, réordonner les épinglées ne
               changerait rien à l'écran : on n'allume pas les flèches. */
            const pinsDriveOrder = !(order === 'used' && orderPin === 'ignore');
            const canReorder = pinsDriveOrder && view.pinned && pinnedCount > 1;
            return (
              <li
                key={view.id}
                draggable={canReorder}
                onDragStart={(event) => {
                  cancelHold();
                  startDrag(event, view);
                }}
                onDragOver={(event) => overChip(event, view)}
                onDragLeave={() => {
                  if (dropId === view.id) setDropId(null);
                }}
                onDrop={(event) => dropOnChip(event, view)}
                onDragEnd={endDrag}
                onPointerDown={(event) => startHold(event, view)}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                onClickCapture={catchHoldClick}
                onContextMenu={(event) => {
                  if (heldId.current === view.id) event.preventDefault();
                }}
                onMouseEnter={(event) => showTip(event.currentTarget, view)}
                onMouseLeave={() => {
                  cancelHold();
                  hideTipSoon();
                }}
                onFocusCapture={(event) => showTip(event.currentTarget, view)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) hideTipSoon();
                }}
                aria-describedby={tip !== null && tip.id === view.id ? 'sup-view-tip' : undefined}
                className={`sup-view-chip${view.pinned ? ' is-pinned' : ''}${
                  isSameView(view, current) ? ' is-on' : ''
                }${canReorder ? ' is-draggable' : ''}${dragId === view.id ? ' is-dragging' : ''}${
                  dropId === view.id ? ' is-drop' : ''
                }${holdingId === view.id ? ' is-holding' : ''}${
                  armedId === view.id ? ' is-armed' : ''
                }`}
              >
                <button
                  type="button"
                  className={`sup-view-pin${view.pinned ? ' is-on' : ''}`}
                  onClick={() => setViews(togglePin(view.id))}
                  title={t(
                    view.pinned
                      ? 'home.suppliers.viewUnpinHint'
                      : 'home.suppliers.viewPinHint',
                  )}
                  aria-pressed={view.pinned}
                  aria-label={t(
                    view.pinned
                      ? 'home.suppliers.viewUnpinAria'
                      : 'home.suppliers.viewPinAria',
                    { name: view.name },
                  )}
                >
                  <i
                    className={view.pinned ? 'ri-pushpin-fill' : 'ri-pushpin-line'}
                    aria-hidden="true"
                  />
                </button>
                {canReorder && (
                  <span className="sup-view-moves">
                    <button
                      type="button"
                      className="sup-view-move"
                      onClick={() => setViews(movePinned(view.id, -1))}
                      disabled={pinIndex <= 0}
                      title={t('home.suppliers.viewMoveUpHint', { name: view.name })}
                      aria-label={t('home.suppliers.viewMoveUpAria', { name: view.name })}
                    >
                      <i className="ri-arrow-up-s-line" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="sup-view-move"
                      onClick={() => setViews(movePinned(view.id, 1))}
                      disabled={pinIndex >= pinnedCount - 1}
                      title={t('home.suppliers.viewMoveDownHint', { name: view.name })}
                      aria-label={t('home.suppliers.viewMoveDownAria', { name: view.name })}
                    >
                      <i className="ri-arrow-down-s-line" aria-hidden="true" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  className="sup-view-apply"
                  onClick={() => onApply(view)}
                  title={t('home.suppliers.viewApplyHintShort', { name: view.name })}
                >
                  <i className="ri-bookmark-3-line" aria-hidden="true" />
                  {view.name}
                  {view.recalls > 0 && (
                    <span
                      className="sup-view-recall"
                      title={t('home.suppliers.viewRecallHint', { count: view.recalls })}
                    >
                      ×{view.recalls}
                    </span>
                  )}
                  <span
                    className="sup-view-count"
                    title={t(
                      countOf(view) > 1
                        ? 'home.suppliers.viewCountHintMany'
                        : 'home.suppliers.viewCountHintOne',
                    )}
                  >
                    {t(
                      countOf(view) > 1
                        ? 'home.suppliers.viewCountMany'
                        : 'home.suppliers.viewCountOne',
                      { count: countOf(view) },
                    )}
                  </span>
                  {slowest > 0 && (
                    <span
                      className="sup-view-lead"
                      title={t('home.suppliers.viewSlowestHint', { value: slowest })}
                    >
                      {t('home.suppliers.viewSlowest', { value: slowest })}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="sup-view-dup"
                  onClick={() => copyView(view)}
                  title={t('home.suppliers.viewDuplicateHint', { name: view.name })}
                  aria-label={t('home.suppliers.viewDuplicateAria', { name: view.name })}
                >
                  <i className="ri-file-copy-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sup-view-gomme"
                  onClick={() => eraseRecalls(view)}
                  disabled={view.recalls === 0 && view.lastUsedAt === 0}
                  title={t(
                    view.recalls > 0
                      ? 'home.suppliers.viewRecallEraseHint'
                      : 'home.suppliers.viewRecallEraseEmpty',
                    { name: view.name, count: view.recalls },
                  )}
                  aria-label={t('home.suppliers.viewRecallEraseAria', { name: view.name })}
                >
                  <i className="ri-eraser-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sup-view-rename"
                  onClick={() => startRename(view)}
                  title={t('home.suppliers.viewRenameHint')}
                  aria-label={t('home.suppliers.viewRenameAria', { name: view.name })}
                >
                  <i className="ri-pencil-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sup-view-del"
                  onClick={() => dropView(view)}
                  title={t('home.suppliers.viewRemoveHint')}
                  aria-label={t('home.suppliers.viewRemoveAria', { name: view.name })}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {removed.length > 0 && (
        <p className="sup-view-undo">
          <i className="ri-delete-bin-6-line" aria-hidden="true" />
          <span className="sup-view-undo-text" aria-live="polite">
            {removed.length === 1
              ? t('home.suppliers.viewRemoved', { name: removed[0].name })
              : t('home.suppliers.viewRemovedAll', { count: removed.length })}
          </span>
          <button
            type="button"
            className="sup-view-undo-btn"
            onClick={undoRemove}
            title={
              removed.length === 1
                ? t('home.suppliers.viewUndoHint', { name: removed[0].name })
                : t('home.suppliers.viewUndoAllHint', { count: removed.length })
            }
          >
            <i className="ri-arrow-go-back-line" aria-hidden="true" />
            {t('home.suppliers.viewUndo')}
          </button>
          <button
            type="button"
            className="sup-view-restored-x"
            onClick={() => setRemoved([])}
            title={t('home.suppliers.viewUndoDismiss')}
            aria-label={t('home.suppliers.viewUndoDismiss')}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </p>
      )}

      {recallBackup.length > 0 && (
        <p className="sup-view-undo is-recall">
          <i className="ri-eraser-line" aria-hidden="true" />
          <span className="sup-view-undo-text" aria-live="polite">
            {recallName !== ''
              ? t('home.suppliers.viewRecallResetOneUndo', { name: recallName })
              : t('home.suppliers.viewRecallsResetUndo', { count: recallBackup.length })}
          </span>
          <button
            type="button"
            className="sup-view-undo-btn"
            onClick={undoResetRecalls}
            title={
              recallName !== ''
                ? t('home.suppliers.viewRecallUndoOne', { name: recallName })
                : t('home.suppliers.viewRecallsUndoHint', { count: recallBackup.length })
            }
          >
            <i className="ri-arrow-go-back-line" aria-hidden="true" />
            {t('home.suppliers.viewUndo')}
          </button>
          <button
            type="button"
            className="sup-view-restored-x"
            onClick={() => setRecallBackup([])}
            title={t('home.suppliers.viewUndoDismiss')}
            aria-label={t('home.suppliers.viewUndoDismiss')}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </p>
      )}

      <div className="sup-view-io">
        {views.length > 0 && (
          <span
            className={`sup-view-total${recallTotal > 0 ? ' is-on' : ''}`}
            title={t('home.suppliers.viewTotalHint', {
              count: recallTotal,
              views: views.length,
            })}
          >
            <i className="ri-repeat-line" aria-hidden="true" />
            {t('home.suppliers.viewTotalLab')}
            <b>{recallTotal}</b>
          </span>
        )}
        {views.length > 1 && (
          <button
            type="button"
            className={`sup-view-order${order === 'used' ? ' is-on' : ''}`}
            onClick={toggleOrder}
            aria-pressed={order === 'used'}
            title={t(
              order === 'used'
                ? 'home.suppliers.viewOrderUsedHint'
                : 'home.suppliers.viewOrderSavedHint',
            )}
          >
            <i
              className={order === 'used' ? 'ri-sort-desc' : 'ri-time-line'}
              aria-hidden="true"
            />
            {t(
              order === 'used'
                ? 'home.suppliers.viewOrderUsed'
                : 'home.suppliers.viewOrderSaved',
            )}
          </button>
        )}
        {views.length > 1 && order === 'used' && (
          <button
            type="button"
            className={`sup-view-ignorepin${orderPin === 'ignore' ? ' is-on' : ''}`}
            onClick={toggleOrderPin}
            aria-pressed={orderPin === 'ignore'}
            title={t(
              orderPin === 'ignore'
                ? 'home.suppliers.viewOrderPinIgnoreHint'
                : 'home.suppliers.viewOrderPinTopHint',
            )}
          >
            <i
              className={orderPin === 'ignore' ? 'ri-pushpin-2-line' : 'ri-pushpin-line'}
              aria-hidden="true"
            />
            {t(
              orderPin === 'ignore'
                ? 'home.suppliers.viewOrderPinIgnore'
                : 'home.suppliers.viewOrderPinTop',
            )}
          </button>
        )}
        {views.length > 1 && (
          <button
            type="button"
            className={`sup-view-pinall${allPinned ? ' is-on' : ''}`}
            onClick={pinEveryChip}
            aria-pressed={allPinned}
            title={t(
              allPinned
                ? 'home.suppliers.viewUnpinAllHint'
                : 'home.suppliers.viewPinAllHint',
              { count: shown.length },
            )}
          >
            <i
              className={allPinned ? 'ri-pushpin-2-line' : 'ri-pushpin-line'}
              aria-hidden="true"
            />
            {t(
              allPinned
                ? 'home.suppliers.viewUnpinAll'
                : 'home.suppliers.viewPinAll',
            )}
          </button>
        )}
        {views.length > 0 && recallTotal > 0 && (
          <button
            type="button"
            className="sup-view-reset"
            onClick={resetRecalls}
            title={t('home.suppliers.viewRecallsResetHint', { count: recallTotal })}
          >
            <i className="ri-eraser-line" aria-hidden="true" />
            {t('home.suppliers.viewRecallsReset')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="sup-view-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importViews(file);
          }}
        />
        <button
          type="button"
          className="sup-view-export"
          onClick={() => fileRef.current?.click()}
          title={t('home.suppliers.viewImportHint')}
        >
          <i className="ri-upload-2-line" aria-hidden="true" />
          {t('home.suppliers.viewImport')}
        </button>
        {views.length > 1 && (
          <button
            type="button"
            className="sup-view-export"
            onClick={exportViews}
            title={t('home.suppliers.viewExportHint', { count: views.length })}
          >
            <i className="ri-file-download-line" aria-hidden="true" />
            {t('home.suppliers.viewExport')}
          </button>
        )}
        {views.length > 0 && (
          <button
            type="button"
            className="sup-view-export"
            onClick={exportJson}
            title={t('home.suppliers.viewJsonHint', { count: views.length })}
          >
            <i className="ri-braces-line" aria-hidden="true" />
            {t('home.suppliers.viewJson')}
          </button>
        )}
        {views.length > 1 && (
          <button
            type="button"
            className="sup-view-clear"
            onClick={clearAll}
            title={t('home.suppliers.viewClearAllHint', { count: views.length })}
          >
            <i className="ri-delete-bin-6-line" aria-hidden="true" />
            {t('home.suppliers.viewClearAll')}
          </button>
        )}
        {views.length > 1 && (
          <span className="sup-view-keys" title={t('home.suppliers.viewKeysAria')}>
            <kbd>Alt</kbd>
            <kbd>←</kbd>
            <kbd>→</kbd>
            {t('home.suppliers.viewKeysHint')}
            <kbd>1–8</kbd>
            {t('home.suppliers.viewKeysPick')}
          </span>
        )}
      </div>

      {pending !== null && (
        <div className="sup-view-preview">
          <div className="sup-view-preview-head">
            <span className="sup-view-preview-title">
              <i className="ri-file-list-3-line" aria-hidden="true" />
              {t('home.suppliers.viewPreviewTitle', { file: pending.file })}
            </span>
            <span className="sup-view-preview-counts">
              {t('home.suppliers.viewPreviewCounts', {
                added: pending.preview.added,
                updated: pending.preview.updated,
                unchanged: pending.preview.unchanged,
                skipped: pending.preview.skipped,
              })}
            </span>
            <button
              type="button"
              className="sup-view-preview-x"
              onClick={cancelImport}
              title={t('home.suppliers.viewPreviewCancelHint')}
              aria-label={t('home.suppliers.viewPreviewCancelHint')}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
          <p className="sup-view-preview-hint">
            {t('home.suppliers.viewPreviewHint')}
          </p>
          <ul className="sup-view-preview-list">
            {pending.preview.rows.map((row) => (
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
                  <span className="sup-view-preview-pin" title={t('home.suppliers.viewPreviewPinnedOn')}>
                    <i className="ri-pushpin-fill" aria-hidden="true" />
                  </span>
                )}
                <span className="sup-view-preview-meta">{previewMeta(row)}</span>
                {row.changes.length > 0 && (
                  <span className="sup-view-preview-changes">
                    {row.changes.map((change) => (
                      <em key={change.field}>{previewChange(change)}</em>
                    ))}
                  </span>
                )}
                {row.status === 'full' && (
                  <span className="sup-view-preview-meta is-full">
                    {t('home.suppliers.viewPreviewFullHint')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {pending.order !== null && pending.order !== order && (
            <p className="sup-view-preview-order">
              <i className="ri-sort-desc" aria-hidden="true" />
              {t('home.suppliers.viewPreviewOrder', {
                order: t(
                  pending.order === 'used'
                    ? 'home.suppliers.viewOrderUsed'
                    : 'home.suppliers.viewOrderSaved',
                ),
              })}
            </p>
          )}
          {pending.orderPin !== null && pending.orderPin !== orderPin && (
            <p className="sup-view-preview-order">
              <i className="ri-pushpin-line" aria-hidden="true" />
              {t('home.suppliers.viewPreviewOrderPin', {
                mode: t(
                  pending.orderPin === 'ignore'
                    ? 'home.suppliers.viewOrderPinIgnore'
                    : 'home.suppliers.viewOrderPinTop',
                ),
              })}
            </p>
          )}
          <div className="sup-view-preview-actions">
            <button
              type="button"
              className="sup-view-save"
              onClick={confirmImport}
              disabled={pending.preview.added + pending.preview.updated === 0}
              title={
                pending.preview.added + pending.preview.updated === 0
                  ? t('home.suppliers.viewPreviewNothing')
                  : t('home.suppliers.viewPreviewConfirmHint')
              }
            >
              {t('home.suppliers.viewPreviewConfirm', {
                count: pending.preview.added + pending.preview.updated,
              })}
            </button>
            <button type="button" className="sup-view-preview-cancel" onClick={cancelImport}>
              {t('home.suppliers.viewPreviewCancel')}
            </button>
          </div>
        </div>
      )}

      {tipView !== null && tip !== null && (
        <div
          id="sup-view-tip"
          className="sup-view-tip"
          role="tooltip"
          style={{ left: `${tip.left}px`, top: `${tip.top}px` }}
          onMouseEnter={holdTip}
          onMouseLeave={hideTip}
          onFocusCapture={holdTip}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) hideTip();
          }}
        >
          <b className="sup-view-tip-name">
            <i className="ri-bookmark-3-line" aria-hidden="true" />
            {tipView.name}
          </b>
          <span className="sup-view-tip-row">
            <i className="ri-hourglass-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipLead')}</em>
            <span>
              {tipView.lead > 0
                ? t('home.suppliers.viewLead', { value: tipView.lead })
                : t('home.suppliers.viewTipNoLead')}
            </span>
          </span>
          <span className="sup-view-tip-row">
            <i className="ri-sort-asc" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipSort')}</em>
            <span>{t(VIEW_SORT_LABEL[tipView.sort])}</span>
          </span>
          <span className="sup-view-tip-row">
            <i className="ri-filter-3-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipFilter')}</em>
            <span>{t(VIEW_FILTER_LABEL[tipView.filter])}</span>
          </span>
          <span className="sup-view-tip-row is-tally">
            <i className="ri-mail-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipCount')}</em>
            <span>
              {t(
                countOf(tipView) > 1
                  ? 'home.suppliers.viewCountMany'
                  : 'home.suppliers.viewCountOne',
                { count: countOf(tipView) },
              )}
            </span>
          </span>
          <span className="sup-view-tip-row is-tally">
            <i className="ri-hourglass-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipSlowest')}</em>
            <span>
              {slowestOf(tipView) > 0
                ? t('home.suppliers.viewDaysValue', { value: slowestOf(tipView) })
                : t('home.suppliers.viewTipNoSlowest')}
            </span>
          </span>
          <span className="sup-view-tip-row is-tally">
            <i className="ri-repeat-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipRecalls')}</em>
            <span>
              {tipView.recalls > 0
                ? t('home.suppliers.viewTipRecallTimes', { count: tipView.recalls })
                : t('home.suppliers.viewTipRecallNone')}
            </span>
          </span>
          <span className="sup-view-tip-row is-tally">
            <i className="ri-history-line" aria-hidden="true" />
            <em>{t('home.suppliers.viewTipLastUsed')}</em>
            <span>
              {tipView.lastUsedAt > 0
                ? usedFmt.format(new Date(tipView.lastUsedAt))
                : t('home.suppliers.viewTipNeverUsed')}
            </span>
          </span>
          {/* LE RANG RÉEL — quand l'épinglage est ignoré, la bulle dit la
              place véritable de la pastille dans la rangée, pas son épinglage. */}
          {order === 'used' && orderPin === 'ignore' && tipSeat >= 0 && (
            <span className="sup-view-tip-row is-tally is-rank">
              <i className="ri-list-ordered" aria-hidden="true" />
              <em>{t('home.suppliers.viewTipRank')}</em>
              <span>
                {t('home.suppliers.viewTipRankValue', {
                  index: tipSeat + 1,
                  total: shown.length,
                })}
                {tipView.pinned && (
                  <b className="sup-view-tip-rank-pin">
                    {t('home.suppliers.viewTipRankPinned')}
                  </b>
                )}
              </span>
            </span>
          )}
          {/* LA PLUS RAPPELÉE D'ABORD — la rangée entière, lue dans l'ordre
              d'usage : de quoi la parcourir sans passer par les flèches. */}
          {byRecalls.length > 1 && (
            <div className="sup-view-tip-rank">
              <span className="sup-view-tip-rank-head">
                <i className="ri-sort-desc" aria-hidden="true" />
                {t('home.suppliers.viewTipRecallOrder')}
                <em className="sup-view-tip-rank-note">
                  {t('home.suppliers.viewTipRecallOrderHint')}
                </em>
              </span>
              <div className="sup-view-tip-rank-list">
                {byRecalls.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`sup-view-tip-rank-item${
                      item.id === tipView.id ? ' is-on' : ''
                    }`}
                    onClick={() => applyFromTip(item)}
                    title={t('home.suppliers.viewTipRecallApply', { name: item.name })}
                    aria-label={t('home.suppliers.viewTipRecallApply', { name: item.name })}
                  >
                    <b>{index + 1}</b>
                    <span className="sup-view-tip-rank-name">{item.name}</span>
                    <span className="sup-view-tip-rank-count">×{item.recalls}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tipSeat >= 0 && tipSeat < 8 && (
            <span className="sup-view-tip-row is-keys">
              <i className="ri-keyboard-line" aria-hidden="true" />
              <em>{t('home.suppliers.viewTipShortcut')}</em>
              <span className="sup-view-tip-kbd">
                <kbd>Alt</kbd>
                <kbd>{tipSeat + 1}</kbd>
                {t('home.suppliers.viewTipShortcutHint')}
              </span>
            </span>
          )}
        </div>
      )}

      {renameError !== '' && (
        <p className="sup-view-error" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {renameError}
        </p>
      )}
      {error !== '' && (
        <p className="sup-view-error" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {error}
        </p>
      )}
      {notice !== '' && error === '' && renameError === '' && (
        <p className="sup-view-note" role="status">
          <i className="ri-check-line" aria-hidden="true" />
          {notice}
        </p>
      )}
    </div>
  );
}