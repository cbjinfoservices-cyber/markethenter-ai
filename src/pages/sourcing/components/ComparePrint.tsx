import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
  queueCalculation,
} from '@/pages/home/calcModel';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import { VERDICT_ICONS, VERDICT_LEGEND_KEYS } from '@/pages/home/calcVerdict';
import type { CompareItem } from '@/pages/sourcing/compareItem';
import { lineDelta } from '@/pages/sourcing/compareDelta';
import { costAmountOf, costLinesOf } from '@/pages/sourcing/compareCosts';
import { MARGIN_OFF, SORT_LABEL_KEYS } from '@/pages/sourcing/components/SourcingFilters';
import type { SortKey } from '@/pages/sourcing/components/SourcingFilters';
import { printDocumentTitle } from '@/pages/home/printTitle';
import { downloadCsv } from '@/pages/home/calcExport';
import type { CsvRecipient } from '@/pages/home/calcExport';
import {
  buildContactsCsv,
  contactsCsvFilename,
  parseContactsCsv,
} from '@/pages/sourcing/contactsCsv';
import type { ContactGapRow, ImportedContact } from '@/pages/sourcing/contactsCsv';
import {
  countImportedThisWeek,
  countImportedToday,
  useImportedLog,
} from '@/pages/sourcing/importedContacts';
import {
  buildImportLogCsv,
  importLogFilename,
  scenarioIdOfLogKey,
  supplierNameOfLogEntry,
} from '@/pages/dashboard/importLogCsv';
import { loadSupplierNames } from '@/pages/home/priceHistory';

/** Where the board's settings come from, printed so the sheet can be traced. */
export type PrintTrace = {
  /** Saved in the signed-in account rather than only in this browser. */
  inAccount: boolean;
  /** ISO stamp of the account's last arrangement, `null` when unknown. */
  savedAt: string | null;
  /** The margin floor actually applied to the grid. */
  minMargin: number;
  sort: SortKey;
};

type Props = {
  items: CompareItem[];
  locale: string;
  goodFloor: number;
  /** Net margin of the whole catalogue, in percent — where the board stands. */
  median?: number | null;
  trace?: PrintTrace;
  /** Le nom et l'adresse du destinataire, repris dans le nom du PDF. */
  recipients?: CsvRecipient[];
  /** Les colonnes du comparatif à compléter : sans adresse, ou jamais écrites. */
  contactGaps?: ContactGapRow[];
  /** Tout ce qui reste à compléter, comparatif et tableau de bord confondus. */
  csvContacts?: ContactGapRow[];
  /** La date du dernier e-mail copié pour un scénario comparé, par colonne. */
  mailSent?: Record<string, number>;
  /** L'adresse du fournisseur déjà contacté, rappelée sous la date d'envoi. */
  mailEmails?: Record<string, string>;
  /** Les adresses ramenées par le fichier de travail, avec leur date, colonne par colonne. */
  imported?: Record<string, { at: number; email: string }>;
  /** Le fichier de travail rempli revient : on remplit les fiches. */
  onImportContacts?: (contacts: ImportedContact[]) => number;
  onClose: () => void;
};

type Row = {
  key: string;
  label: string;
  value: (item: CompareItem) => number;
  format: (value: number) => string;
  /** Unit printed next to the row label. Costs are in euros, rates in percent. */
  unit?: string;
  strong?: boolean;
};

