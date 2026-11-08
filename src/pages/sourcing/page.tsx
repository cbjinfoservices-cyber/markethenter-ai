import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import { loadTarget, makeFormatters, num, queueCalculation, loadScenarios } from '@/pages/home/calcModel';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { useBackToTopShortcut } from '@/pages/home/useBackToTopShortcut';
import AccountMenu from '@/pages/home/components/AccountMenu';
import PageBurger from '@/pages/home/components/PageBurger';
import SupplierDuePill from '@/pages/suppliers/components/SupplierDuePill';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import { canCalculateProduct, rowFor, valuesFor } from '@/pages/sourcing/productMargin';
import type { SourcingCategory, SourcingRow } from '@/pages/sourcing/productMargin';
import useSourcingCatalog from '@/pages/sourcing/useSourcingCatalog';
import { itemFromRow, itemFromScenario } from '@/pages/sourcing/compareItem';
import type { CompareItem } from '@/pages/sourcing/compareItem';
import { readMinMargin, rememberMinMargin } from '@/pages/sourcing/minMarginMemory';
import {
  DEFAULT_VIEW,
  isDefaultView,
  isSortKey,
  readView,
  rememberView,
} from '@/pages/sourcing/viewMemory';
import type { ViewMemory } from '@/pages/sourcing/viewMemory';
import { readCompare, rememberCompare } from '@/pages/sourcing/compareMemory';
import type { CompareMemory } from '@/pages/sourcing/compareMemory';
import { buildViewLine } from '@/pages/sourcing/viewLine';
import useClearFiltersShortcut from '@/pages/sourcing/useClearFiltersShortcut';
import useFlipOrderShortcut from '@/pages/sourcing/useFlipOrderShortcut';
import { buildHistoryCsv, historyCsvFilename } from '@/pages/sourcing/historyCsv';
import { formatTraceWhen } from '@/pages/sourcing/viewHistory';
import type { ViewTrace } from '@/pages/sourcing/viewHistory';
import { arrangeGrid, diffGrid, isEmptyDiff } from '@/pages/sourcing/arrangeGrid';
import type { GridConfig } from '@/pages/sourcing/arrangeGrid';
import { fetchSourcingCloud, saveSourcingCloud } from '@/pages/sourcing/sourcingCloud';
import { parseCompareCsv } from '@/pages/sourcing/compareImport';
import type { ImportedCompareRow } from '@/pages/sourcing/compareImport';
import { buildCompareCsv, compareCsvFilename } from '@/pages/sourcing/compareCsv';
import { buildCompareText } from '@/pages/sourcing/compareText';
import { downloadCsv } from '@/pages/home/calcExport';
import type { CsvRecipient } from '@/pages/home/calcExport';
import {
  loadSupplierEmails,
  loadSupplierNames,
  persistSupplierEmails,
  SECOND_SUFFIX,
} from '@/pages/home/priceHistory';
/* The same light/dark preference as the calculator and the dashboard, so the
   three work pages read the same way in a long session. */
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
import { clearFixing, markFixing } from '@/pages/home/scenarioFix';
import { readScenarios } from '@/pages/sourcing/scenarioPicker';
import type { ScenarioPick } from '@/pages/sourcing/scenarioPicker';
import {
  EMPTY_RECIPIENT,
  readCompareRecipients,
  rememberCompareRecipients,
} from '@/pages/sourcing/compareRecipients';
import type { CompareRecipient, RecipientMap } from '@/pages/sourcing/compareRecipients';
import { loadMailLog, mailKey } from '@/pages/dashboard/mailLog';
import { loadProductMail } from '@/pages/sourcing/productMailLog';
import { contactNameKey } from '@/pages/sourcing/contactsCsv';
import {
  forgetImportedContact,
  recordImportedContacts,
  useImportedContacts,
} from '@/pages/sourcing/importedContacts';
import type { ContactGapRow, ImportedContact } from '@/pages/sourcing/contactsCsv';
import ProductCard from '@/pages/sourcing/components/ProductCard';
import PriceReviewCard from '@/pages/sourcing/components/PriceReviewCard';
import { SUSPECT_PRICE_CEILING } from '@/pages/sourcing/manualPrices';
import CompareBoard from '@/pages/sourcing/components/CompareBoard';
import ComparePrint from '@/pages/sourcing/components/ComparePrint';
import SourcingFilters, {
  MARGIN_CEIL,
  MARGIN_OFF,
} from '@/pages/sourcing/components/SourcingFilters';
import SortIndicator from '@/pages/sourcing/components/SortIndicator';
import MedianMarker from '@/pages/sourcing/components/MedianMarker';
import ViewSummary from '@/pages/sourcing/components/ViewSummary';
import type { SortKey, SortThen, VerdictFilter } from '@/pages/sourcing/components/SourcingFilters';
import {
  pruneSaved,
  readSaved,
  readScenarioNames,
  rememberSaved,
  saveSourcedScenario,
  scenarioNameFor,
} from '@/pages/sourcing/saveScenario';
import type { SavedEntry, SavedMap } from '@/pages/sourcing/saveScenario';
import '@/pages/home/film.css';
import '@/pages/dashboard/dash.css';
import '@/pages/sourcing/sourcing.css';
/* Le plancher de contraste du thème clair, partagé par les pages de travail. */
import '@/pages/home/workContrast.css';

