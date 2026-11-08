import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { makeFormatters, queueCalculation } from '@/pages/home/calcModel';
import { VERDICT_SHORT_KEYS, verdictLevelOf } from '@/pages/home/calcVerdict';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import AccountMenu from '@/pages/home/components/AccountMenu';
import AlertPill from '@/pages/home/components/AlertPill';
import SupplierDuePill from '@/pages/suppliers/components/SupplierDuePill';
import PageBurger from '@/pages/home/components/PageBurger';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import { buildAlertsFromRows } from '@/pages/home/supplierAlerts';
import { clearCalculatorHandoff, readCalculatorHandoff } from '@/pages/home/calcHandoff';
import type { CalcHandoff } from '@/pages/home/calcHandoff';
import { downloadCsv } from '@/pages/home/calcExport';
import {
  buildMailContactsCsv,
  mailContactsFilename,
} from '@/pages/dashboard/mailContactsCsv';
import { buildMonthlyProfit } from './monthlyProfit';
import { monthlyUplift } from './riskyGain';
import { readRiskyFilter, rememberRiskyFilter } from './riskyFilter';
import { readUnnamedSortOldest, rememberUnnamedSort } from './unnamedSort';
import {
  forgetBaptisedSheet,
  useBaptisedTodaySheets,
} from '@/pages/home/baptiseLog';
import { needsFollowUp } from '@/pages/dashboard/relance';
import { buildRelanceList, relanceContacts, relanceFilename, downloadRelanceText } from '@/pages/dashboard/relanceList';
import { clearFixed, readFixed } from '@/pages/home/scenarioFix';
import { SECOND_SUFFIX } from '@/pages/home/priceHistory';
/* Le même badge « importé le … » que les colonnes du comparatif : une adresse
   ramenée par le fichier de travail se distingue d'une saisie au clavier. */