export default function ComparePrint({
  items,
  locale,
  goodFloor,
  median,
  trace,
  recipients = [],
  contactGaps = [],
  csvContacts = [],
  mailSent = {},
  mailEmails = {},
  imported = {},
  onImportContacts,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  /* La même règle d'arrondi que l'e-mail et la feuille fournisseur : le papier
     porte les chiffres réellement négociés. */
  const [psychoRule] = usePsychoRule();
  /* Le fichier de travail : son téléchargement se confirme sur la feuille. */
  const [csvState, setCsvState] = useState<'idle' | 'ok' | 'fail'>('idle');
  /* Et le même fichier, une fois rempli dans Excel, revient par ici. */
  const [importState, setImportState] = useState<'idle' | 'ok' | 'none' | 'fail'>('idle');
  const [importCount, setImportCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  /* Le journal des réimports part en annexe de la feuille : la feuille et son
     historique s'archivent ensemble, dans le même PDF. */
  const importedLog = useImportedLog();
  const importedToday = countImportedToday(importedLog);
  /* La cadence sur la semaine, à côté du jour : l'annexe dit si le fichier
     tourne tous les matins ou une fois par semaine. */
  const importedWeek = countImportedThisWeek(importedLog);
  /* Le nom du fournisseur de chaque fiche, lu dans ses noms enregistrés :
     l'annexe imprime qui le fichier a servi, pas seulement quelle fiche. */
  const supplierNames = useMemo(() => loadSupplierNames(), []);
  /* Les lignes encore anonymes : le papier les signale avant archivage, pour
     ne pas classer une annexe sans savoir de qui elle parle. Seules les
     lignes rattachées à un scénario sont retenues : ce sont les seules dont
     le nom se saisit sur une fiche. */
  const unnamedLog = useMemo(
    () =>
      importedLog.filter(
        (entry) =>
          scenarioIdOfLogKey(entry.key) !== null &&
          supplierNameOfLogEntry(entry.key, supplierNames).trim() === '',
      ),
    [importedLog, supplierNames],
  );
  /* Le bouton de l'alerte ouvre la fiche concernée, là où le nom se tape. */
  const navigate = useNavigate();
  const openSupplierNaming = (key: string) => {
    const id = scenarioIdOfLogKey(key);
    onClose();
    if (id === null) {
      navigate('/dashboard');
      return;
    }
    /* La fiche est peut-être déjà dans le comparatif : ses chiffres partent
       avec elle, pour que le calculateur s'ouvre sur les bons nombres. */
    const item = items.find((entry) => entry.key === `scenario-${id}`);
    if (item?.values) queueCalculation(item.values, id);
    navigate(`/calculateur?history=s${id}&baptise=1#calculator`);
  };
  const [logState, setLogState] = useState<'idle' | 'done' | 'fail'>('idle');
  const exportLog = () => {
    const csv = buildImportLogCsv(importedLog, locale, t);
    const ok = downloadCsv(importLogFilename(), csv);
    setLogState(ok ? 'done' : 'fail');
    window.setTimeout(() => setLogState('idle'), 2400);
  };

  /** Le plancher arrondi et le prix d'achat qui le tient, ou rien. */
  const quoteOf = (item: CompareItem): { sale: number; buy: number } | null => {
    if (!item.values) return null;
    const floor = priceForMargin(item.values, goodFloor);
    if (floor === null) return null;
    const sale = psychoFloorPrice(floor, psychoRule);
    const buy = maxSupplierFor(item.values, sale, goodFloor);
    if (buy === null) return null;
    return { sale, buy };
  };

  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date()),
    [locale],
  );

  /* The account's last arrangement, printed day and hour so the sheet can be
     traced back to the exact settings it was produced with. */
  const savedAtText = useMemo(() => {
    const raw = trace?.savedAt ?? null;
    if (!raw) return null;
    const stamp = new Date(raw);
    if (Number.isNaN(stamp.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(stamp);
  }, [locale, trace?.savedAt]);

  /* Le nom du PDF enregistré reprend le titre de la feuille puis le nom et
     l'adresse du destinataire : la même logique que les deux feuilles du
     calculateur, pour tous les documents imprimés. */
  const addressees = useMemo(
    () => recipients.filter((item) => item.email.trim() !== ''),
    [recipients],
  );
  const sheetTitle = useMemo(
    () => printDocumentTitle(t('home.sourcing.printTitle'), addressees),
    [t, addressees],
  );

  /* Les scénarios déjà envoyés : la date apparaît dans la ligne du haut, pour
     que le lecteur voie d'un coup d'œil ce qui est déjà parti. */
  const mailDate = useMemo(
    () =>
      (stamp: number): string =>
        new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(stamp)),
    [locale],
  );
  const hasMailDate = items.some((item) => typeof mailSent[item.key] === 'number');
  /* La date complète, année comprise, pour l'annexe : le journal doit rester
     lisible des mois après l'impression. */
  const logDate = useMemo(
    () =>
      (stamp: number): string =>
        new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(stamp)),
    [locale],
  );
  /* Une colonne dont l'adresse vient du fichier de travail : le papier garde la
     trace de l'import, avec sa date, à côté de la date d'envoi. */
  const hasImported = items.some((item) => (imported[item.key]?.at ?? 0) > 0);
  /* Les colonnes produit qui n'ont jamais reçu leur message : le papier le dit
     noir sur blanc, pour repérer la relance oubliée avant d'envoyer la feuille. */
  const unsentProducts = items.filter(
    (item) => item.origin === 'product' && typeof mailSent[item.key] !== 'number',
  );

  /* Les deux façons de manquer un contact, séparées sur le papier : aucune
     adresse connue, ou une adresse qu'on n'a jamais encore écrite. */
  const gapsMissing = contactGaps.filter((entry) => entry.gap === 'no-email');
  const gapsUnwritten = contactGaps.filter((entry) => entry.gap === 'unwritten');

  /* L'état d'avancement, imprimé en marge de la feuille : combien de fiches
     restent à compléter, et combien de colonnes attendent encore leur message. */
  const todoCount = contactGaps.length;
  const relanceCount = items.filter((item) => !(Number(mailSent[item.key]) > 0)).length;
  /* Troisième compteur : les colonnes dont l'adresse vient du fichier, avec sa
     date à la ligne du dessus — le papier dit combien de fiches ont été
     remplies par un réimport. */
  const importedCount = items.filter((item) => (imported[item.key]?.at ?? 0) > 0).length;

  const kindLabel = (kind: 'product' | 'scenario'): string =>
    kind === 'scenario'
      ? t('home.sourcing.compareScenarioTag')
      : t('home.sourcing.compareProductTag');

  /* Le récapitulatif part en CSV, prêt à remplir dans Excel. */
  const exportContacts = () => {
    const csv = buildContactsCsv(csvContacts, locale, (key: string) => t(key));
    const ok = downloadCsv(contactsCsvFilename(), csv);
    setCsvState(ok ? 'ok' : 'fail');
  };

  /* Le fichier complété revient : les adresses tapées repartent dans les
     fiches, et la feuille se remet à jour d'elle-même. */
  const pickContacts = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    try {
      const contacts = parseContactsCsv(await file.text());
      const filled = onImportContacts ? onImportContacts(contacts) : 0;
      setImportCount(filled);
      setImportState(filled > 0 ? 'ok' : 'none');
    } catch {
      setImportCount(0);
      setImportState('fail');
    }
  };

  /* Le navigateur propose ce titre dans « Enregistrer en PDF ». */
  useEffect(() => {
    if (addressees.length === 0) return undefined;
    const previous = document.title;
    document.title = sheetTitle;
    return () => {
      document.title = previous;
    };
  }, [addressees.length, sheetTitle]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const rows: Row[] = [
    {
      key: 'net',
      label: t('home.sourcing.compareNet'),
      value: (item) => item.metrics.net,
      format: eur,
      strong: true,
    },
    {
      key: 'landed',
      label: t('home.sourcing.compareLanded'),
      value: (item) => item.metrics.landed,
      format: eur,
    },
    {
      key: 'total',
      label: t('home.sourcing.printTotalCost'),
      value: (item) => item.metrics.totalCost,
      format: eur,
    },
    {
      key: 'target',
      label: t('home.sourcing.compareTarget'),
      value: (item) => (item.threshold.feasible ? item.threshold.minPrice : NaN),
      format: eur,
      strong: true,
    },
    {
      key: 'saleFloor',
      label: t('home.sourcing.printSaleFloorLab'),
      value: (item) => quoteOf(item)?.sale ?? NaN,
      format: eur,
      strong: true,
    },
    {
      key: 'buyTarget',
      label: t('home.sourcing.printBuyTargetLab'),
      value: (item) => quoteOf(item)?.buy ?? NaN,
      format: eur,
      strong: true,
    },
    {
      key: 'margin',
      label: t('home.sourcing.compareMargin'),
      value: (item) => item.metrics.netMargin,
      format: pct,
      unit: '%',
    },
    {
      key: 'price',
      label: t('home.sourcing.comparePrice'),
      value: (item) => item.metrics.price,
      format: eur,
    },
    {
      key: 'monthly',
      label: t('home.sourcing.compareMonthly'),
      value: (item) => item.metrics.monthly,
      format: eur,
    },
  ];

  /* Where each column sits against the catalogue, in points of margin. */
  const catalogueMedian = typeof median === 'number' && Number.isFinite(median) ? median : null;
  if (catalogueMedian !== null) {
    const priceIndex = rows.findIndex((row) => row.key === 'price');
    rows.splice(priceIndex < 0 ? rows.length : priceIndex, 0, {
      key: 'median',
      label: t('home.sourcing.printMedianLab'),
      value: (item) => item.metrics.netMargin - (catalogueMedian ?? 0),
      format: (value) => {
        if (!Number.isFinite(value)) return '—';
        if (Math.abs(value) < 0.05) return `±${pct(0)}`;
        return `${value > 0 ? '+' : '−'}${pct(Math.abs(value))}`;
      },
      unit: 'pts',
    });
  }

  const bestNet = items.length > 1 ? Math.max(...items.map((item) => item.metrics.net)) : null;
  const hasEstimate = items.some((item) => item.estimated);
  const hasScenario = items.some((item) => item.origin === 'scenario');

  /**
   * The small line printed under each figure: where that figure comes from,
   * cost by cost. The supplier finally sees that on a 4,50 € quote, freight,
   * commission, FBA and PPC already eat most of the sale price.
   */
  const subOf = (rowKey: string, item: CompareItem): string => {
    if (!item.values) return '';
    const { metrics } = item;
    const price = metrics.price;
    const share = (amount: number): string =>
      price > 0 ? pct((amount / price) * 100) : '—';
    const costs = costLinesOf(item, (key: string) => t(key));

    switch (rowKey) {
      case 'net':
        return t('home.sourcing.printSubNet', {
          value: eur(metrics.totalCost),
          pct: share(metrics.totalCost),
        });
      case 'landed':
        return t('home.sourcing.printSubLanded', {
          freight: eur(costAmountOf(costs, 'shipping')),
          customs: eur(costAmountOf(costs, 'customs')),
        });
      case 'total':
        return t('home.sourcing.printSubTotal', {
          supplier: share(costAmountOf(costs, 'supplier')),
          amazon: share(costAmountOf(costs, 'amazon')),
          fba: share(costAmountOf(costs, 'fba')),
          ppc: share(costAmountOf(costs, 'ppc')),
        });
      case 'target':
        return t('home.sourcing.printSubTarget', { value: eur(metrics.net) });
      case 'saleFloor': {
        const quote = quoteOf(item);
        return quote === null
          ? t('home.sourcing.printSubSaleFloorRound')
          : t('home.sourcing.printSubSaleFloor', { value: eur(quote.sale) });
      }
      case 'buyTarget': {
        const quote = quoteOf(item);
        return quote === null
          ? t('home.sourcing.printSubBuyTargetNone')
          : t('home.sourcing.printSubBuyTarget', { value: eur(quote.buy) });
      }
      case 'margin':
        return t('home.sourcing.printSubMargin', { value: eur(metrics.net) });
      case 'median':
        return catalogueMedian === null
          ? ''
          : t('home.sourcing.printSubMedian', { value: pct(catalogueMedian) });
      case 'price':
        return t('home.sourcing.printSubPrice', {
          value: share(costAmountOf(costs, 'supplier')),
        });
      case 'monthly':
        return t('home.sourcing.printSubMonthly', { value: eur(metrics.monthly / 30) });
      default:
        return '';
    }
  };

  return createPortal(
    <div
      className="calc-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={sheetTitle}
    >
      <div className="sheet-tools">
        <button type="button" className="sheet-btn sheet-btn--solid" onClick={() => window.print()}>
          <i className="ri-printer-line" aria-hidden="true" />
          {t('home.sourcing.printNow')}
        </button>
        {csvContacts.length > 0 && (
          <button
            type="button"
            className={`sheet-btn${csvState === 'ok' ? ' is-done' : ''}${
              csvState === 'fail' ? ' is-fail' : ''
            }`}
            onClick={exportContacts}
            title={t('home.sourcing.printContactsCsvHint', { count: csvContacts.length })}
          >
            <i
              className={csvState === 'ok' ? 'ri-checkbox-circle-line' : 'ri-file-excel-2-line'}
              aria-hidden="true"
            />
            {csvState === 'ok'
              ? t('home.sourcing.printContactsCsvDone')
              : csvState === 'fail'
                ? t('home.sourcing.printContactsCsvFail')
                : t('home.sourcing.printContactsCsv')}
          </button>
        )}
        {(csvContacts.length > 0 || importState !== 'idle') && onImportContacts && (
          <>
            <button
              type="button"
              className={`sheet-btn${importState === 'ok' ? ' is-done' : ''}${
                importState === 'fail' || importState === 'none' ? ' is-fail' : ''
              }`}
              onClick={() => fileInput.current?.click()}
              title={t('home.sourcing.printContactsImportHint')}
            >
              <i
                className={importState === 'ok' ? 'ri-checkbox-circle-line' : 'ri-upload-2-line'}
                aria-hidden="true"
              />
              {importState === 'ok'
                ? t('home.sourcing.printContactsImportDone', { count: importCount })
                : importState === 'none'
                  ? t('home.sourcing.printContactsImportNone')
                  : importState === 'fail'
                    ? t('home.sourcing.printContactsImportFail')
                    : t('home.sourcing.printContactsImport')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sheet-file"
              aria-hidden="true"
              tabIndex={-1}
              onChange={pickContacts}
            />
          </>
        )}
        {/* Le journal part aussi en CSV : la feuille et son historique peuvent
            être archivés côte à côte, hors du PDF. */}
        {importedLog.length > 0 && (
          <button
            type="button"
            className={`sheet-btn${logState === 'done' ? ' is-done' : ''}${
              logState === 'fail' ? ' is-fail' : ''
            }`}
            onClick={exportLog}
            title={t('home.sourcing.printLogCsvHint', { count: importedLog.length })}
          >
            <i
              className={logState === 'done' ? 'ri-checkbox-circle-line' : 'ri-file-excel-2-line'}
              aria-hidden="true"
            />
            {logState === 'done'
              ? t('home.sourcing.printLogCsvDone')
              : logState === 'fail'
                ? t('home.sourcing.printLogCsvFail')
                : t('home.sourcing.printLogCsv')}
          </button>
        )}
        <button type="button" className="sheet-btn" onClick={onClose}>
          <i className="ri-close-line" aria-hidden="true" />
          {t('home.sourcing.printClose')}
        </button>
      </div>

      <div className="calc-sheet">
        <header className="sheet-head">
          <div>
            <span className="sheet-brand">MarketHunter AI</span>
            <h2>{sheetTitle}</h2>
            {/* Le destinataire en clair, puis le nom du fichier qu'il recevra. */}
            {addressees.length > 0 && (
              <div className="sheet-supplier-for">
                {addressees.map((item) => (
                  <span className="sheet-supplier-for-line" key={`for-${item.email}`}>
                    <i className="ri-user-received-line" aria-hidden="true" />
                    {t('home.sourcing.printPreparedFor', {
                      name: item.name.trim() === '' ? item.email : item.name,
                      email: item.email,
                    })}
                  </span>
                ))}
                <span className="sheet-supplier-file">
                  <i className="ri-file-pdf-2-line" aria-hidden="true" />
                  {t('home.sourcing.printFileHint', { name: `${sheetTitle}.pdf` })}
                </span>
              </div>
            )}
          </div>
          <div className="sheet-meta">
            <span>{date}</span>
            <span>{t('home.sourcing.printUnit')}</span>
          </div>
        </header>

        {/* La marge d'avancement : deux compteurs qui font du papier un suivi.
            Ils se recalculent à chaque adresse saisie ou chaque relance partie. */}
        <div className="sheet-progress" role="note">
          <span className="sheet-progress-cap">
            <i className="ri-loop-left-line" aria-hidden="true" />
            {t('home.sourcing.printProgressCap')}
          </span>
          <span
            className={`sheet-progress-item${todoCount === 0 ? ' is-done' : ' is-open'}`}
          >
            <i
              className={todoCount === 0 ? 'ri-check-line' : 'ri-user-unfollow-line'}
              aria-hidden="true"
            />
            {todoCount === 0
              ? t('home.sourcing.printProgressTodoNone')
              : t(
                  todoCount > 1
                    ? 'home.sourcing.printProgressTodoMany'
                    : 'home.sourcing.printProgressTodoOne',
                  { count: todoCount },
                )}
          </span>
          <span
            className={`sheet-progress-item${relanceCount === 0 ? ' is-done' : ' is-open'}`}
          >
            <i
              className={relanceCount === 0 ? 'ri-check-line' : 'ri-mail-send-line'}
              aria-hidden="true"
            />
            {relanceCount === 0
              ? t('home.sourcing.printProgressRelanceNone')
              : t(
                  relanceCount > 1
                    ? 'home.sourcing.printProgressRelanceMany'
                    : 'home.sourcing.printProgressRelanceOne',
                  { count: relanceCount },
                )}
          </span>
          <span
            className={`sheet-progress-item${importedCount === 0 ? ' is-done' : ' is-open'}`}
          >
            <i
              className={importedCount === 0 ? 'ri-check-line' : 'ri-upload-2-line'}
              aria-hidden="true"
            />
            {importedCount === 0
              ? t('home.sourcing.printProgressImportedNone')
              : t(
                  importedCount > 1
                    ? 'home.sourcing.printProgressImportedMany'
                    : 'home.sourcing.printProgressImportedOne',
                  { count: importedCount },
                )}
          </span>
          <span className="sheet-progress-note">
            {t('home.sourcing.printProgressNote', { total: items.length })}
          </span>
        </div>

        {trace && (
          <p className={`src-sheet-trace${trace.inAccount ? ' is-cloud' : ''}`}>
            <b>
              {trace.inAccount
                ? t('home.sourcing.printTraceAccount')
                : t('home.sourcing.printTraceDevice')}
            </b>
            <span>
              {t('home.sourcing.printTraceSort', { sort: t(SORT_LABEL_KEYS[trace.sort]) })}
            </span>
            <span>
              {trace.minMargin > MARGIN_OFF
                ? t('home.sourcing.printTraceFloor', { value: pct(trace.minMargin) })
                : t('home.sourcing.printTraceFloorOff')}
            </span>
            {savedAtText && (
              <span>{t('home.sourcing.printTraceWhen', { date: savedAtText })}</span>
            )}
          </p>
        )}

        <section className="sheet-verdict" aria-label={t('home.sourcing.printVerdictCap')}>
          <div className="sheet-verdict-cap">
            <span>{t('home.sourcing.printVerdictCap')}</span>
            <span>{t('home.calc.printVerdictFloor', { value: goodFloor })}</span>
          </div>
          <div className="sheet-verdict-row">
            {items.map((item) => (
              <div className={`sheet-verdict-cell is-${item.level}`} key={`verdict-${item.key}`}>
                <i className={VERDICT_ICONS[item.level]} aria-hidden="true" />
                <span className="sheet-verdict-name">
                  {item.origin === 'scenario'
                    ? t('home.sourcing.compareScenarioTag')
                    : t('home.sourcing.compareProductTag')}
                </span>
                <b className="sheet-verdict-title">{item.name}</b>
                <span className="sheet-verdict-margin">{pct(item.metrics.netMargin)}</span>
              </div>
            ))}
          </div>
        </section>

        <table className="sheet-table">
          <thead>
            <tr>
              <th scope="col" className="sheet-rowlab" />
              {items.map((item) => (
                <th scope="col" key={item.key}>
                  <span className="sheet-colname">{item.name}</span>
                  <span className="src-sheet-tag">
                    {item.origin === 'scenario'
                      ? t('home.sourcing.compareScenarioTag')
                      : t('home.sourcing.compareProductTag')}
                  </span>
                  {bestNet !== null && Math.abs(item.metrics.net - bestNet) < 0.005 && (
                    <span className="sheet-best">{t('home.calc.best')}</span>
                  )}
                </th>
              ))}
              {items.length === 2 && (
                <th scope="col" className="sheet-delta">
                  {t('home.sourcing.printDelta')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {hasMailDate && (
              <tr className="sheet-mailrow">
                <th scope="row" className="sheet-rowlab">
                  {t('home.sourcing.printMailSentLab')}
                </th>
                {items.map((item) => {
                  const stamp = mailSent[item.key];
                  return (
                    <td
                      key={`mail-${item.key}`}
                      className={`sheet-mailcell${stamp ? '' : ' is-none'}`}
                    >
                      {stamp ? mailDate(stamp) : '—'}
                      {/* Le fournisseur déjà écrit, rappelé sous la date : le
                          papier porte à qui le message est déjà parti. */}
                      {stamp && (mailEmails[item.key] ?? '') !== '' && (
                        <span className="sheet-mail-addr">
                          <i className="ri-at-line" aria-hidden="true" />
                          {mailEmails[item.key]}
                        </span>
                      )}
                    </td>
                  );
                })}
                {items.length === 2 && <td className="sheet-delta" />}
              </tr>
            )}
            {hasImported && (
              <tr className="sheet-importrow" title={t('home.sourcing.printImportedHint')}>
                <th scope="row" className="sheet-rowlab">
                  {t('home.sourcing.printImportedLab')}
                </th>
                {items.map((item) => {
                  const entry = imported[item.key];
                  const known = entry && entry.at > 0 ? entry : null;
                  return (
                    <td
                      key={`imported-${item.key}`}
                      className={`sheet-importcell${known ? '' : ' is-none'}`}
                    >
                      {known ? mailDate(known.at) : '—'}
                      {/* L'adresse elle-même, sous sa date d'import. */}
                      {known && known.email.trim() !== '' && (
                        <span className="sheet-mail-addr">
                          <i className="ri-at-line" aria-hidden="true" />
                          {known.email}
                        </span>
                      )}
                    </td>
                  );
                })}
                {items.length === 2 && <td className="sheet-delta" />}
              </tr>
            )}
            {unsentProducts.length > 0 && (
              <tr className="sheet-nomailrow">
                <th scope="row" className="sheet-rowlab">
                  {t('home.sourcing.printMailNoneLab')}
                </th>
                {items.map((item) => {
                  const flag =
                    item.origin === 'product' && typeof mailSent[item.key] !== 'number';
                  return (
                    <td
                      key={`nomail-${item.key}`}
                      className={`sheet-nomailcell${flag ? ' is-flag' : ' is-none'}`}
                    >
                      {flag ? t('home.sourcing.printMailNone') : '—'}
                    </td>
                  );
                })}
                {items.length === 2 && <td className="sheet-delta" />}
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key} className={row.strong ? 'is-strong' : undefined}>
                <th scope="row" className="sheet-rowlab">
                  {row.label} <span className="sheet-unit">{row.unit ?? 'EUR'}</span>
                </th>
                {items.map((item) => {
                  const raw = row.value(item);
                  const sub = subOf(row.key, item);
                  return (
                    <td key={item.key}>
                      {Number.isFinite(raw) ? row.format(raw) : '—'}
                      {sub !== '' && <span className="sheet-cell-sub">{sub}</span>}
                    </td>
                  );
                })}
                {items.length === 2 && (
                  <td className="sheet-delta">
                    {(() => {
                      const gap = lineDelta(row.value(items[0]), row.value(items[1]));
                      return gap === null ? '—' : pct(gap);
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Les fiches à compléter, rassemblées sur le papier et séparées en deux
            groupes : celles sans adresse, et celles dont l'adresse est connue mais
            qui n'ont jamais reçu de message. */}
        {(gapsMissing.length > 0 || gapsUnwritten.length > 0) && (
          <section className="sheet-missing" aria-label={t('home.sourcing.printMissingCap')}>
            <div className="sheet-missing-head">
              <i className="ri-mail-forbid-line" aria-hidden="true" />
              <b>{t('home.sourcing.printMissingCap')}</b>
              {gapsMissing.length > 0 && (
                <span>
                  {t(
                    gapsMissing.length > 1
                      ? 'home.sourcing.printMissingMany'
                      : 'home.sourcing.printMissingOne',
                    { count: gapsMissing.length },
                  )}
                </span>
              )}
              {gapsUnwritten.length > 0 && (
                <span>
                  {t(
                    gapsUnwritten.length > 1
                      ? 'home.sourcing.printUnwrittenMany'
                      : 'home.sourcing.printUnwrittenOne',
                    { count: gapsUnwritten.length },
                  )}
                </span>
              )}
            </div>
            {gapsMissing.length > 0 && (
              <>
                <p className="sheet-missing-lab">
                  <i className="ri-user-unfollow-line" aria-hidden="true" />
                  {t('home.sourcing.printMissingNoEmailLab')}
                </p>
                <ul className="sheet-missing-list">
                  {gapsMissing.map((entry) => (
                    <li key={`missing-${entry.key}`}>
                      <span className="sheet-missing-name">{entry.name}</span>
                      <span className="sheet-missing-kind">{kindLabel(entry.kind)}</span>
                      <span className="sheet-missing-empty">
                        {t('home.sourcing.printMissingNoEmail')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {gapsUnwritten.length > 0 && (
              <>
                <p className="sheet-missing-lab is-known">
                  <i className="ri-mail-line" aria-hidden="true" />
                  {t('home.sourcing.printUnwrittenLab')}
                </p>
                <ul className="sheet-missing-list">
                  {gapsUnwritten.map((entry) => (
                    <li key={`unwritten-${entry.key}`}>
                      <span className="sheet-missing-name">{entry.name}</span>
                      <span className="sheet-missing-kind">{kindLabel(entry.kind)}</span>
                      <span className="sheet-missing-mail">{entry.email}</span>
                      <span className="sheet-missing-empty is-soft">
                        {t('home.sourcing.printUnwrittenTag')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p>{t('home.sourcing.printMissingHint')}</p>
          </section>
        )}

        {/* L'ANNEXE — le journal des réimports, imprimé avec la feuille pour
            que les deux s'archivent ensemble : la feuille dit où en est la
            négociation, l'annexe dit ce que le fichier a apporté et quand.
            Elle ne s'imprime que s'il y a au moins un réimport à archiver. */}
        {importedLog.length > 0 && (
        <section className="sheet-log" aria-label={t('home.sourcing.printLogCap')}>
          <div className="sheet-log-head">
            <i className="ri-archive-2-line" aria-hidden="true" />
            <b>{t('home.sourcing.printLogCap')}</b>
            <span>
              {importedLog.length > 0
                ? t(
                    importedLog.length > 1
                      ? 'home.sourcing.printLogCountMany'
                      : 'home.sourcing.printLogCountOne',
                    { count: importedLog.length },
                  )
                : t('home.sourcing.printLogNone')}
            </span>
            {importedToday > 0 && (
              <span className="sheet-log-today">
                <i className="ri-time-line" aria-hidden="true" />
                {t('home.sourcing.printLogToday', { count: importedToday })}
              </span>
            )}
            {importedWeek > 0 && (
              <span className="sheet-log-week">
                <i className="ri-calendar-2-line" aria-hidden="true" />
                {t('home.sourcing.printLogWeek', { count: importedWeek })}
              </span>
            )}
          </div>
          <p className="sheet-log-intro">{t('home.sourcing.printLogIntro')}</p>
          {importedLog.length > 0 && (
            <table className="sheet-log-table">
              <thead>
                <tr>
                  <th scope="col">{t('home.sourcing.printLogWhen')}</th>
                  <th scope="col">{t('home.sourcing.printLogSheet')}</th>
                  <th scope="col">{t('home.sourcing.printLogSupplier')}</th>
                  <th scope="col">{t('home.sourcing.printLogEmail')}</th>
                </tr>
              </thead>
              <tbody>
                {importedLog.map((entry) => (
                  <tr key={`log-${entry.key}`}>
                    <td className="sheet-log-when">{logDate(entry.at)}</td>
                    <td className="sheet-log-sheet">
                      {entry.name.trim() === '' ? entry.key : entry.name}
                    </td>
                    <td className="sheet-log-supplier">
                      {(() => {
                        const name = supplierNameOfLogEntry(entry.key, supplierNames);
                        if (name.trim() !== '') return name;
                        /* Une fiche produit n'a pas de nom à saisir : plutôt
                           qu'une fausse alerte, un tiret sobre. */
                        if (scenarioIdOfLogKey(entry.key) === null) return '—';
                        return (
                          <span className="sheet-log-supplier-missing">
                            <i className="ri-question-line" aria-hidden="true" />
                            {t('home.sourcing.printLogSupplierMissing')}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="sheet-log-mail">
                      {entry.email.trim() === '' ? '—' : entry.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {unnamedLog.length > 0 && (
            <p className="sheet-log-warn" role="note">
              <i className="ri-error-warning-line" aria-hidden="true" />
              <b>
                {t(
                  unnamedLog.length > 1
                    ? 'home.sourcing.printLogUnnamedMany'
                    : 'home.sourcing.printLogUnnamedOne',
                  { count: unnamedLog.length },
                )}
              </b>
              <span>{t('home.sourcing.printLogUnnamedHint')}</span>
              {/* Laquelle s'ouvre : le nom de la fiche, pour ne pas cliquer à
                  l'aveugle sur un bouton qui change de cible à chaque réimport. */}
              <span className="sheet-log-warn-first">
                <i className="ri-arrow-right-line" aria-hidden="true" />
                {t('home.sourcing.printLogUnnamedFirst', {
                  name:
                    unnamedLog[0].name.trim() === ''
                      ? unnamedLog[0].key
                      : unnamedLog[0].name.trim(),
                })}
              </span>
              {/* Le raccourci direct : on ouvre la fiche et le champ du nom. */}
              <button
                type="button"
                className="sheet-log-baptise"
                onClick={() => openSupplierNaming(unnamedLog[0].key)}
                title={t('home.sourcing.printLogBaptiseHint')}
              >
                <i className="ri-price-tag-3-line" aria-hidden="true" />
                {t('home.sourcing.printLogBaptise')}
              </button>
            </p>
          )}
          <p className="sheet-log-note">
            {t('home.sourcing.printLogNote', { count: importedLog.length })}
          </p>
        </section>
        )}

        {(hasEstimate || hasScenario) && (
          <p className="src-sheet-note">
            {hasEstimate ? t('home.sourcing.printEstimateNote') : ''}
            {hasEstimate && hasScenario ? ' ' : ''}
            {hasScenario ? t('home.sourcing.printScenarioNote') : ''}
          </p>
        )}

        <footer className="sheet-foot">
          <span>{t('home.sourcing.printFoot')}</span>
          <span>{t('home.calc.note')}</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}