export default function Sourcing() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const [goodFloor] = useGoodFloor();
  const [targetNet, setTargetNet] = useState<number>(() => num(loadTarget()));
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  const { products, source, loading, error, failedCategory, missingCategories, pending, setManualPrice, refresh } = useSourcingCatalog();
  /* The board reopens where the reader left it: same category, verdict, sorting. */
  const [view] = useState<ViewMemory>(() => readView());
  const [category, setCategory] = useState<SourcingCategory | 'all'>(view.category);
  const [sort, setSort] = useState<SortKey>(view.sort);
  /** Second sort, only used to separate rows the first one leaves tied. */
  const [sort2, setSort2] = useState<SortThen>(view.sort2);
  /** The grid reads the other way round — one click flips the whole order. */
  const [flip, setFlip] = useState<boolean>(view.flip);
  const [verdict, setVerdict] = useState<VerdictFilter>(view.verdict);
  /** Lowest net margin the reader accepts, remembered from visit to visit. */
  const [minMargin, setMinMargin] = useState<number>(() => readMinMargin());
  /* The two comparison columns come back too, as they were left. */
  const [compareStart] = useState<CompareMemory>(() => readCompare());
  const [compareIds, setCompareIds] = useState<string[]>(compareStart.products);
  /** A dashboard scenario put side by side with a sourced listing. */
  const [compareScenarioId, setCompareScenarioId] = useState<number | null>(
    compareStart.scenarioId,
  );
  const [scenarioPicks, setScenarioPicks] = useState<ScenarioPick[]>([]);
  const [picksLoaded, setPicksLoaded] = useState(false);
  const [scenariosEpoch, setScenariosEpoch] = useState(0);
  const [printing, setPrinting] = useState(false);
  /** A re-imported file whose margin floor differs from the account's. */
  const [pendingImport, setPendingImport] = useState<{
    rows: ImportedCompareRow[];
    fileMargin: number;
  } | null>(null);
  /* True once the account's stored board has been read: no write before it. */
  const [cloudReady, setCloudReady] = useState(false);
  /** When the account's board was last arranged — printed on the sheet. */
  const [viewSavedAt, setViewSavedAt] = useState<string | null>(null);
  /** The arrangements kept in the account, newest first (up to 30). */
  const [viewHistory, setViewHistory] = useState<ViewTrace[]>([]);
  /** A past arrangement put side by side with the live grid, by stamp. */
  const [compareAt, setCompareAt] = useState<string | null>(null);
  const pulledCloud = useRef<string | null>(null);
  const cloudTimer = useRef<number | null>(null);
  /** The board just came back from the account — that read is not a setting. */
  const primedSave = useRef(false);
  const [savedMap, setSavedMap] = useState<SavedMap>(() => readSaved());
  /* Le contact saisi directement sur une colonne « produit sourcé » : il part
     dans le nom du PDF, comme celui d'un scénario du calculateur. */
  const [productRecipients, setProductRecipients] = useState<RecipientMap>(() =>
    readCompareRecipients(),
  );
  /* Les colonnes dont l'adresse vient du fichier de travail : le comparatif
     marque alors la fiche d'un petit « importé le … ». */
  const importedContacts = useImportedContacts();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'ok' | 'warn' | 'error';
    text: string;
    /** Only an actual save points the reader to the dashboard. */
    link?: boolean;
  } | null>(null);
  /* A link from the Modules page opens the board already filtered. */
  const [searchParams] = useSearchParams();
  const [preset, setPreset] = useState<{ min: number; median: boolean } | null>(null);
  const presetApplied = useRef(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useBackToTopShortcut();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    setTargetNet(num(loadTarget()));
  }, []);

  /*
   * The board arranged on one device reopens the same way on another: the sort,
   * the filters and the two comparison columns are read from the account once
   * per session. A brand-new account simply takes this device's posture.
   */
  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId) {
      pulledCloud.current = null;
      primedSave.current = false;
      setCloudReady(false);
      return undefined;
    }
    if (pulledCloud.current === userId) return undefined;
    pulledCloud.current = userId;
    let cancelled = false;
    fetchSourcingCloud(userId)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud.view) {
          setCategory(cloud.view.category);
          setVerdict(cloud.view.verdict);
          setSort(cloud.view.sort);
          setSort2(cloud.view.sort2);
          setFlip(cloud.view.flip);
        }
        if (cloud.compare) {
          setCompareIds(cloud.compare.products);
          setCompareScenarioId(cloud.compare.scenarioId);
        }
        /* The margin requirement follows the account, like the green floor. */
        if (cloud.minMargin !== null) {
          setMinMargin(cloud.minMargin);
          rememberMinMargin(cloud.minMargin);
        }
        setViewSavedAt(cloud.savedAt);
        setViewHistory(cloud.history);
        if (!cloud.view && !cloud.compare && cloud.minMargin === null) {
          void saveSourcingCloud(userId, {
            view: readView(),
            compare: readCompare(),
            minMargin: readMinMargin(),
          })
            .then((saved) => {
              setViewSavedAt(saved.savedAt);
              setViewHistory(saved.history);
            })
            .catch(() => undefined);
        }
        setCloudReady(true);
      })
      .catch(() => {
        if (!cancelled) pulledCloud.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /* The remembered columns must still exist — a stale id is dropped quietly. */
  useEffect(() => {
    if (products.length === 0) return;
    setCompareIds((prev) => {
      const next = prev.filter((id) => products.some((product) => product.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [products]);

  useEffect(() => {
    const memory: ViewMemory = { category, verdict, sort, sort2, flip };
    const comparison: CompareMemory = {
      products: compareIds,
      scenarioId: compareScenarioId,
    };
    rememberView(memory);
    rememberCompare(comparison);

    const userId = user?.id ?? null;
    if (!userId || !cloudReady) return undefined;
    /* Reopening the board is not a setting: skip the write that follows the
       account read, so the printed date stays the last real arrangement. */
    if (!primedSave.current) {
      primedSave.current = true;
      return undefined;
    }
    /* One write once the reader settles, not one per click. */
    if (cloudTimer.current !== null) window.clearTimeout(cloudTimer.current);
    cloudTimer.current = window.setTimeout(() => {
      void saveSourcingCloud(userId, {
        view: memory,
        compare: comparison,
        minMargin,
      })
        .then((saved) => {
              setViewSavedAt(saved.savedAt);
              setViewHistory(saved.history);
            })
        .catch(() => undefined);
    }, 700);
    return () => {
      if (cloudTimer.current !== null) window.clearTimeout(cloudTimer.current);
    };
  }, [
    category,
    verdict,
    sort,
    sort2,
    flip,
    minMargin,
    compareIds,
    compareScenarioId,
    user?.id,
    cloudReady,
  ]);

  /* The saved badges must match the scenarios that still exist. */
  useEffect(() => {
    let cancelled = false;
    readScenarioNames(user?.id ?? null)
      .then((names) => {
        if (cancelled || names === null) return;
        setSavedMap(pruneSaved(names));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /* The dashboard scenarios available for a side-by-side comparison. */
  useEffect(() => {
    let cancelled = false;
    readScenarios(user?.id ?? null)
      .then((picks) => {
        if (cancelled) return;
        setScenarioPicks(picks);
        setPicksLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPicksLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, scenariosEpoch]);

  /* A scenario deleted elsewhere must not stay in the comparison. */
  useEffect(() => {
    if (!picksLoaded || compareScenarioId === null) return;
    if (!scenarioPicks.some((pick) => pick.scenario.id === compareScenarioId)) {
      setCompareScenarioId(null);
    }
  }, [picksLoaded, scenarioPicks, compareScenarioId]);

  /* Le contact saisi sur une colonne de produit sourcé est mémorisé dans le
     navigateur : il revient à la prochaine visite. */
  useEffect(() => {
    rememberCompareRecipients(productRecipients);
  }, [productRecipients]);

  const setProductRecipient = useCallback(
    (key: string, patch: Partial<CompareRecipient>) => {
      setProductRecipients((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? EMPTY_RECIPIENT), ...patch },
      }));
    },
    [],
  );

  /* The requirement is remembered, so the slider lands where it was left. */
  const applyMinMargin = useCallback((value: number) => {
    setMinMargin(value);
    rememberMinMargin(value);
  }, []);

  /* Everything the board carries — filters, sorting, margin — goes back to a
     neutral grid, written to the account right away so every device follows. */
  const resetAccountView = useCallback(() => {
    setCategory(DEFAULT_VIEW.category);
    setVerdict(DEFAULT_VIEW.verdict);
    setSort(DEFAULT_VIEW.sort);
    setSort2(DEFAULT_VIEW.sort2);
    setFlip(DEFAULT_VIEW.flip);
    setPreset(null);
    applyMinMargin(MARGIN_OFF);
    rememberView(DEFAULT_VIEW);

    const userId = user?.id ?? null;
    if (userId) {
      void saveSourcingCloud(userId, {
        view: DEFAULT_VIEW,
        compare: { products: compareIds, scenarioId: compareScenarioId },
        minMargin: MARGIN_OFF,
      })
        .then((saved) => {
              setViewSavedAt(saved.savedAt);
              setViewHistory(saved.history);
            })
        .catch(() => undefined);
    }
    setNotice({ tone: 'ok', text: t('home.sourcing.viewResetDone') });
  }, [applyMinMargin, user?.id, compareIds, compareScenarioId, t]);

  /* A narrower reset: the filters and the margin floor go, the sorting stays
     exactly as the reader arranged it — here and in the account. */
  const clearFiltersKeepSort = useCallback(() => {
    const kept: ViewMemory = {
      category: DEFAULT_VIEW.category,
      verdict: DEFAULT_VIEW.verdict,
      sort,
      sort2,
      flip,
    };
    setCategory(kept.category);
    setVerdict(kept.verdict);
    setPreset(null);
    applyMinMargin(MARGIN_OFF);
    rememberView(kept);

    const userId = user?.id ?? null;
    if (userId) {
      void saveSourcingCloud(userId, {
        view: kept,
        compare: { products: compareIds, scenarioId: compareScenarioId },
        minMargin: MARGIN_OFF,
      })
        .then((saved) => {
              setViewSavedAt(saved.savedAt);
              setViewHistory(saved.history);
            })
        .catch(() => undefined);
    }
    setNotice({ tone: 'ok', text: t('home.sourcing.filtersClearDone') });
  }, [applyMinMargin, user?.id, compareIds, compareScenarioId, sort, sort2, flip, t]);

  /* One click puts a past arrangement back — filtering, sorting, grid order and
     the margin floor — here and in the account, so every device follows. */
  const restoreTrace = useCallback(
    (entry: ViewTrace) => {
      setCategory(entry.view.category);
      setVerdict(entry.view.verdict);
      setSort(entry.view.sort);
      setSort2(entry.view.sort2);
      setFlip(entry.view.flip);
      setPreset(null);
      applyMinMargin(entry.minMargin);
      rememberView(entry.view);

      const userId = user?.id ?? null;
      if (userId) {
        void saveSourcingCloud(userId, {
          view: entry.view,
          compare: { products: compareIds, scenarioId: compareScenarioId },
          minMargin: entry.minMargin,
        })
          .then((saved) => {
            setViewSavedAt(saved.savedAt);
            setViewHistory(saved.history);
          })
          .catch(() => undefined);
      }
      setNotice({
        tone: 'ok',
        text: t('home.sourcing.histRestoreDone', {
          date: formatTraceWhen(entry.at, locale),
        }),
      });
    },
    [applyMinMargin, user?.id, compareIds, compareScenarioId, t, locale],
  );

  /* The whole kept history as a small archive file, one row per setting. */
  const exportHistory = useCallback(() => {
    const csv = buildHistoryCsv(viewHistory, (key, options) => t(key, options), locale);
    const ok = downloadCsv(historyCsvFilename(), csv);
    setNotice({
      tone: ok ? 'ok' : 'error',
      text: ok ? t('home.sourcing.histCsvDone') : t('home.sourcing.histCsvFail'),
    });
  }, [viewHistory, locale, t]);

  /* Something is actually narrowing the grid — Shift + F drops those filters
     without touching the sorting the reader arranged. */
  const canClearFilters = category !== 'all' || verdict !== 'all' || minMargin > MARGIN_OFF;  useClearFiltersShortcut({ enabled: canClearFilters, onTrigger: clearFiltersKeepSort });

  const { items: burgerItems, signedIn } = useSiteNavigation();

  /* Every listing, costed and put on the traffic light at the reader's floor. */
  const rows = useMemo(
    () => products.map((product) => rowFor(product, targetNet, goodFloor)),
    [products, targetNet, goodFloor],
  );

  /* Shift + I reverses the grid order, exactly like the button under the filters. */
  const toggleFlip = useCallback(() => setFlip((prev) => !prev), []);
  useFlipOrderShortcut({ enabled: rows.length > 1, onTrigger: toggleFlip });

  const best = useMemo(() => {
    if (rows.length === 0) return null;
    return rows.reduce((top, row) => (row.metrics.net > top.metrics.net ? row : top), rows[0]);
  }, [rows]);

  /* The live posture of the board, shared with every past arrangement so the
     two are always compared on the very same rules. */
  const gridConfig = useMemo<GridConfig>(
    () => ({ category, verdict, sort, sort2, flip, minMargin, locale }),
    [category, verdict, sort, sort2, flip, minMargin, locale],
  );

  const visible = useMemo(() => arrangeGrid(rows, gridConfig), [rows, gridConfig]);

  /* The past arrangement the reader puts beside the grid, if any. */
  const compareTrace = useMemo(
    () => (compareAt ? viewHistory.find((entry) => entry.at === compareAt) ?? null : null),
    [compareAt, viewHistory],
  );

  /* A comparison only holds while that stamp is still in the history. */
  useEffect(() => {
    if (compareAt && !compareTrace) setCompareAt(null);
  }, [compareAt, compareTrace]);

  /* The grid as that day would have left it — same rows, same order. */
  const compareRows = useMemo(() => {
    if (!compareTrace) return null;
    return arrangeGrid(rows, {
      category: compareTrace.view.category,
      verdict: compareTrace.view.verdict,
      sort: compareTrace.view.sort,
      sort2: compareTrace.view.sort2,
      flip: compareTrace.view.flip,
      minMargin: compareTrace.minMargin,
      locale,
    });
  }, [rows, compareTrace, locale]);

  const gridDiff = useMemo(
    () => (compareRows ? diffGrid(visible, compareRows) : null),
    [visible, compareRows],
  );

  /* While comparing, the rows that would come in are shown too — after the
     live ones — so both sides of the change sit on the same board. */
  const shownRows = useMemo(() => {
    if (!compareRows || !gridDiff) return visible;
    const incoming = compareRows.filter((row) => gridDiff.entering.has(row.product.id));
    return [...visible, ...incoming];
  }, [visible, compareRows, gridDiff]);

  const compareStateOf = (id: string): 'leaving' | 'entering' | 'moved' | 'same' | null => {
    if (!gridDiff) return null;
    if (gridDiff.leaving.has(id)) return 'leaving';
    if (gridDiff.entering.has(id)) return 'entering';
    if (gridDiff.moved.has(id)) return 'moved';
    return 'same';
  };

  const comparePositionOf = (id: string): number | null => gridDiff?.moved.get(id) ?? null;

  const totals = useMemo(() => {
    const margins = rows.map((row) => row.metrics.netMargin).sort((a, b) => a - b);
    const median =
      margins.length === 0
        ? 0
        : margins.length % 2 === 1
          ? margins[(margins.length - 1) / 2]
          : (margins[margins.length / 2 - 1] + margins[margins.length / 2]) / 2;
    const green = rows.filter((row) => row.level === 'good');
    const monthly = [...rows]
      .sort((a, b) => b.metrics.monthly - a.metrics.monthly)
      .slice(0, 3)
      .reduce((sum, row) => sum + row.metrics.monthly, 0);
    return { median, green: green.length, monthly };
  }, [rows]);

  /* Where the catalogue median sits on the board, and who is on each side. */
  const medianStats = useMemo(() => {
    if (rows.length === 0) return null;
    const margins = rows.map((row) => row.metrics.netMargin);
    return {
      low: Math.min(...margins),
      high: Math.max(...margins),
      above: margins.filter((value) => value > totals.median).length,
      below: margins.filter((value) => value < totals.median).length,
    };
  }, [rows, totals.median]);

  /* Link from the Modules page: `sort`, `min` (`median` or a percentage) and
     `verdict` land as the starting view. Applied once, then the reader drives. */
  useEffect(() => {
    if (presetApplied.current) return;
    const sortParam = searchParams.get('sort');
    const minParam = searchParams.get('min');
    const verdictParam = searchParams.get('verdict');
    if (sortParam === null && minParam === null && verdictParam === null) {
      presetApplied.current = true;
      return;
    }
    /* The median only exists once the catalogue is on the board. */
    if (minParam === 'median' && rows.length === 0) return;

    presetApplied.current = true;
    if (isSortKey(sortParam)) setSort(sortParam);
    if (verdictParam === 'all' || verdictParam === 'good' || verdictParam === 'risk') {
      setVerdict(verdictParam);
    }

    let applied: number | null = null;
    if (minParam === 'median') applied = Math.round(totals.median);
    else if (minParam !== null && Number.isFinite(Number(minParam))) {
      applied = Number(minParam);
    }

    if (applied !== null && Number.isFinite(applied)) {
      const floor = Math.min(MARGIN_CEIL, Math.max(MARGIN_OFF, applied));
      if (floor > MARGIN_OFF) {
        setMinMargin(floor);
        setPreset({ min: floor, median: minParam === 'median' });
      }
    }
  }, [searchParams, rows.length, totals.median]);

  const onRefresh = () => {
    void refresh(category);
  };

  /* The comparison keeps its picks even when a filter hides them. */
  const compareItems = useMemo<CompareItem[]>(() => {
    const picked: CompareItem[] = [];
    compareIds.forEach((id) => {
      const row = rows.find((item) => item.product.id === id);
      if (row) picked.push(itemFromRow(row));
    });
    if (compareScenarioId !== null) {
      const pick = scenarioPicks.find((entry) => entry.scenario.id === compareScenarioId);
      if (pick) {
        picked.push(itemFromScenario(pick.scenario, targetNet, goodFloor, pick.scenario.name));
      }
    }
    return picked;
  }, [compareIds, rows, compareScenarioId, scenarioPicks, targetNet, goodFloor]);

  /** True once the board holds its two columns, whatever their origin. */
  const compareFull = compareIds.length + (compareScenarioId !== null ? 1 : 0) >= 2;
  const scenarioLocked = compareIds.length >= 2 && compareScenarioId === null;

  /* Le nom et l'adresse du fournisseur déjà saisis dans le calculateur : le
     comparatif imprimé porte le bon destinataire dans le nom de son PDF, comme
     les feuilles du calculateur. Les colonnes encore sans adresse sont
     rassemblées à part, pour être complétées avant l'envoi. */
  const printContacts = useMemo<{
    recipients: CsvRecipient[];
    missing: { key: string; name: string; kind: 'product' | 'scenario' }[];
    known: { key: string; name: string; kind: 'product' | 'scenario'; email: string }[];
  }>(() => {
    const names = loadSupplierNames();
    const emails = loadSupplierEmails();
    const seen = new Set<string>();
    const recipients: CsvRecipient[] = [];
    const missing: { key: string; name: string; kind: 'product' | 'scenario' }[] = [];
    const known: { key: string; name: string; kind: 'product' | 'scenario'; email: string }[] = [];
    compareItems.forEach((item) => {
      /* Un scénario porte le contact du calculateur, un produit sourcé celui
         saisi directement sur sa colonne. */
      const direct = productRecipients[item.key];
      let name = '';
      let email = '';
      if (item.origin === 'scenario') {
        const id = Number(item.key.replace('scenario-', ''));
        if (!Number.isFinite(id)) return;
        name = (names[`s${id}`] ?? '').trim();
        email = (emails[`s${id}`] ?? '').trim();
        /* Le second devis peut porter la seule adresse connue. */
        if (email === '') email = (emails[`s${id}${SECOND_SUFFIX}`] ?? '').trim();
      } else {
        name = (direct?.name ?? '').trim();
        email = (direct?.email ?? '').trim();
      }
      if (email === '') {
        missing.push({ key: item.key, name: item.name, kind: item.origin });
        return;
      }
      known.push({ key: item.key, name: item.name, kind: item.origin, email });
      const key = email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      recipients.push({ name, email });
    });
    return { recipients, missing, known };
  }, [compareItems, productRecipients]);
  const printRecipients = printContacts.recipients;

  /* La date du dernier e-mail copié, par colonne : celle d'un scénario vient du
     journal du tableau de bord, celle d'un produit sourcé de son propre journal.
     Elle s'imprime sur le comparatif pour savoir ce qui est déjà parti — avec
     l'adresse du fournisseur qui a reçu le message. */
  const printMailInfo = useMemo<{
    sent: Record<string, number>;
    emails: Record<string, string>;
  }>(() => {
    const log = loadMailLog();
    const productLog = loadProductMail();
    const supplierEmails = loadSupplierEmails();
    const sent: Record<string, number> = {};
    const emails: Record<string, string> = {};
    compareItems.forEach((item) => {
      if (item.origin !== 'scenario') {
        const stamp = productLog[item.key];
        if (!Number.isFinite(stamp) || stamp <= 0) return;
        sent[item.key] = stamp;
        const address = (productRecipients[item.key]?.email ?? '').trim();
        if (address !== '') emails[item.key] = address;
        return;
      }
      const id = Number(item.key.replace('scenario-', ''));
      if (!Number.isFinite(id)) return;
      const stampA = log[mailKey(id, 'a')] ?? 0;
      const stampB = log[mailKey(id, 'b')] ?? 0;
      const stamp = Math.max(stampA, stampB);
      if (stamp <= 0) return;
      sent[item.key] = stamp;
      /* Le devis réellement écrit : le second s'il est le dernier contacté. */
      const first = (supplierEmails[`s${id}`] ?? '').trim();
      const second = (supplierEmails[`s${id}${SECOND_SUFFIX}`] ?? '').trim();
      const address = stampB > stampA ? second || first : first || second;
      if (address !== '') emails[item.key] = address;
    });
    return { sent, emails };
    /* Recalculé à chaque ouverture de la feuille. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareItems, productRecipients, printing]);
  const printMailSent = printMailInfo.sent;
  const printMailEmails = printMailInfo.emails;

  /* Les adresses ramenées par le fichier de travail, avec leur date : la feuille
     les rappelle à côté de la date d'envoi, colonne par colonne. */
  const printImported = useMemo<Record<string, { at: number; email: string }>>(() => {
    const out: Record<string, { at: number; email: string }> = {};
    const known = new Map(printContacts.known.map((entry) => [entry.key, entry.email]));
    const emails = loadSupplierEmails();
    compareItems.forEach((item) => {
      const stamp = importedContacts[item.key];
      if (typeof stamp !== 'number' || stamp <= 0) return;
      let email = known.get(item.key) ?? '';
      if (email === '' && item.origin === 'scenario') {
        const id = Number(item.key.replace('scenario-', ''));
        if (Number.isFinite(id)) {
          email =
            (emails[`s${id}`] ?? '').trim() ||
            (emails[`s${id}${SECOND_SUFFIX}`] ?? '').trim();
        }
      }
      out[item.key] = { at: stamp, email };
    });
    return out;
  }, [compareItems, importedContacts, printContacts.known]);

  /* Adresses connues mais jamais écrites : le papier sépare ce cas de la
     colonne réellement sans adresse. */
  const printUnwritten = useMemo(
    () => printContacts.known.filter((entry) => !(Number(printMailSent[entry.key]) > 0)),
    [printContacts.known, printMailSent],
  );

  /* Les fiches du comparatif à compléter, les deux cas dans une seule liste. */
  const printBoardGaps = useMemo<ContactGapRow[]>(() => {
    const rows: ContactGapRow[] = printContacts.missing.map((entry) => ({
      ...entry,
      email: '',
      gap: 'no-email',
      lastSent: null,
    }));
    printUnwritten.forEach((entry) => {
      rows.push({ ...entry, gap: 'unwritten', lastSent: null });
    });
    return rows;
  }, [printContacts.missing, printUnwritten]);

  /* L'état d'avancement de la feuille, rappelé aussi à l'écran, à côté du
     bouton d'impression : fiches à compléter, fiches à relancer, et adresses
     ramenées par le fichier de travail. */
  const sheetProgress = useMemo(
    () => ({
      todo: printBoardGaps.length,
      relance: compareItems.filter((item) => !(Number(printMailSent[item.key]) > 0)).length,
      imported: compareItems.filter((item) => (importedContacts[item.key] ?? 0) > 0).length,
    }),
    [printBoardGaps.length, compareItems, printMailSent, importedContacts],
  );

  /* Un clic depuis la barre de filtres amène au comparatif, là où les
     adresses importées se lisent colonne par colonne. */
  const jumpToCompare = useCallback(() => {
    document
      .querySelector('.src-compare')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* Le fichier de travail, prêt à remplir dans Excel : le comparatif, plus les
     scénarios du tableau de bord dont aucun fournisseur n'a d'adresse. */
  const printContactCsv = useMemo<ContactGapRow[]>(() => {
    const rows: ContactGapRow[] = [...printBoardGaps];
    const inBoard = new Set(printBoardGaps.map((entry) => entry.key));
    const emails = loadSupplierEmails();
    loadScenarios().forEach((scenario) => {
      if (inBoard.has(`scenario-${scenario.id}`)) return;
      const a = (emails[`s${scenario.id}`] ?? '').trim();
      const b = (emails[`s${scenario.id}${SECOND_SUFFIX}`] ?? '').trim();
      if (a !== '' || b !== '') return;
      rows.push({
        key: `s${scenario.id}`,
        name: scenario.name.trim() || t('home.sourcing.saveFallbackName'),
        kind: 'scenario',
        email: '',
        gap: 'no-email',
        lastSent: null,
      });
    });
    return rows;
  }, [printBoardGaps, t]);

  /* Le fichier de travail revient rempli : chaque adresse retrouve sa fiche.
     Une colonne garde son adresse si elle en avait déjà une, et le compteur du
     menu se remet à jour tout seul. */
  const importContacts = useCallback(
    (contacts: ImportedContact[]): number => {
      if (contacts.length === 0) return 0;
      const byName = new Map<string, ContactGapRow>();
      printContactCsv.forEach((row) => {
        const key = contactNameKey(row.name);
        if (!byName.has(key)) byName.set(key, row);
      });

      const supplierEmails = loadSupplierEmails();
      const nextRecipients: RecipientMap = { ...productRecipients };
      let filled = 0;
      let savedSupplier = false;
      /* Les fiches réellement remplies : elles porteront le badge d'import. */
      const filledKeys: string[] = [];
      /* Le nom et l'adresse de chaque fiche remplie : le journal des réimports
         les garde, même après un effacement des traces. */
      const filledDetails: Record<string, { name: string; email: string }> = {};

      contacts.forEach((contact) => {
        const row = byName.get(contactNameKey(contact.name));
        /* Une fiche qui a déjà son adresse n'est jamais écrasée. */
        if (!row || row.email.trim() !== '') return;

        if (row.key.startsWith('scenario-')) {
          const id = Number(row.key.replace('scenario-', ''));
          if (!Number.isFinite(id)) return;
          if ((supplierEmails[`s${id}`] ?? '') === '') {
            supplierEmails[`s${id}`] = contact.email;
            savedSupplier = true;
            filled += 1;
            filledKeys.push(row.key);
            filledDetails[row.key] = { name: row.name, email: contact.email };
          }
          return;
        }

        if (/^s\d+$/.test(row.key)) {
          if ((supplierEmails[row.key] ?? '') === '') {
            supplierEmails[row.key] = contact.email;
            savedSupplier = true;
            filled += 1;
            filledKeys.push(row.key);
            filledDetails[row.key] = { name: row.name, email: contact.email };
          }
          return;
        }

        const current = (nextRecipients[row.key]?.email ?? '').trim();
        if (current !== '') return;
        nextRecipients[row.key] = {
          ...(nextRecipients[row.key] ?? EMPTY_RECIPIENT),
          email: contact.email,
        };
        filled += 1;
        filledKeys.push(row.key);
        filledDetails[row.key] = { name: row.name, email: contact.email };
      });

      if (savedSupplier) persistSupplierEmails(supplierEmails);
      /* Le badge « importé le … » garde la trace du fichier, fiche par fiche. */
      if (filledKeys.length > 0)
        recordImportedContacts(filledKeys, Date.now(), filledDetails);
      if (filled > 0) {
        setProductRecipients(nextRecipients);
        setNotice({
          tone: 'ok',
          text: t('home.sourcing.printContactsImportNotice', { count: filled }),
        });
      }
      return filled;
    },
    [printContactCsv, productRecipients, t],
  );

  /* Une colonne repart d'une fiche propre : le nom et l'adresse sont effacés
     d'un seul geste, et le badge d'import avec eux. La date d'envoi reste, elle
     dit qu'un message est réellement parti. */
  const clearColumnContact = useCallback(
    (key: string, name: string) => {
      setProductRecipients((prev) => {
        if (!prev[key]) return prev;
        const next: RecipientMap = { ...prev };
        delete next[key];
        return next;
      });
      forgetImportedContact(key);
      setNotice({ tone: 'ok', text: t('home.sourcing.compareToCleared', { name }) });
    },
    [t],
  );

  /* Toutes les adresses des colonnes repartent d'un coup : le nom et l'adresse
     sont effacés, et le badge d'import avec eux. La date d'envoi reste, elle
     dit qu'un message est réellement parti. */
  const clearAllColumnContacts = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return;
      setProductRecipients((prev) => {
        const next: RecipientMap = { ...prev };
        keys.forEach((key) => {
          delete next[key];
        });
        return next;
      });
      keys.forEach((key) => forgetImportedContact(key));
      setNotice({
        tone: 'ok',
        text: t('home.sourcing.compareClearAllDone', { count: keys.length }),
      });
    },
    [t],
  );

  /* A spreadsheet copy of the board, for suppliers who rework the figures. */
  const exportCompare = useCallback(() => {
    /* The file keeps the trace of the threshold it was built with. */
    const viewLine = buildViewLine(
      {
        category,
        verdict,
        sort,
        sort2,
        flip,
        minMargin,
        inAccount: cloudReady,
        locale,
      },
      (key, options) => t(key, options),
    );
    const savedAtText =
      cloudReady && viewSavedAt
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(viewSavedAt))
        : null;
    const csv = buildCompareCsv(compareItems, locale, (key: string) => t(key), totals.median, {
      viewLine,
      savedAtText,
      /* The floor travels with the file, so the import can compare it later. */
      minMargin,
    });
    const ok = downloadCsv(compareCsvFilename(), csv);
    setNotice({
      tone: ok ? 'ok' : 'error',
      text: ok ? t('home.sourcing.compareCsvDone') : t('home.sourcing.compareCsvFail'),
    });
  }, [
    compareItems,
    locale,
    totals.median,
    t,
    category,
    verdict,
    sort,
    sort2,
    flip,
    minMargin,
    cloudReady,
    viewSavedAt,
  ]);

  /* Same comparison, but as plain text ready to paste into a message. */
  const copyCompare = useCallback(async () => {
    const text = buildCompareText(
      compareItems,
      locale,
      (key: string) => t(key),
      totals.median,
      /* The supplier sees which settings produced these figures. */
      buildViewLine(
        {
          category,
          verdict,
          sort,
          sort2,
          flip,
          minMargin,
          inAccount: cloudReady,
          locale,
        },
        (key, options) => t(key, options),
      ),
    );
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
      await navigator.clipboard.writeText(text);
      setNotice({ tone: 'ok', text: t('home.sourcing.compareCopyDone') });
    } catch {
      setNotice({ tone: 'error', text: t('home.sourcing.compareCopyFail') });
    }
  }, [
    compareItems,
    locale,
    totals.median,
    category,
    verdict,
    sort,
    sort2,
    flip,
    minMargin,
    cloudReady,
    t,
  ]);

  /* The rows are read: send the first one into the calculator, ready to quote. */
  const loadImported = useCallback(
    (rows: ImportedCompareRow[]) => {
      const [first] = rows;
      if (!first) return;
      clearFixing();
      queueCalculation(first.values, null);
      setPendingImport(null);
      setNotice({
        tone: 'ok',
        text: t('home.sourcing.compareImportDone', {
          n: rows.length,
          name: first.name || t('home.sourcing.saveFallbackName'),
        }),
      });
      navigate('/calculateur#calculator');
    },
    [navigate, t],
  );

  /* The supplier sends the retouched file back: its numbers reopen in the
     calculator, ready to be quoted again. A file built with another margin
     floor is announced first — the reader decides. */
  const importCompare = useCallback(
    async (file: File) => {
      try {
        const parsed = parseCompareCsv(await file.text());
        if (!parsed.ok) {
          setPendingImport(null);
          setNotice({ tone: 'error', text: t('home.sourcing.compareImportFail') });
          return;
        }
        const { rows, fileMargin } = parsed.data;
        if (fileMargin !== null && Math.abs(fileMargin - minMargin) >= 0.5) {
          setNotice(null);
          setPendingImport({ rows, fileMargin });
          return;
        }
        loadImported(rows);
      } catch {
        setNotice({ tone: 'error', text: t('home.sourcing.compareImportFail') });
      }
    },
    [loadImported, minMargin, t],
  );

  /* Reopening a scenario carries its numbers into the calculator so the buy
     price can be reworked on a real quote. */
  const openScenarioInCalc = useCallback((item: CompareItem) => {
    if (!item.values) return;
    const raw = Number(item.key.replace('scenario-', ''));
    const id = Number.isFinite(raw) && raw > 0 ? raw : null;
    if (id !== null && item.level === 'bad') markFixing(id, true);
    else clearFixing();
    queueCalculation(item.values, id);
  }, []);

  const toggleCompare = useCallback(
    (id: string) => {
      setCompareIds((prev) => {
        if (prev.includes(id)) return prev.filter((item) => item !== id);
        if (prev.length + (compareScenarioId !== null ? 1 : 0) >= 2) return prev;
        return [...prev, id];
      });
    },
    [compareScenarioId],
  );

  const removeCompareItem = useCallback(
    (key: string) => {
      if (key.startsWith('scenario-')) setCompareScenarioId(null);
      else toggleCompare(key);
    },
    [toggleCompare],
  );

  const pickScenario = useCallback((key: string) => {
    if (key === '') {
      setCompareScenarioId(null);
      return;
    }
    const id = Number(key.replace('scenario-', ''));
    setCompareScenarioId(Number.isFinite(id) ? id : null);
  }, []);

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    setCompareScenarioId(null);
  }, []);

  /* One click writes the listing into the dashboard as a scenario, cloud first. */
  const saveScenario = async (row: SourcingRow) => {
    const { product } = row;
    if (!canCalculateProduct(product)) return;
    setSavingId(product.id);
    const name = scenarioNameFor(product.name, t('home.sourcing.saveFallbackName'));
    const outcome = await saveSourcedScenario(name, valuesFor(product), user?.id ?? null);
    setSavingId(null);

    if (outcome.ok === false) {
      setNotice({
        tone: outcome.reason === 'full' ? 'warn' : 'error',
        text:
          outcome.reason === 'full'
            ? t('home.sourcing.saveFull', { name })
            : t('home.sourcing.saveError'),
      });
      return;
    }

    const entry: SavedEntry = { id: outcome.id, name: outcome.name, where: outcome.where };
    setSavedMap(rememberSaved(product.id, entry));
    /* The new scenario is directly comparable, without a reload. */
    setScenariosEpoch((prev) => prev + 1);
    setNotice({
      tone: 'ok',
      link: true,
      text: outcome.updated
        ? t('home.sourcing.saveUpdateOk', { name: outcome.name })
        : t('home.sourcing.saveOk', { name: outcome.name }),
    });
  };

  return (
    <div className="dash-page" data-dash-skin={skin}>
      <header className="dash-nav">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="dash-nav-links" aria-label={t('home.sourcing.navLabel')}>
          <SiteNavigationLinks items={burgerItems} />
        </nav>
        <div className="nav-right">
          {signedIn && <SupplierDuePill />}
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
        <section className="dash-hero">
          <div className="dash-hero-copy">
            <p className="stamp">{t('home.sourcing.stamp')}</p>
            <h1>{t('home.sourcing.title')}</h1>
            <p className="dash-sub">{t('home.sourcing.intro')}</p>
            <div className="dash-hero-actions">
              <button type="button" className="btn src-refresh" onClick={onRefresh} disabled={loading}>
                <i
                  className={loading ? 'ri-loader-4-line dash-spin' : 'ri-refresh-line'}
                  aria-hidden="true"
                />
                {loading ? t('home.sourcing.refreshing') : t('home.sourcing.refresh')}
              </button>
              <span className={`dash-chip${source === 'live' ? ' is-cloud' : ''}`}>
                <i
                  className={source === 'live' ? 'ri-cloud-line' : 'ri-flask-line'}
                  aria-hidden="true"
                />
                {source === 'live' ? t('home.sourcing.sourceLive') : t('home.sourcing.sourceDemo')}
              </span>
            </div>
            <p className="src-provenance">
              <i className="ri-information-line" aria-hidden="true" />
              {source === 'live' ? t('home.sourcing.provenanceLive') : t('home.sourcing.provenance')}
            </p>
            <ViewSummary
              category={category}
              verdict={verdict}
              sort={sort}
              sort2={sort2}
              flip={flip}
              minMargin={minMargin}
              inAccount={cloudReady}
              locale={locale}
            />
          </div>

          <div className="dash-readout src-readout" aria-live="polite">
            {best ? (
              <>
                <span className="dash-readout-lab">{t('home.sourcing.bestTitle')}</span>
                <div className="src-readout-media">
                  <img
                    className="src-readout-img"
                    src={best.product.image}
                    alt={best.product.name}
                    title={`${best.product.name} · meilleure marge nette`}
                  />
                  <div className="src-readout-copy">
                    <b className="src-readout-name">{best.product.name}</b>
                    <span className="src-readout-cat">
                      {t(`home.sourcing.cat.${best.product.category}`)}
                    </span>
                  </div>
                </div>
                <b
                  className={`dash-readout-net${best.metrics.net < 0 ? ' is-neg' : ' is-pos'}`}
                >
                  {eur(best.metrics.net)}
                </b>
                <span className="dash-readout-name">{t('home.sourcing.bestNet')}</span>
                <div className="dash-readout-grid">
                  <div>
                    <span>{t('home.dash.margin')}</span>
                    <b>{pct(best.metrics.netMargin)}</b>
                  </div>
                  <div>
                    <span>{t('home.sourcing.roi')}</span>
                    <b>{pct(best.metrics.roi)}</b>
                  </div>
                  <div>
                    <span>{t('home.sourcing.targetShort')}</span>
                    <b>{best.threshold.feasible ? eur(best.threshold.minPrice) : '—'}</b>
                  </div>
                </div>
                <span className="dash-readout-note">{t('home.sourcing.bestNote')}</span>
              </>
            ) : (
              <>
                <span className="dash-readout-lab">{t('home.sourcing.bestTitle')}</span>
                <b className="dash-readout-net">—</b>
                <span className="dash-readout-note">{t('home.sourcing.empty')}</span>
              </>
            )}
          </div>
        </section>

        {error && (
          <p className="dash-error" role="status">
            <i className="ri-error-warning-line" aria-hidden="true" />
            {failedCategory && <>{t('home.sourcing.categoryStopped', { category: t(`home.sourcing.cat.${failedCategory}`) })} </>}
            {error === 'auth-required'
              ? <>{t('home.sourcing.authRequired')} <Link to="/compte">{t('home.account.signIn')}</Link></>
              : error === 'auth-unavailable'
                ? t('home.sourcing.authUnavailable')
            : error === 'prices-not-verified'
              ? t('home.sourcing.pricesNotVerified')
              : error === 'no-available-prices'
                ? t('home.sourcing.noAvailablePrices')
              : error.startsWith('price-verification-failed:')
                ? `${t('home.sourcing.priceVerificationFailed')} (${error.slice('price-verification-failed:'.length)})`
              : error === 'no-backend' || error === 'empty' || error === 'failed'
              ? t('home.sourcing.errorDemo')
              : error === 'function-unreachable'
                ? t('home.sourcing.errorFunctionUnreachable')
              : error === 'function-not-deployed'
                ? t('home.sourcing.errorFunction')
                : error === 'missing-key'
                  ? t('home.sourcing.errorKey')
                  : error === 'provider-auth'
                    ? t('home.sourcing.errorProviderAuth')
                    : t('home.sourcing.errorProvider')}
            <button type="button" className="dash-retry" onClick={onRefresh}>
              <i className="ri-refresh-line" aria-hidden="true" />
              {t('home.dash.retry')}
            </button>
          </p>
        )}

        {!loading && missingCategories.length > 0 && (
          <p className="src-provenance" role="status">
            {t('home.sourcing.cacheCategoriesMissing', {
              categories: missingCategories.map((item) => t(`home.sourcing.cat.${item}`)).join(', '),
            })}
          </p>
        )}

        <section className="dash-kpis" aria-label={t('home.sourcing.nav')}>
          <div className="dash-kpi">
            <span>{t('home.sourcing.kpiTracked')}</span>
            <b>{rows.length}</b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.sourcing.kpiMedian')}</span>
            <b>{rows.length > 0 ? pct(totals.median) : '—'}</b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.sourcing.kpiGreen')}</span>
            <b className={totals.green > 0 ? 'is-pos' : 'is-neg'}>
              {totals.green}/{rows.length}
            </b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.sourcing.kpiBest')}</span>
            <b className={best && best.metrics.net < 0 ? 'is-neg' : undefined}>
              {best ? eur(best.metrics.net) : '—'}
            </b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.sourcing.kpiMonthly')}</span>
            <b title={t('home.sourcing.kpiMonthlyHint')}>
              {rows.length > 0 ? eur(totals.monthly) : '—'}
            </b>
          </div>
        </section>

        <section className="dash-section src-section">
          <div className="dash-section-head">
            <h2>{t('home.sourcing.gridTitle')}</h2>
            <p>{t('home.sourcing.gridIntro', { value: eur(targetNet) })}</p>
          </div>

          <SourcingFilters
            category={category}
            onCategory={setCategory}
            sort={sort}
            onSort={(value) => {
              setSort(value);
              /* The tie-breaker must not repeat the primary sort. */
              if (sort2 === value) setSort2('none');
            }}
            sort2={sort2}
            onSort2={setSort2}
            verdict={verdict}
            onVerdict={setVerdict}
            shown={shownRows.length}
            total={rows.length}
            minMargin={minMargin}
            onMinMargin={applyMinMargin}
            goodFloor={goodFloor}
            locale={locale}
            remembered={!isDefaultView({ category, verdict, sort, sort2, flip })}
            inAccount={cloudReady}
            canReset={!isDefaultView({ category, verdict, sort, sort2, flip }) || minMargin > MARGIN_OFF}
            onResetView={resetAccountView}
            canClearFilters={canClearFilters}
            onClearFilters={clearFiltersKeepSort}
            savedAt={viewSavedAt}
            history={viewHistory}
            flip={flip}
            onRestoreTrace={restoreTrace}
            onExportHistory={exportHistory}
            compareAt={compareAt}
            onCompareTrace={(entry) => setCompareAt(entry ? entry.at : null)}
            importedCount={sheetProgress.imported}
            onImportedJump={jumpToCompare}
          />

          {compareTrace && gridDiff && (
            <div className="src-cmpbar" role="status">
              <i className="ri-scales-3-line" aria-hidden="true" />
              <div className="src-cmpbar-copy">
                <b>{t('home.sourcing.cmpTitle', { date: formatTraceWhen(compareTrace.at, locale) })}</b>
                <p>{isEmptyDiff(gridDiff) ? t('home.sourcing.cmpSame') : t('home.sourcing.cmpNote')}</p>
              </div>
              <div className="src-cmpbar-counts">
                {gridDiff.leaving.size > 0 && (
                  <span className="is-out">
                    <i className="ri-eye-off-line" aria-hidden="true" />
                    {t('home.sourcing.cmpLeaving', { n: gridDiff.leaving.size })}
                  </span>
                )}
                {gridDiff.entering.size > 0 && (
                  <span className="is-in">
                    <i className="ri-eye-line" aria-hidden="true" />
                    {t('home.sourcing.cmpEntering', { n: gridDiff.entering.size })}
                  </span>
                )}
                {gridDiff.moved.size > 0 && (
                  <span className="is-move">
                    <i className="ri-drag-move-line" aria-hidden="true" />
                    {t('home.sourcing.cmpMoved', { n: gridDiff.moved.size })}
                  </span>
                )}
                <span className="is-total">
                  <i className="ri-layout-grid-line" aria-hidden="true" />
                  {t('home.sourcing.cmpTotal', { n: gridDiff.total })}
                </span>
              </div>
              <div className="src-cmpbar-actions">
                <button
                  type="button"
                  className="src-cmpbar-apply"
                  onClick={() => {
                    restoreTrace(compareTrace);
                    setCompareAt(null);
                  }}
                >
                  <i className="ri-arrow-go-back-line" aria-hidden="true" />
                  {t('home.sourcing.cmpApply')}
                </button>
                <button
                  type="button"
                  className="src-cmpbar-x"
                  onClick={() => setCompareAt(null)}
                  aria-label={t('home.sourcing.cmpClose')}
                  title={t('home.sourcing.cmpClose')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <SortIndicator sort={sort} sort2={sort2} flip={flip} onFlip={toggleFlip} />

          {preset && (
            <div className="src-preset" role="status">
              <i className="ri-apps-2-line" aria-hidden="true" />
              <p>{t('home.sourcing.presetFromModules', { value: pct(preset.min) })}</p>
              <button
                type="button"
                className="src-preset-off"
                onClick={() => {
                  setMinMargin(MARGIN_OFF);
                  setPreset(null);
                }}
              >
                <i className="ri-close-line" aria-hidden="true" />
                {t('home.sourcing.presetClear')}
              </button>
            </div>
          )}

          {notice && (
            <div className={`src-notice is-${notice.tone}`} role="status">
              <i
                className={
                  notice.tone === 'ok'
                    ? 'ri-checkbox-circle-line'
                    : notice.tone === 'warn'
                      ? 'ri-alert-line'
                      : 'ri-error-warning-line'
                }
                aria-hidden="true"
              />
              <p>{notice.text}</p>
              {notice.tone === 'ok' && notice.link && (
                <Link to="/dashboard" className="src-notice-link">
                  {t('home.sourcing.saveSeeDash')}
                  <i className="ri-arrow-right-line" aria-hidden="true" />
                </Link>
              )}
              <button
                type="button"
                className="src-notice-close"
                onClick={() => setNotice(null)}
                aria-label={t('home.sourcing.noticeClose')}
              >
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </div>
          )}

          {pendingImport && (
            <div className="src-import-warn" role="alert">
              <i className="ri-alert-line" aria-hidden="true" />
              <div className="src-import-warn-copy">
                <b>{t('home.sourcing.importGapTitle')}</b>
                <p>
                  {pendingImport.fileMargin > MARGIN_OFF
                    ? t('home.sourcing.importGapText', {
                        file: pct(pendingImport.fileMargin),
                        current:
                          minMargin > MARGIN_OFF
                            ? pct(minMargin)
                            : t('home.sourcing.marginAny'),
                      })
                    : t('home.sourcing.importGapSame', {
                        current:
                          minMargin > MARGIN_OFF
                            ? pct(minMargin)
                            : t('home.sourcing.marginAny'),
                      })}
                </p>
                <span className="src-import-warn-note">
                  {t('home.sourcing.importGapNote')}
                </span>
              </div>
              <div className="src-import-warn-actions">
                <button
                  type="button"
                  className="src-import-warn-ok"
                  onClick={() => loadImported(pendingImport.rows)}
                >
                  <i className="ri-upload-2-line" aria-hidden="true" />
                  {t('home.sourcing.importGapConfirm')}
                </button>
                <button
                  type="button"
                  className="src-import-warn-x"
                  onClick={() => setPendingImport(null)}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                  {t('home.sourcing.importGapCancel')}
                </button>
              </div>
            </div>
          )}

          <CompareBoard
            items={compareItems}
            picks={scenarioPicks}
            remembered={compareItems.length > 0}
            scenarioKey={compareScenarioId === null ? null : `scenario-${compareScenarioId}`}
            scenarioLocked={scenarioLocked}
            locale={locale}
            onPickScenario={pickScenario}
            onRemove={removeCompareItem}
            onClear={clearCompare}
            onPrint={() => setPrinting(true)}
            onCopyText={() => void copyCompare()}
            onExportCsv={exportCompare}
            onImportCsv={importCompare}
            onOpenScenario={openScenarioInCalc}
            inAccount={cloudReady}
            recipients={productRecipients}
            onRecipient={setProductRecipient}
            imported={importedContacts}
            onClearRecipient={clearColumnContact}
            onClearAllRecipients={clearAllColumnContacts}
            progress={sheetProgress}
          />

          {shownRows.length === 0 ? (
            <p className="dash-empty">
              <i className="ri-filter-off-line" aria-hidden="true" />
              {minMargin > MARGIN_OFF
                ? t('home.sourcing.emptyMargin')
                : t('home.sourcing.emptyFilter')}
            </p>
          ) : (
            <>
              {preset?.median && medianStats && (
                <MedianMarker
                  median={totals.median}
                  low={medianStats.low}
                  high={medianStats.high}
                  above={medianStats.above}
                  below={medianStats.below}
                  total={rows.length}
                  locale={locale}
                />
              )}
              <div className="src-grid">
                {shownRows.map((row) => (
                  <ProductCard
                    key={row.product.id}
                    row={row}
                    locale={locale}
                    goodFloor={goodFloor}
                    saved={Boolean(savedMap[row.product.id])}
                    saving={savingId === row.product.id}
                    onSave={() => void saveScenario(row)}
                    comparing={compareIds.includes(row.product.id)}
                    compareFull={compareFull && !compareIds.includes(row.product.id)}
                    onCompare={() => toggleCompare(row.product.id)}
                    median={preset ? totals.median : null}
                    diffState={compareStateOf(row.product.id)}
                    diffPosition={comparePositionOf(row.product.id)}
                  />
                ))}
              </div>
            </>
          )}

          {pending.length > 0 && (
            <>
              <h3 className="src-review-title">{t('home.sourcing.priceReviewTitle')}</h3>
              <p className="src-review-hint">
                {t('home.sourcing.priceReviewHint', { max: SUSPECT_PRICE_CEILING })}
              </p>
              <div className="src-grid">
                {pending.map((entry) => (
                  <PriceReviewCard
                    key={entry.asin}
                    entry={entry}
                    locale={locale}
                    onSave={(price) => setManualPrice(entry.asin, price)}
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
          <Link to="/dashboard">{t('home.dash.nav')}</Link>
          <Link to="/">{t('home.calcPage.back')}</Link>
        </span>
      </footer>

      {printing && compareItems.length > 0 && (
        <ComparePrint
          items={compareItems}
          locale={locale}
          goodFloor={goodFloor}
          median={totals.median}
          trace={{
            inAccount: cloudReady,
            savedAt: viewSavedAt,
            minMargin,
            sort,
          }}
          recipients={printRecipients}
          contactGaps={printBoardGaps}
          csvContacts={printContactCsv}
          mailSent={printMailSent}
          mailEmails={printMailEmails}
          imported={printImported}
          onImportContacts={importContacts}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}