import {
  clearImportedContacts,
  clearImportedLog,
  forgetImportedContact,
  useImportedContacts,
  useImportedLog,
} from '@/pages/sourcing/importedContacts';
import { buildImportLogCsv, importLogFilename } from '@/pages/dashboard/importLogCsv';
import { buildUnnamedCsv, unnamedCsvFilename } from '@/pages/dashboard/unnamedCsv';
import {
  applyUnnamedFills,
  daysSinceImport,
  parseUnnamedCsv,
} from '@/pages/dashboard/unnamedImport';
import { useUnnamedImports } from '@/pages/sourcing/unnamedImports';
import {
  MAIL_LOG_EVENT,
  clearMailLog,
  loadMailLog,
} from '@/pages/dashboard/mailLog';
import type { MailLog } from '@/pages/dashboard/mailLog';
import useDashboard from './useDashboard';
import { useBackToTopShortcut } from '@/pages/home/useBackToTopShortcut';
/* One light/dark preference shared with the calculator: a long reading session
   on a dark screen is hard on the eyes. */
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
import ScenarioCard from './components/ScenarioCard';
import VerdictTally from './components/VerdictTally';
import SupplierBoard from './components/SupplierBoard';
import ProfitCurve from './components/ProfitCurve';
import FromCalculatorBanner from './components/FromCalculatorBanner';
import '@/pages/home/film.css';
import './dash.css';
/* Le plancher de contraste du thème clair, partagé par les pages de travail. */
import '@/pages/home/workContrast.css';
/* Le réglage « lecture confort » posé sur l'accueil vaut aussi ici. */
import '@/pages/home/comfort.css';
import { readComfort } from '@/pages/home/comfortPref';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  /* The same margin target the calculator uses, so the reminder's verdict
     matches the tally below. */
  const [goodFloor] = useGoodFloor();
  /* Le prix d'achat visé suit la même terminaison que la feuille fournisseur. */
  const [psychoRule] = usePsychoRule();
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  /* Le réglage de lecture confort suit depuis l'accueil : les libellés de la
     page grandissent, les titres et les chiffres ne bougent pas. */
  const [comfort] = useState<boolean>(() => readComfort());

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  const { rows, draft, loading, error, source, supplierNames, reload } = useDashboard();
  /* Les fiches dont l'adresse vient du fichier, horodatées : les cartes en
     portent la trace. */
  const importedContacts = useImportedContacts();
  /* Le journal des réimports : il survit à l'effacement des traces, pour être
     téléchargé avant comme après. */
  const importedLog = useImportedLog();
  /* L'annexe archivée, le journal peut repartir à zéro : les fiches et leurs
     adresses restent, seule la mémoire des réimports s'efface. */
  const [importLogWiped, setImportLogWiped] = useState<number | null>(null);
  /* Vider le journal efface l'annexe qu'on vient peut-être d'imprimer : on
     demande confirmation, en deux temps, et l'arme retombe toute seule. */
  const [logClearArmed, setLogClearArmed] = useState(false);
  const wipeImportLog = () => {
    if (importedLog.length === 0) return;
    const count = importedLog.length;
    clearImportedLog();
    setLogClearArmed(false);
    setImportLogWiped(count);
  };
  /* Deuxième clic oublié : l'arme s'éteint au bout de quelques secondes. */
  useEffect(() => {
    if (!logClearArmed) return undefined;
    const timer = window.setTimeout(() => setLogClearArmed(false), 7000);
    return () => window.clearTimeout(timer);
  }, [logClearArmed]);
  /* Un nouveau réimport remplit le journal : la confirmation s'efface. */
  useEffect(() => {
    if (importedLog.length > 0) setImportLogWiped(null);
  }, [importedLog.length]);
  /* Échap annule la confirmation sans avoir à viser le bouton Annuler : la
     barre reste au même endroit, l'arme retombe simplement. */
  useEffect(() => {
    if (!logClearArmed) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setLogClearArmed(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [logClearArmed]);

  const [importLogExport, setImportLogExport] = useState<'idle' | 'done' | 'fail'>('idle');
  const exportImportLog = () => {
    const csv = buildImportLogCsv(importedLog, locale, t);
    const ok = downloadCsv(importLogFilename(), csv);
    setImportLogExport(ok ? 'done' : 'fail');
    window.setTimeout(() => setImportLogExport('idle'), 2400);
  };
  /* Retirer la trace d'une seule fiche : les autres gardent la leur. */
  const forgetImportedOf = useCallback(
    (id: number) => {
      [`scenario-${id}`, `s${id}`, `s${id}${SECOND_SUFFIX}`].forEach((key) =>
        forgetImportedContact(key),
      );
    },
    [],
  );
  const importedAtOf = useCallback(
    (id: number): number | null => {
      const keys = [`scenario-${id}`, `s${id}`, `s${id}${SECOND_SUFFIX}`];
      for (let i = 0; i < keys.length; i += 1) {
        const stamp = importedContacts[keys[i]];
        if (typeof stamp === 'number' && stamp > 0) return stamp;
      }
      return null;
    },
    [importedContacts],
  );
  /* Les derniers réimports d'une fiche, lus dans le journal : la carte les
     affiche en petit sous son badge d'import. */
  const importHistoryOf = useCallback(
    (id: number) => {
      const keys = [`scenario-${id}`, `s${id}`, `s${id}${SECOND_SUFFIX}`];
      const found = importedLog.filter((entry) => keys.includes(entry.key));
      return found.slice(0, 3);
    },
    [importedLog],
  );
  /* Les fiches remplies par le fichier, la plus récemment importée d'abord. */
  const importedRows = useMemo(
    () =>
      rows
        .filter((row) => importedAtOf(row.scenario.id) !== null)
        .sort(
          (a, b) =>
            (importedAtOf(b.scenario.id) ?? 0) - (importedAtOf(a.scenario.id) ?? 0),
        ),
    [rows, importedAtOf],
  );
  /* Le complément exact : les fiches que le fichier n'a jamais remplies, ou
     dont la trace a été effacée. */
  const untracedRows = useMemo(
    () => rows.filter((row) => importedAtOf(row.scenario.id) === null),
    [rows, importedAtOf],
  );
  const [handoff, setHandoff] = useState<CalcHandoff | null>(null);
  /* Les dates d'envoi mémorisées sur les cartes : un compteur pour la liste, et
     un bouton pour repartir d'un suivi propre après une négociation. */
  const [mailLog, setMailLog] = useState<MailLog>(() => loadMailLog());

  useEffect(() => {
    const sync = () => setMailLog(loadMailLog());
    window.addEventListener(MAIL_LOG_EVENT, sync);
    return () => window.removeEventListener(MAIL_LOG_EVENT, sync);
  }, []);

  const sentCount = Object.keys(mailLog).length;
  const clearSendDates = () => setMailLog(clearMailLog());
  /* L'archive de la négociation terminée : les contacts déjà servis partent en
     CSV, une fois la discussion close. */
  const [contactsExport, setContactsExport] = useState<'idle' | 'done' | 'fail'>('idle');
  const exportContacts = () => {
    const csv = buildMailContactsCsv(rows, mailLog, locale, t, goodFloor, psychoRule);
    const ok = downloadCsv(mailContactsFilename(), csv);
    setContactsExport(ok ? 'done' : 'fail');
    window.setTimeout(() => setContactsExport('idle'), 2400);
  };
  /* The risky counter on the burger is a filter: ?filter=risky opens this page
     already narrowed down to the scenarios sitting on red. */
  const [params, setParams] = useSearchParams();
  const riskyOnly = params.get('filter') === 'risky';
  /* Le second filtre de la liste : les cartes dont un fournisseur attend
     encore son message, pour ne pas oublier une relance. */
  const relanceOnly = params.get('filter') === 'relance';
  /* Troisième filtre : les fiches dont l'adresse vient du fichier de travail. */
  const importedOnly = params.get('filter') === 'imported';
  /* Quatrième filtre : l'inverse — les fiches que le fichier n'a jamais
     remplies, pour retrouver celles tapées à la main. */
  /* Cinquième filtre : les fiches importées qui attendent encore leur nom de
     fournisseur — celles que l'annexe signale « à baptiser ». */
  const untracedOnly = params.get('filter') === 'untraced';
  const unnamedOnly = params.get('filter') === 'unnamed';
  /* Le même compteur que la pastille du burger : il suit le journal et chaque
     nom saisi, sans recharger la page. */
  const {
    count: unnamedCount,
    ids: unnamedIds,
    totalDays: unnamedTotalDays,
  } = useUnnamedImports();
  /* Les fiches nommées depuis ce matin : le compteur repart de zéro chaque
     jour, sans qu'on ait à le remettre à la main. La bannière les liste une
     par une, avec de quoi effacer un nom saisi par erreur. */
  const baptisedSheets = useBaptisedTodaySheets();
  const baptisedToday = baptisedSheets.length;
  const [baptiseUndone, setBaptiseUndone] = useState<string | null>(null);
  const removeBaptised = (id: number, label: string) => {
    forgetBaptisedSheet(id);
    setBaptiseUndone(label);
  };
  /* Le rappel « nom retiré » s'efface tout seul : la bannière garde sa taille. */
  useEffect(() => {
    if (baptiseUndone === null) return undefined;
    const timer = window.setTimeout(() => setBaptiseUndone(null), 5000);
    return () => window.clearTimeout(timer);
  }, [baptiseUndone]);
  /* L'ordre de la liste à baptiser : le journal (le plus récent d'abord) ou
     l'ancienneté du dernier réimport, pour traiter ce qui traîne. */
  const unnamedOldestFirst = params.get('sort') === 'oldest';
  const toggleUnnamedSort = () => {
    /* Le choix est retenu au-delà de la visite : la prochaine fois, la liste
       s'ouvre déjà dans l'ordre qu'on avait choisi. */
    rememberUnnamedSort(!unnamedOldestFirst);
    const next = new URLSearchParams(params);
    if (unnamedOldestFirst) next.delete('sort');
    else next.set('sort', 'oldest');
    setParams(next, { replace: true });
  };
  /* La négociation est terminée : on efface les traces d'import pour repartir
     de fiches sans badge. Le nombre de fiches nettoyées reste affiché. */
  const [importWiped, setImportWiped] = useState<number | null>(null);
  const wipeImportTraces = () => {
    const count = importedRows.length;
    if (count === 0) return;
    clearImportedContacts();
    setImportWiped(count);
  };
  /* Un nouveau réimport ramène des traces : la confirmation s'efface. */
  useEffect(() => {
    if (importedRows.length > 0) setImportWiped(null);
  }, [importedRows.length]);
  const clearFilter = () => setParams({}, { replace: true });
  /* The red counter in the tally flips the very same filter as the burger. */
  const toggleRisky = () => setParams(riskyOnly ? {} : { filter: 'risky' });
  const toggleRelance = () => setParams(relanceOnly ? {} : { filter: 'relance' });
  const toggleImported = () => setParams(importedOnly ? {} : { filter: 'imported' });
  const toggleUntraced = () => setParams(untracedOnly ? {} : { filter: 'untraced' });
  const toggleUnnamed = () => setParams(unnamedOnly ? {} : { filter: 'unnamed' });

  /* Coming back from the calculator on a plain /dashboard puts the remembered
     filter back. Declared before the memory below on purpose. */
  useEffect(() => {
    if (params.has('filter')) return;
    if (!readRiskyFilter()) return;
    setParams({ filter: 'risky' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rememberRiskyFilter(riskyOnly);
  }, [riskyOnly]);

  /* Le tri de la liste à baptiser revient comme on l'avait laissé, dès que la
     liste s'ouvre sans ordre dans l'URL — sans écraser un lien partagé. */
  useEffect(() => {
    if (!unnamedOnly || params.has('sort')) return;
    if (!readUnnamedSortOldest()) return;
    const next = new URLSearchParams(params);
    next.set('sort', 'oldest');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unnamedOnly]);

  const { items: burgerItems, signedIn } = useSiteNavigation();

  /* Only shown when the reader actually comes back from the calculator. */
  useEffect(() => {
    const preview = readCalculatorHandoff();
    if (!preview) return;
    setHandoff(preview);
    clearCalculatorHandoff();
  }, []);

  /* Global "T" shortcut: back to the top of the page. */
  useBackToTopShortcut();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const bestIndex = useMemo(() => {
    if (rows.length === 0) return -1;
    return rows.reduce((best, row, index) => (row.metrics.net > rows[best].metrics.net ? index : best), 0);
  }, [rows]);

  const best = bestIndex >= 0 ? rows[bestIndex] : null;
  const monthlyTotal = rows.reduce((sum, row) => sum + row.metrics.monthly, 0);
  const compared = rows.filter((row) => row.comparison !== null).length;
  const bestName = best
    ? best.scenario.name.trim() ||
      `${t('home.calc.scenario')} ${String.fromCharCode(65 + bestIndex)}`
    : '';

  const alerts = useMemo(
    () => buildAlertsFromRows(rows, supplierNames, (key: string) => t(key)),
    [rows, supplierNames, t],
  );

  /* Scenarios on red, at the same floor as the tally and the calculator. */
  const riskyRows = useMemo(
    () =>
      rows.filter(
        (row) => verdictLevelOf(row.metrics.net, row.metrics.netMargin, goodFloor) === 'bad',
      ),
    [rows, goodFloor],
  );
  const riskyCount = riskyRows.length;
  /* What those red scenarios earn today, per unit sold: the gap to recover by
     turning them green. Shown in the filter banner. */
  const riskyAvgNet =
    riskyRows.length > 0
      ? riskyRows.reduce((sum, row) => sum + row.metrics.net, 0) / riskyRows.length
      : 0;
  /* Monthly net to recover if those scenarios reach the green floor at the
     same volume — the gain the fix button is aiming at. */
  const riskyUplift = useMemo(
    () => monthlyUplift(riskyRows, goodFloor),
    [riskyRows, goodFloor],
  );
  /* Scenarios that came back green from the calculator during this session,
     read once and emptied so the badge never lingers. */
  const [fixedIds] = useState<number[]>(() => {
    const ids = readFixed();
    clearFixed();
    return ids;
  });
  /* Those cards, once their verdict is confirmed green. They stay visible in
     the filtered view so the reader can see what the correction produced. */
  const correctedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          fixedIds.includes(row.scenario.id) &&
          verdictLevelOf(row.metrics.net, row.metrics.netMargin, goodFloor) === 'good',
      ),
    [rows, fixedIds, goodFloor],
  );
  /* "Voir le corrigé": puts the corrected card in view and rings it once. */
  const [focusId, setFocusId] = useState<number | null>(null);
  const jumpToFixed = () => {
    const first = correctedRows[0]?.scenario.id;
    if (!first) return;
    setFocusId(first);
    document
      .getElementById(`dash-card-${first}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  /* Les cartes dont un fournisseur attend encore son message : même règle que
     le badge ambre, devis par devis. */
  const relanceRows = useMemo(
    () => rows.filter((row) => needsFollowUp(row, mailLog, goodFloor, psychoRule)),
    [rows, mailLog, goodFloor, psychoRule],
  );
  const relanceCount = relanceRows.length;
  /* La liste prête à coller : nom, adresse et chiffres de chaque fournisseur
     qui attend encore son message. */
  const [relanceCopy, setRelanceCopy] = useState<'idle' | 'done' | 'fail'>('idle');
  const copyRelanceList = async () => {
    const contacts = relanceContacts(rows, mailLog, t, goodFloor, psychoRule);
    if (contacts.length === 0) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(buildRelanceList(contacts, locale, t));
      setRelanceCopy('done');
    } catch {
      setRelanceCopy('fail');
    }
    window.setTimeout(() => setRelanceCopy('idle'), 2400);
  };
  /* La liste part aussi en fichier texte : elle reste sous la main hors du
     navigateur, à rouvrir dans un bloc-notes même sans connexion. */
  const [relanceSave, setRelanceSave] = useState<'idle' | 'done' | 'fail'>('idle');
  const saveRelanceList = () => {
    const contacts = relanceContacts(rows, mailLog, t, goodFloor, psychoRule);
    if (contacts.length === 0) return;
    const ok = downloadRelanceText(
      relanceFilename(),
      buildRelanceList(contacts, locale, t),
    );
    setRelanceSave(ok ? 'done' : 'fail');
    window.setTimeout(() => setRelanceSave('idle'), 2400);
  };
  /* Les fiches que le journal signale encore anonymes, la plus récente d'abord
     — l'ordre du journal, pour baptiser du plus frais au plus ancien. */
  const unnamedRows = useMemo(
    () =>
      unnamedIds.length === 0
        ? []
        : unnamedIds
            .map((id) => rows.find((row) => row.scenario.id === id))
            .filter((row): row is (typeof rows)[number] => row !== undefined),
    [unnamedIds, rows],
  );
  /* Les fiches à baptiser partent aussi en fichier : on les nomme dans Excel,
     sans rouvrir chaque fiche une par une. */
  const [unnamedExport, setUnnamedExport] = useState<'idle' | 'done' | 'fail'>('idle');
  const exportUnnamed = () => {
    if (unnamedRows.length === 0) return;
    const csv = buildUnnamedCsv(unnamedSortedRows, locale, t);
    const ok = downloadCsv(unnamedCsvFilename(), csv);
    setUnnamedExport(ok ? 'done' : 'fail');
    window.setTimeout(() => setUnnamedExport('idle'), 2400);
  };
  /* Le fichier revient d'Excel rempli : les noms entrent d'un coup, sans
     rouvrir chaque fiche une par une. */
  const unnamedFileRef = useRef<HTMLInputElement | null>(null);
  const [unnamedImport, setUnnamedImport] = useState<{
    tone: 'ok' | 'none' | 'fail';
    count: number;
  } | null>(null);
  const importUnnamedCsv = async (file: File) => {
    try {
      const parsed = parseUnnamedCsv(await file.text());
      if (!parsed.ok) {
        setUnnamedImport({ tone: 'fail', count: 0 });
        return;
      }
      const named = applyUnnamedFills(parsed.fills);
      setUnnamedImport(named > 0 ? { tone: 'ok', count: named } : { tone: 'none', count: 0 });
    } catch {
      setUnnamedImport({ tone: 'fail', count: 0 });
    }
  };
  /* La confirmation de l'import s'efface toute seule : la bannière garde sa
     forme, on ne reste pas sur un message qui date. */
  useEffect(() => {
    if (!unnamedImport) return undefined;
    const timer = window.setTimeout(() => setUnnamedImport(null), 6000);
    return () => window.clearTimeout(timer);
  }, [unnamedImport]);
  /* Le dernier passage du fichier sur une fiche : le journal d'abord, la trace
     ensuite — de quoi dire depuis combien de jours le nom attend. */
  const lastImportAtOf = useCallback(
    (id: number): number | null => {
      const history = importHistoryOf(id);
      if (history.length > 0) return history[0].at;
      return importedAtOf(id);
    },
    [importHistoryOf, importedAtOf],
  );
  /* Les fiches à baptiser dans l'ordre choisi : l'ancienneté met devant celles
     dont le nom attend depuis le plus longtemps — celles qu'on oublie. */
  const unnamedSortedRows = useMemo(() => {
    if (!unnamedOldestFirst) return unnamedRows;
    return [...unnamedRows].sort(
      (a, b) =>
        (lastImportAtOf(a.scenario.id) ?? Number.MAX_SAFE_INTEGER) -
        (lastImportAtOf(b.scenario.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [unnamedRows, unnamedOldestFirst, lastImportAtOf]);
  /* Filtered list: the just-corrected cards first, then the worst net, so the
     ones still to fix open the list. */
  const visibleRows = useMemo(() => {
    if (unnamedOnly) return unnamedSortedRows;
    if (importedOnly) return importedRows;
    if (untracedOnly) return untracedRows;
    if (relanceOnly) return [...relanceRows].sort((a, b) => a.metrics.net - b.metrics.net);
    if (!riskyOnly) return rows;
    const risky = [...riskyRows].sort((a, b) => a.metrics.net - b.metrics.net);
    const corrected = correctedRows.filter((row) => !riskyRows.includes(row));
    return [...corrected, ...risky];
  }, [importedOnly, importedRows, untracedOnly, untracedRows, relanceOnly, relanceRows, riskyOnly, riskyRows, correctedRows, rows, unnamedOnly, unnamedSortedRows]);

  /* Arriving from the counter: jump straight to the filtered list, once it
     actually exists (the section only renders when scenarios are loaded). */
  useEffect(() => {
    if (
      (!riskyOnly && !relanceOnly && !importedOnly && !untracedOnly && !unnamedOnly) ||
      rows.length === 0
    )
      return;
    const target = document.getElementById('dash-scenarios');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [riskyOnly, relanceOnly, importedOnly, untracedOnly, unnamedOnly, rows.length]);
  const riskyLabel =
    riskyCount > 0
      ? t(riskyCount > 1 ? 'home.burger.riskyMany' : 'home.burger.riskyOne', { count: riskyCount })
      : undefined;

  const profit = useMemo(
    () =>
      buildMonthlyProfit(
        rows,
        locale,
        (row, index) =>
          row.scenario.name.trim() ||
          `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`,
      ),
    [rows, locale, t],
  );

  return (
    <div className="dash-page" data-dash-skin={skin} data-comfort={comfort ? 'on' : 'off'}>
      <header className="dash-nav">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="dash-nav-links" aria-label={t('home.dash.nav')}>
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
          {signedIn && <SupplierDuePill />}
          {signedIn && <AlertPill alerts={alerts} locale={locale} />}
          <AccountMenu />
          <PageBurger
            items={burgerItems}
            lead={alerts.length > 0 ? <AlertPill alerts={alerts} locale={locale} /> : null}
            note={
              best
                ? () => {
                    const level = verdictLevelOf(
                      best.metrics.net,
                      best.metrics.netMargin,
                      goodFloor,
                    );
                    return {
                      label: t('home.burger.bestLab'),
                      name: bestName,
                      value: t('home.burger.netPerUnit', { value: eur(best.metrics.net) }),
                      verdict: { tone: level, label: t(VERDICT_SHORT_KEYS[level]) },
                      meta: {
                        label: t('home.dash.minPrice'),
                        value: best.threshold.feasible ? eur(best.threshold.minPrice) : '—',
                      },
                      cta: t('home.burger.openBest'),
                      to: '/calculateur#calculator',
                    };
                  }
                : undefined
            }
            onNoteSelect={() => {
              if (best) queueCalculation(best.scenario.values, best.scenario.id);
            }}
            badge={alerts.length}
            badgeLabel={
              alerts.length > 0
                ? t('home.alerts.badge', {
                    count: alerts.length,
                    months: alerts.reduce((sum, alert) => sum + alert.monthsOver, 0),
                  })
                : undefined
            }
            risky={riskyCount}
            riskyLabel={riskyLabel}
            riskyTo={riskyOnly ? '/dashboard' : '/dashboard?filter=risky'}
            riskyClosing={riskyOnly}
            riskyClosingLabel={t('home.dash.riskyShowAll')}
          />
        </div>
      </header>

      <main className="dash">
        {handoff && (
          <FromCalculatorBanner handoff={handoff} onDismiss={() => setHandoff(null)} />
        )}
        <section className="dash-hero">
          <div className="dash-hero-copy">
            <p className="stamp">{t('home.dash.stamp')}</p>
            <h1>{t('home.dash.title')}</h1>
            <p className="dash-sub">{t('home.dash.intro')}</p>
            <div className="dash-hero-actions">
              <Link to="/calculateur#calculator" className="btn">
                {t('home.dash.calc')}
                <i className="ri-arrow-right-line" aria-hidden="true" />
              </Link>
              <span className={`dash-chip${source === 'cloud' ? ' is-cloud' : ''}`}>
                <i
                  className={source === 'cloud' ? 'ri-cloud-line' : 'ri-hard-drive-3-line'}
                  aria-hidden="true"
                />
                {source === 'cloud' ? t('home.dash.sourceCloud') : t('home.dash.sourceLocal')}
              </span>
            </div>
          </div>

          <div className="dash-readout" aria-live="polite">
            {best ? (
              <>
                <span className="dash-readout-lab">{t('home.dash.bestTitle')}</span>
                <b className={`dash-readout-net${best.metrics.net < 0 ? ' is-neg' : ' is-pos'}`}>
                  {eur(best.metrics.net)}
                </b>
                <span className="dash-readout-name">{bestName}</span>
                <div className="dash-readout-grid">
                  <div>
                    <span>{t('home.dash.margin')}</span>
                    <b>{pct(best.metrics.netMargin)}</b>
                  </div>
                  <div>
                    <span>{t('home.dash.roi')}</span>
                    <b>{pct(best.metrics.roi)}</b>
                  </div>
                  <div>
                    <span>{t('home.dash.minPrice')}</span>
                    <b>{best.threshold.feasible ? eur(best.threshold.minPrice) : '—'}</b>
                  </div>
                </div>
                <div className="dash-readout-bar" aria-hidden="true">
                  <span
                    className="dash-bar-cost"
                    style={{ width: `${best.metrics.costPct}%` }}
                  />
                  <span
                    className="dash-bar-profit"
                    style={{ width: `${best.metrics.profitPct}%` }}
                  />
                </div>
                <span className="dash-readout-note">{t('home.dash.bestNote')}</span>
              </>
            ) : (
              <>
                <span className="dash-readout-lab">{t('home.dash.bestTitle')}</span>
                <b className="dash-readout-net">—</b>
                <span className="dash-readout-note">
                  {loading ? t('home.dash.loading') : t('home.dash.empty')}
                </span>
              </>
            )}
          </div>
        </section>

        {error && (
          <p className="dash-error" role="status">
            <i className="ri-error-warning-line" aria-hidden="true" />
            {t('home.dash.error')}
            <button type="button" className="dash-retry" onClick={reload}>
              <i className="ri-refresh-line" aria-hidden="true" />
              {t('home.dash.retry')}
            </button>
          </p>
        )}

        {rows.length > 0 && (
          <VerdictTally rows={rows} riskyOnly={riskyOnly} onToggleRisky={toggleRisky} />
        )}

        {rows.length > 0 && <section className="dash-kpis" aria-label={t('home.dash.title')}>
          <div className="dash-kpi">
            <span>{t('home.dash.kpiScenarios')}</span>
            <b>{rows.length}</b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.dash.kpiBest')}</span>
            <b className={best && best.metrics.net < 0 ? 'is-neg' : undefined}>
              {best ? eur(best.metrics.net) : '—'}
            </b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.dash.kpiMonthly')}</span>
            <b className={monthlyTotal < 0 ? 'is-neg' : undefined}>
              {rows.length > 0 ? eur(monthlyTotal) : '—'}
            </b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.dash.kpiFixed')}</span>
            <b className={correctedRows.length > 0 ? 'is-pos' : undefined} title={t('home.dash.kpiFixedHint')}>
              {correctedRows.length}
            </b>
          </div>
          <div className="dash-kpi">
            <span>{t('home.dash.kpiSuppliers')}</span>
            <b>
              {compared}/{rows.length}
            </b>
          </div>
        </section>}

        {loading ? (
          <p className="dash-empty">
            <i className="ri-loader-4-line dash-spin" aria-hidden="true" />
            {t('home.dash.loading')}
          </p>
        ) : rows.length === 0 ? (
          <section className="dash-empty-block">
            <h2>{t('home.dash.emptyTitle')}</h2>
            <p>{t('home.dash.empty')}</p>
            {draft && (
              <div className="dash-empty-preview">
                <div className="dash-empty-preview-head">
                  <span className="dash-empty-preview-lab">
                    <i className="ri-draft-line" aria-hidden="true" />
                    {t('home.dash.draftTitle')}
                  </span>
                  {source === 'local' && (
                    <span className="dash-empty-preview-tag">
                      <i className="ri-cloud-off-line" aria-hidden="true" />
                      {t('home.dash.unsynced')}
                    </span>
                  )}
                </div>
                <div className="dash-empty-preview-grid">
                  <div>
                    <span>{t('home.calc.netProfit')}</span>
                    <b className={draft.metrics.net < 0 ? 'is-neg' : 'is-pos'}>
                      {eur(draft.metrics.net)}
                    </b>
                  </div>
                  <div>
                    <span>{t('home.dash.margin')}</span>
                    <b>{pct(draft.metrics.netMargin)}</b>
                  </div>
                  <div>
                    <span>{t('home.dash.minPrice')}</span>
                    <b>{draft.threshold.feasible ? eur(draft.threshold.minPrice) : '—'}</b>
                  </div>
                </div>
                <p className="dash-empty-preview-note">{t('home.dash.previewNote')}</p>
              </div>
            )}
            <Link
              to="/calculateur#calculator"
              className="dash-empty-link"
              onClick={() => {
                if (draft) queueCalculation(draft.values);
              }}
            >
              {t('home.dash.orInCalc')}
              <i className="ri-arrow-right-line" aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <>
            <section className="dash-section">
              <div className="dash-section-head">
                <h2>{t('home.dash.profitTitle')}</h2>
                <p>{t('home.dash.profitIntro')}</p>
              </div>
              <ProfitCurve points={profit} locale={locale} />
            </section>

            <section className="dash-section">
              <div className="dash-section-head">
                <h2>{t('home.dash.suppliersTitle')}</h2>
                <p>{t('home.dash.suppliersIntro')}</p>
              </div>
              <SupplierBoard rows={rows} locale={locale} supplierNames={supplierNames} />
            </section>

            <section className="dash-section" id="dash-scenarios">
              <div className="dash-section-head">
                <h2>
                  {unnamedOnly
                    ? t('home.dash.unnamedTitle')
                    : importedOnly
                    ? t('home.dash.importedTitle')
                    : untracedOnly
                      ? t('home.dash.untracedTitle')
                      : relanceOnly
                        ? t('home.dash.relanceTitle')
                        : riskyOnly
                          ? t('home.dash.riskyTitle')
                          : t('home.dash.scenariosTitle')}
                </h2>
                <p>
                  {unnamedOnly
                    ? t('home.dash.unnamedIntro')
                    : importedOnly
                    ? t('home.dash.importedIntro')
                    : untracedOnly
                      ? t('home.dash.untracedIntro')
                      : relanceOnly
                        ? t('home.dash.relanceIntro')
                        : riskyOnly
                          ? t('home.dash.riskyIntro')
                          : t('home.dash.scenariosIntro')}
                </p>
                <div className="dash-mail-tools">
                  {/* Les fiches que le journal signale encore anonymes : le
                     même compteur que la pastille du burger, ici en filtre. */}
                  {unnamedCount > 0 && (
                    <button
                      type="button"
                      className={`dash-relance-toggle is-unnamed${
                        unnamedOnly ? ' is-on' : ''
                      }`}
                      onClick={toggleUnnamed}
                      aria-pressed={unnamedOnly}
                      title={t('home.dash.unnamedFilterHint', { count: unnamedCount })}
                    >
                      <i className="ri-price-tag-3-line" aria-hidden="true" />
                      {t('home.dash.unnamedFilter')}
                      <span className="dash-relance-toggle-count">{unnamedCount}</span>
                    </button>
                  )}
                  {importedRows.length > 0 && (
                    <button
                      type="button"
                      className={`dash-relance-toggle is-imported${
                        importedOnly ? ' is-on' : ''
                      }`}
                      onClick={toggleImported}
                      aria-pressed={importedOnly}
                      title={t('home.dash.importedFilterHint', {
                        count: importedRows.length,
                      })}
                    >
                      <i className="ri-upload-2-line" aria-hidden="true" />
                      {t('home.dash.importedFilter')}
                      <span className="dash-relance-toggle-count">
                        {importedRows.length}
                      </span>
                    </button>
                  )}
                  {/* Le complément du filtre précédent : les fiches que le
                     fichier n'a jamais remplies. Il n'apparaît qu'une fois le
                     fichier utilisé, pour ne pas encombrer une liste vierge. */}
                  {untracedRows.length > 0 &&
                    (importedRows.length > 0 || importedLog.length > 0) && (
                    <button
                      type="button"
                      className={`dash-relance-toggle is-untraced${
                        untracedOnly ? ' is-on' : ''
                      }`}
                      onClick={toggleUntraced}
                      aria-pressed={untracedOnly}
                      title={t('home.dash.untracedFilterHint', {
                        count: untracedRows.length,
                      })}
                    >
                      <i className="ri-file-forbid-line" aria-hidden="true" />
                      {t('home.dash.untracedFilter')}
                      <span className="dash-relance-toggle-count">
                        {untracedRows.length}
                      </span>
                    </button>
                  )}
                  {/* Le journal reste disponible même après l'effacement des
                     traces : il raconte l'historique des réimports. */}
                  {importedLog.length > 0 && (
                    <button
                      type="button"
                      className={`dash-import-log${importLogExport === 'done' ? ' is-done' : ''}${
                        importLogExport === 'fail' ? ' is-fail' : ''
                      }`}
                      onClick={exportImportLog}
                      title={t('home.dash.importLogHint', { count: importedLog.length })}
                    >
                      <i
                        className={
                          importLogExport === 'done'
                            ? 'ri-check-line'
                            : importLogExport === 'fail'
                              ? 'ri-error-warning-line'
                              : 'ri-file-excel-2-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        importLogExport === 'done'
                          ? 'home.dash.importLogDone'
                          : importLogExport === 'fail'
                            ? 'home.dash.importLogFail'
                            : 'home.dash.importLog',
                      )}
                      {importedLog.length > 0 && (
                        <span className="dash-import-log-count">{importedLog.length}</span>
                      )}
                    </button>
                  )}
                  {importedRows.length > 0 && (
                    <button
                      type="button"
                      className="dash-import-clear"
                      onClick={wipeImportTraces}
                      title={t('home.dash.importClearHint', { count: importedRows.length })}
                    >
                      <i className="ri-eraser-line" aria-hidden="true" />
                      {t('home.dash.importClear')}
                      <span className="dash-import-clear-count">{importedRows.length}</span>
                    </button>
                  )}
                  {/* L'annexe est archivée : vider le journal, mais en deux
                     temps — un effacement par mégarde juste avant un
                     archivage coûterait tout l'historique. */}
                  {importedLog.length > 0 &&
                    (logClearArmed ? (
                      <span
                        className="dash-import-guard"
                        role="group"
                        aria-label={t('home.dash.importLogGuardAria')}
                      >
                        <span className="dash-import-guard-ask">
                          <i className="ri-error-warning-line" aria-hidden="true" />
                          {t('home.dash.importLogGuardAsk', { count: importedLog.length })}
                        </span>
                        <button
                          type="button"
                          className="dash-import-guard-yes"
                          onClick={wipeImportLog}
                          title={t('home.dash.importLogGuardYesHint', {
                            count: importedLog.length,
                          })}
                        >
                          <i className="ri-delete-bin-6-line" aria-hidden="true" />
                          {t('home.dash.importLogGuardYes')}
                        </button>
                        <button
                          type="button"
                          className="dash-import-guard-no"
                          onClick={() => setLogClearArmed(false)}
                          title={t('home.dash.importLogGuardNoHint')}
                        >
                          <i className="ri-close-line" aria-hidden="true" />
                          {t('home.dash.importLogGuardNo')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="dash-import-log-clear"
                        onClick={() => setLogClearArmed(true)}
                        title={t('home.dash.importLogClearGuardHint', {
                          count: importedLog.length,
                        })}
                      >
                        <i className="ri-delete-bin-6-line" aria-hidden="true" />
                        {t('home.dash.importLogClear')}
                        <span className="dash-import-clear-count">
                          {importedLog.length}
                        </span>
                      </button>
                    ))}
                  {importLogWiped !== null && importedLog.length === 0 && (
                    <p className="dash-import-log-wiped" role="status">
                      <i className="ri-check-line" aria-hidden="true" />
                      {t('home.dash.importLogClearDone', { count: importLogWiped })}
                    </p>
                  )}
                  {relanceCount > 0 && (
                    <button
                      type="button"
                      className={`dash-relance-toggle${relanceOnly ? ' is-on' : ''}`}
                      onClick={toggleRelance}
                      aria-pressed={relanceOnly}
                      title={t('home.dash.relanceFilterHint', { count: relanceCount })}
                    >
                      <i className="ri-mail-send-line" aria-hidden="true" />
                      {t('home.dash.relanceFilter')}
                      <span className="dash-relance-toggle-count">{relanceCount}</span>
                    </button>
                  )}
                  {relanceCount > 0 && (
                    <button
                      type="button"
                      className={`dash-relance-copy${relanceCopy === 'done' ? ' is-done' : ''}${
                        relanceCopy === 'fail' ? ' is-fail' : ''
                      }`}
                      onClick={() => void copyRelanceList()}
                      title={t('home.dash.relanceCopyHint')}
                      aria-label={t('home.dash.relanceCopyAria', { count: relanceCount })}
                    >
                      <i
                        className={
                          relanceCopy === 'done'
                            ? 'ri-check-line'
                            : relanceCopy === 'fail'
                              ? 'ri-error-warning-line'
                              : 'ri-file-copy-2-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        relanceCopy === 'done'
                          ? 'home.dash.relanceCopyDone'
                          : relanceCopy === 'fail'
                            ? 'home.dash.relanceCopyFail'
                            : 'home.dash.relanceCopy',
                      )}
                    </button>
                  )}
                  {relanceCount > 0 && (
                    <button
                      type="button"
                      className={`dash-relance-save${relanceSave === 'done' ? ' is-done' : ''}${
                        relanceSave === 'fail' ? ' is-fail' : ''
                      }`}
                      onClick={saveRelanceList}
                      title={t('home.dash.relanceSaveHint', { count: relanceCount })}
                      aria-label={t('home.dash.relanceSaveAria', { count: relanceCount })}
                    >
                      <i
                        className={
                          relanceSave === 'done'
                            ? 'ri-check-line'
                            : relanceSave === 'fail'
                              ? 'ri-error-warning-line'
                              : 'ri-download-2-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        relanceSave === 'done'
                          ? 'home.dash.relanceSaveDone'
                          : relanceSave === 'fail'
                            ? 'home.dash.relanceSaveFail'
                            : 'home.dash.relanceSave',
                      )}
                    </button>
                  )}
                  {sentCount > 0 && (
                    <>
                      <button
                        type="button"
                        className="dash-mail-reset"
                        onClick={clearSendDates}
                        title={t('home.dash.mailResetHint', { count: sentCount })}
                      >
                        <i className="ri-eraser-line" aria-hidden="true" />
                        {t('home.dash.mailReset')}
                        <span className="dash-mail-reset-count">{sentCount}</span>
                      </button>
                      <button
                        type="button"
                        className={`dash-mail-export${
                          contactsExport === 'done' ? ' is-done' : ''
                        }${contactsExport === 'fail' ? ' is-fail' : ''}`}
                        onClick={exportContacts}
                        title={t('home.dash.mailCsvHint', { count: sentCount })}
                      >
                        <i
                          className={
                            contactsExport === 'done'
                              ? 'ri-check-line'
                              : contactsExport === 'fail'
                                ? 'ri-error-warning-line'
                                : 'ri-file-excel-2-line'
                          }
                          aria-hidden="true"
                        />
                        {t(
                          contactsExport === 'done'
                            ? 'home.dash.mailCsvExported'
                            : contactsExport === 'fail'
                              ? 'home.dash.mailCsvFailShort'
                              : 'home.dash.mailCsv',
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {riskyOnly && (
                <div className="dash-filter" role="status">
                  <i className="ri-filter-3-line" aria-hidden="true" />
                  <span>
                    {riskyRows.length > 0
                      ? t(
                          riskyRows.length > 1
                            ? 'home.dash.riskyFilterMany'
                            : 'home.dash.riskyFilterOne',
                          { count: riskyRows.length },
                        )
                      : t('home.dash.riskyFilterDone')}
                  </span>
                  {riskyRows.length > 0 && (
                    <>
                      <span className="dash-filter-avg" title={t('home.dash.riskyAvgHint')}>
                        <span>{t('home.dash.riskyAvgLab')}</span>
                        <b>{eur(riskyAvgNet)}</b>
                      </span>
                      <span className="dash-filter-gain" title={t('home.dash.riskyGainHint')}>
                        <span>{t('home.dash.riskyGainLab')}</span>
                        <b>{eur(riskyUplift)}</b>
                      </span>
                    </>
                  )}
                  {correctedRows.length > 0 && (
                    <button
                      type="button"
                      className="dash-filter-fixed"
                      onClick={jumpToFixed}
                      title={t('home.dash.fixedSeeHint')}
                    >
                      <i className="ri-checkbox-circle-line" aria-hidden="true" />
                      {t('home.dash.fixedSee')}
                    </button>
                  )}
                  <button type="button" className="dash-filter-x" onClick={clearFilter}>
                    <i className="ri-close-line" aria-hidden="true" />
                    {t('home.dash.riskyClear')}
                  </button>
                </div>
              )}
              {unnamedOnly && (
                <div className="dash-filter is-unnamed" role="status">
                  <i className="ri-price-tag-3-line" aria-hidden="true" />
                  <span>
                    {unnamedRows.length > 0
                      ? t(
                          unnamedRows.length > 1
                            ? 'home.dash.unnamedFilterMany'
                            : 'home.dash.unnamedFilterOne',
                          { count: unnamedRows.length },
                        )
                      : t('home.dash.unnamedNone')}
                  </span>
                  {/* Le retard cumulé : la somme des jours d'attente de toutes
                     les fiches anonymes. Il baisse à chaque nom saisi, il monte
                     quand le fichier revient sans nom — la seule mesure qui dit
                     si la pile se résorbe vraiment. */}
                  {unnamedRows.length > 0 && (
                    <span
                      className="dash-filter-wait"
                      title={t('home.dash.unnamedWaitHint', {
                        count: unnamedRows.length,
                        days: unnamedTotalDays,
                      })}
                    >
                      <i className="ri-hourglass-line" aria-hidden="true" />
                      {unnamedTotalDays > 0
                        ? t('home.dash.unnamedWait', {
                            count: unnamedRows.length,
                            days: unnamedTotalDays,
                          })
                        : t('home.dash.unnamedWaitNone', {
                            count: unnamedRows.length,
                          })}
                    </span>
                  )}
                  {baptisedToday > 0 && (
                    <span
                      className="dash-filter-baptised"
                      title={t('home.dash.baptisedTodayHint', { count: baptisedToday })}
                    >
                      <i className="ri-checkbox-circle-line" aria-hidden="true" />
                      {t('home.dash.baptisedToday', { count: baptisedToday })}
                    </span>
                  )}
                  {unnamedRows.length > 1 && (
                    <button
                      type="button"
                      className={`dash-filter-sort${unnamedOldestFirst ? ' is-on' : ''}`}
                      onClick={toggleUnnamedSort}
                      aria-pressed={unnamedOldestFirst}
                      title={t(
                        unnamedOldestFirst
                          ? 'home.dash.unnamedSortNewestHint'
                          : 'home.dash.unnamedSortOldestHint',
                      )}
                    >
                      <i
                        className={unnamedOldestFirst ? 'ri-sort-asc' : 'ri-sort-desc'}
                        aria-hidden="true"
                      />
                      {t(
                        unnamedOldestFirst
                          ? 'home.dash.unnamedSortNewest'
                          : 'home.dash.unnamedSortOldest',
                      )}
                    </button>
                  )}
                  {unnamedSortedRows.length > 0 && (
                    <Link
                      to={`/calculateur?history=s${unnamedSortedRows[0].scenario.id}&baptise=1#calculator`}
                      className="dash-filter-baptise"
                      onClick={() => {
                        const target = unnamedSortedRows[0];
                        if (target) queueCalculation(target.scenario.values, target.scenario.id);
                      }}
                      title={t('home.dash.unnamedBaptiseHint')}
                    >
                      <i className="ri-edit-line" aria-hidden="true" />
                      {t('home.dash.unnamedBaptise')}
                    </Link>
                  )}
                  {/* Le fichier emporte la liste hors du navigateur : on nomme
                      les fournisseurs dans Excel, à son rythme. */}
                  {unnamedRows.length > 0 && (
                    <button
                      type="button"
                      className={`dash-filter-csv${
                        unnamedExport === 'done' ? ' is-done' : ''
                      }${unnamedExport === 'fail' ? ' is-fail' : ''}`}
                      onClick={exportUnnamed}
                      title={t('home.dash.unnamedCsvHint', { count: unnamedRows.length })}
                    >
                      <i
                        className={
                          unnamedExport === 'done'
                            ? 'ri-check-line'
                            : unnamedExport === 'fail'
                              ? 'ri-error-warning-line'
                              : 'ri-file-excel-2-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        unnamedExport === 'done'
                          ? 'home.dash.unnamedCsvDone'
                          : unnamedExport === 'fail'
                            ? 'home.dash.unnamedCsvFail'
                            : 'home.dash.unnamedCsv',
                      )}
                    </button>
                  )}
                  {/* Le fichier revient d'Excel : les noms saisis rentrent
                      d'un coup, sans rouvrir chaque fiche. */}
                  <button
                    type="button"
                    className="dash-filter-reimport"
                    onClick={() => unnamedFileRef.current?.click()}
                    title={t('home.dash.unnamedReimportHint')}
                  >
                    <i className="ri-upload-2-line" aria-hidden="true" />
                    {t('home.dash.unnamedReimport')}
                  </button>
                  <input
                    ref={unnamedFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="dash-csv-input"
                    aria-label={t('home.dash.unnamedReimport')}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      /* Le même fichier peut revenir deux fois : on vide la
                         sélection pour que le second passage compte. */
                      event.target.value = '';
                      if (file) void importUnnamedCsv(file);
                    }}
                  />
                  {unnamedImport && (
                    <span
                      className={`dash-filter-note is-${unnamedImport.tone}`}
                      role="status"
                    >
                      <i
                        className={
                          unnamedImport.tone === 'ok'
                            ? 'ri-check-line'
                            : unnamedImport.tone === 'none'
                              ? 'ri-information-line'
                              : 'ri-error-warning-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        unnamedImport.tone === 'ok'
                          ? 'home.dash.unnamedReimportDone'
                          : unnamedImport.tone === 'none'
                            ? 'home.dash.unnamedReimportNone'
                            : 'home.dash.unnamedReimportFail',
                        { count: unnamedImport.count },
                      )}
                    </span>
                  )}
                  <button type="button" className="dash-filter-x" onClick={clearFilter}>
                    <i className="ri-close-line" aria-hidden="true" />
                    {t('home.dash.unnamedClear')}
                  </button>
                </div>
              )}
              {/* Les fiches baptisées aujourd'hui, nommées une par une : un
                  nom tapé par erreur se retire ici même, et la fiche revient
                  dans la liste sans quitter la page. */}
              {unnamedOnly && (baptisedSheets.length > 0 || baptiseUndone !== null) && (
                <section className="dash-named" aria-label={t('home.dash.baptisedListLab')}>
                  <p className="dash-named-lab">
                    <i className="ri-checkbox-circle-line" aria-hidden="true" />
                    {t('home.dash.baptisedListLab')}
                  </p>
                  {baptisedSheets.length > 0 && (
                    <ul className="dash-named-list">
                      {baptisedSheets.map((sheet) => {
                        const label = sheet.name !== '' ? sheet.name : `S${sheet.id}`;
                        /* La fiche reste joignable après coup : le nom peut se
                           retoucher dans le calculateur, juste à côté du bouton
                           qui l'efface. */
                        const target = rows.find(
                          (row) => row.scenario.id === sheet.id,
                        );
                        return (
                          <li key={sheet.id} className="dash-named-item">
                            <span className="dash-named-name">{label}</span>
                            <Link
                              to={`/calculateur?history=s${sheet.id}&baptise=1#calculator`}
                              className="dash-named-go"
                              title={t('home.dash.baptisedOpenHint')}
                              aria-label={t('home.dash.baptisedOpenAria', {
                                name: label,
                              })}
                              onClick={() => {
                                if (target) {
                                  queueCalculation(
                                    target.scenario.values,
                                    target.scenario.id,
                                  );
                                }
                              }}
                            >
                              <i className="ri-arrow-right-up-line" aria-hidden="true" />
                            </Link>
                            <button
                              type="button"
                              className="dash-named-x"
                              onClick={() => removeBaptised(sheet.id, label)}
                              title={t('home.dash.baptisedRemoveHint')}
                              aria-label={t('home.dash.baptisedRemoveAria', { name: label })}
                            >
                              <i className="ri-close-line" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {baptiseUndone !== null && (
                    <p className="dash-named-note" role="status">
                      <i className="ri-arrow-go-back-line" aria-hidden="true" />
                      {t('home.dash.baptisedRemoved', { name: baptiseUndone })}
                    </p>
                  )}
                </section>
              )}
              {importedOnly && (
                <div className="dash-filter is-imported" role="status">                  <i className="ri-upload-2-line" aria-hidden="true" />
                  <span>
                    {importWiped !== null
                      ? t('home.dash.importClearDone', { count: importWiped })
                      : importedRows.length > 0
                        ? t(
                            importedRows.length > 1
                              ? 'home.dash.importedFilterMany'
                              : 'home.dash.importedFilterOne',
                            { count: importedRows.length },
                          )
                        : t('home.dash.importedNone')}
                  </span>
                  <button type="button" className="dash-filter-x" onClick={clearFilter}>
                    <i className="ri-close-line" aria-hidden="true" />
                    {t('home.dash.importedClear')}
                  </button>
                </div>
              )}
              {untracedOnly && (
                <div className="dash-filter is-untraced" role="status">
                  <i className="ri-file-forbid-line" aria-hidden="true" />
                  <span>
                    {untracedRows.length > 0
                      ? t(
                          untracedRows.length > 1
                            ? 'home.dash.untracedFilterMany'
                            : 'home.dash.untracedFilterOne',
                          { count: untracedRows.length },
                        )
                      : t('home.dash.untracedNone')}
                  </span>
                  <button type="button" className="dash-filter-x" onClick={clearFilter}>
                    <i className="ri-close-line" aria-hidden="true" />
                    {t('home.dash.untracedClear')}
                  </button>
                </div>
              )}
              {relanceOnly && (
                <div className="dash-filter is-relance" role="status">
                  <i className="ri-mail-send-line" aria-hidden="true" />
                  <span>
                    {relanceCount > 0
                      ? t(
                          relanceCount > 1
                            ? 'home.dash.relanceFilterMany'
                            : 'home.dash.relanceFilterOne',
                          { count: relanceCount },
                        )
                      : t('home.dash.relanceNone')}
                  </span>
                  <button type="button" className="dash-filter-x" onClick={clearFilter}>
                    <i className="ri-close-line" aria-hidden="true" />
                    {t('home.dash.relanceClear')}
                  </button>
                </div>
              )}
              {(riskyOnly || relanceOnly || importedOnly || untracedOnly || unnamedOnly) &&
              visibleRows.length === 0 ? (
                <p className="dash-empty">
                  <i className="ri-checkbox-circle-line" aria-hidden="true" />
                  {unnamedOnly
                    ? t('home.dash.unnamedNone')
                    : importedOnly
                    ? t('home.dash.importedNone')
                    : untracedOnly
                      ? t('home.dash.untracedNone')
                      : relanceOnly
                        ? t('home.dash.relanceNone')
                        : t('home.dash.riskyNone')}
                </p>
              ) : (
                <div className="dash-grid">
                  {visibleRows.map((row) => (
                    <ScenarioCard
                      key={row.scenario.id}
                      row={row}
                      index={rows.findIndex((item) => item.scenario.id === row.scenario.id)}
                      locale={locale}
                      supplierNames={supplierNames}
                      isBest={rows.length > 1 && best !== null && row.scenario.id === best.scenario.id}
                      fixed={fixedIds.includes(row.scenario.id)}
                      highlight={focusId === row.scenario.id}
                      importedAt={importedAtOf(row.scenario.id)}
                      importHistory={importHistoryOf(row.scenario.id)}
                      onForgetImported={() => forgetImportedOf(row.scenario.id)}
                      anonymousDays={
                        unnamedOnly
                          ? daysSinceImport(lastImportAtOf(row.scenario.id))
                          : null
                      }
                      canCopyEmail={unnamedOnly}
                      canBaptise={unnamedOnly}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="dash-foot">
        <span>{t('home.footer.rights')}</span>
        <span className="foot-links">
          <Link to="/calculateur#calculator">{t('home.calcPage.navCalc')}</Link>
          <Link to="/">{t('home.calcPage.back')}</Link>
        </span>
      </footer>
    </div>
  );
}