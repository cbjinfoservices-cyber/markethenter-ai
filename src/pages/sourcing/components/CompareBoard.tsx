import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import { buildSupplierMail } from '@/pages/home/supplierMail';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import { VERDICT_ICONS, VERDICT_LEGEND_KEYS } from '@/pages/home/calcVerdict';
import type { CompareItem } from '@/pages/sourcing/compareItem';
import { lineDelta } from '@/pages/sourcing/compareDelta';
import { scenarioLabel } from '@/pages/sourcing/scenarioPicker';
import type { ScenarioPick } from '@/pages/sourcing/scenarioPicker';
import {
  PRODUCT_MAIL_EVENT,
  clearProductMailOne,
  loadProductMail,
  recordProductMail,
} from '@/pages/sourcing/productMailLog';
import type { ProductMailLog } from '@/pages/sourcing/productMailLog';
import { EMPTY_RECIPIENT } from '@/pages/sourcing/compareRecipients';
import type { CompareRecipient, RecipientMap } from '@/pages/sourcing/compareRecipients';

type Props = {
  items: CompareItem[];
  picks: ScenarioPick[];
  /** Key of the dashboard scenario in the comparison, if any. */
  scenarioKey: string | null;
  /** Two products already fill the board: the scenario slot is held back. */
  scenarioLocked: boolean;
  locale: string;
  onPickScenario: (key: string) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onPrint: () => void;
  /** Copies the board as plain text, ready to paste in a message. */
  onCopyText: () => void;
  onExportCsv: () => void;
  /** Reads back a CSV the supplier retouched, and reloads it in the calculator. */
  onImportCsv: (file: File) => void;
  /** The two columns come back on the next visit. */
  remembered?: boolean;
  /** The comparison is also stored in the signed-in account. */
  inAccount?: boolean;
  /** Reopens a dashboard scenario in the calculator to rework the buy price. */
  onOpenScenario: (item: CompareItem) => void;
  /** Le contact saisi sur les colonnes « produit sourcé », pour le PDF. */
  recipients?: RecipientMap;
  onRecipient?: (key: string, patch: Partial<CompareRecipient>) => void;
  /** Les colonnes dont l'adresse vient du fichier de travail, et quand. */
  imported?: Record<string, number>;
  /** Vider d'un coup le nom et l'adresse d'une colonne. */
  onClearRecipient?: (key: string, name: string) => void;
  /** Vider d'un seul clic les adresses de toutes les colonnes. */
  onClearAllRecipients?: (keys: string[]) => void;
  /** L'état d'avancement de la feuille imprimée, rappelé à l'écran. */
  progress?: { todo: number; relance: number; imported: number };
};

type Line = {
  key: string;
  label: string;
  value: (item: CompareItem) => number;
  format: (value: number) => string;
  /** Which side wins: a higher net, a lower landed cost or target price. */
  better?: 'high' | 'low';
  strong?: boolean;
};

export default function CompareBoard({
  items,
  picks,
  scenarioKey,
  scenarioLocked,
  locale,
  onPickScenario,
  onRemove,
  onClear,
  onPrint,
  onCopyText,
  onExportCsv,
  onImportCsv,
  remembered = false,
  inAccount = false,
  onOpenScenario,
  recipients = {},
  onRecipient,
  imported = {},
  onClearRecipient,
  onClearAllRecipients,
  progress,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const fileInput = useRef<HTMLInputElement>(null);
  /* Le même seuil vert et la même règle d'arrondi que le calculateur : le
     message part avec exactement les chiffres de la feuille fournisseur. */
  const [goodFloor] = useGoodFloor();
  const [psychoRule] = usePsychoRule();
  /* Retour du bouton « Copier l'e-mail bilingue », colonne par colonne. */
  const [mailState, setMailState] = useState<Record<string, 'done' | 'fail'>>({});
  /* La date du dernier message parti, produit par produit : la colonne garde
     la trace, comme les cartes du tableau de bord. */
  const [mailLog, setMailLog] = useState<ProductMailLog>(() => loadProductMail());

  useEffect(() => {
    const sync = () => setMailLog(loadProductMail());
    window.addEventListener(PRODUCT_MAIL_EVENT, sync);
    return () => window.removeEventListener(PRODUCT_MAIL_EVENT, sync);
  }, []);

  /** « E-mail copié le 2 nov. à 14:32 », ou une chaîne vide sans envoi. */
  const mailWhenText = (key: string): string => {
    const stamp = mailLog[key];
    if (!stamp) return '';
    const when = new Date(stamp);
    if (Number.isNaN(when.getTime())) return '';
    const day = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
    }).format(when);
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(when);
    return t('home.sourcing.compareMailOn', { date: day, time });
  };

  /** L'e-mail bilingue d'une colonne : plancher arrondi, puis prix d'achat qui
   * le tient encore. Rien n'est proposé si le plancher est introuvable. */
  const mailOf = (item: CompareItem) => {
    if (!item.values) return null;
    const floor = priceForMargin(item.values, goodFloor);
    if (floor === null) return null;
    const sale = psychoFloorPrice(floor, psychoRule);
    const buy = maxSupplierFor(item.values, sale, goodFloor);
    if (buy === null) return null;
    return buildSupplierMail('bi', { name: item.name, sale: eur(sale), buy: eur(buy) });
  };

  const copyItemMail = async (
    event: ReactMouseEvent<HTMLButtonElement>,
    item: CompareItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const mail = mailOf(item);
    if (!mail) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`);
      /* La feuille imprimée garde la trace : cette colonne a reçu son message. */
      setMailLog(recordProductMail(item.key));
      setMailState((prev) => ({ ...prev, [item.key]: 'done' }));
    } catch {
      setMailState((prev) => ({ ...prev, [item.key]: 'fail' }));
    }
    window.setTimeout(() => {
      setMailState((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
    }, 2200);
  };

  /** Effacer la date d'une seule colonne : les autres gardent la leur. */
  const clearItemMail = (event: ReactMouseEvent<HTMLButtonElement>, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMailLog(clearProductMailOne(key));
  };

  /** L'horodatage du fichier d'où vient l'adresse, en clair. */
  const importedWhen = (stamp: number): string => {
    const when = new Date(stamp);
    if (Number.isNaN(when.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(when);
  };

  const lines: Line[] = [
    {
      key: 'net',
      label: t('home.sourcing.compareNet'),
      value: (item) => item.metrics.net,
      format: eur,
      better: 'high',
      strong: true,
    },
    {
      key: 'landed',
      label: t('home.sourcing.compareLanded'),
      value: (item) => item.metrics.landed,
      format: eur,
      better: 'low',
      strong: true,
    },
    {
      key: 'target',
      label: t('home.sourcing.compareTarget'),
      value: (item) => (item.threshold.feasible ? item.threshold.minPrice : NaN),
      format: eur,
      better: 'low',
      strong: true,
    },
    {
      key: 'margin',
      label: t('home.sourcing.compareMargin'),
      value: (item) => item.metrics.netMargin,
      format: pct,
      better: 'high',
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
      better: 'high',
    },
  ];

  if (items.length === 0) return null;

  /** Index of the winning column for one line, or -1 when it is a tie. */
  const winnerOf = (line: Line): number => {
    if (items.length < 2 || !line.better) return -1;
    const [a, b] = items.map((item) => line.value(item));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
    if (Math.abs(a - b) < 0.005) return -1;
    const aWins = line.better === 'high' ? a > b : a < b;
    return aWins ? 0 : 1;
  };

  /** Relative gap on one line, in percent, or null when the two sides tie. */
  const deltaOf = (line: Line): number | null => {
    if (items.length !== 2) return null;
    return lineDelta(line.value(items[0]), line.value(items[1]));
  };

  /** Column that leads the line — used to hang the percentage gap on one side. */
  const leadOf = (line: Line): number => {
    const win = winnerOf(line);
    if (win !== -1) return win;
    if (items.length !== 2) return -1;
    const [a, b] = items.map((item) => line.value(item));
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < 0.005) return -1;
    return a > b ? 0 : 1;
  };

  const netGap = items.length === 2 ? Math.abs(items[0].metrics.net - items[1].metrics.net) : 0;
  const netGapPct =
    items.length === 2 ? lineDelta(items[0].metrics.net, items[1].metrics.net) : null;

  /* Les colonnes qui portent déjà un nom ou une adresse : elles se vident
     ensemble, d'un seul geste. */
  const filledContactKeys = items
    .filter((item) => {
      if (item.origin !== 'product') return false;
      const contact = recipients[item.key] ?? EMPTY_RECIPIENT;
      return contact.name.trim() !== '' || contact.email.trim() !== '';
    })
    .map((item) => item.key);

  /** « 2 fiches à compléter », ou « aucune fiche à compléter ». */
  const todoText = (count: number): string => {
    if (count <= 0) return t('home.sourcing.printProgressTodoNone');
    return t(
      count > 1 ? 'home.sourcing.printProgressTodoMany' : 'home.sourcing.printProgressTodoOne',
      { count },
    );
  };

  /** « 1 adresse importée », ou « aucune adresse importée ». */
  const importedText = (count: number): string => {
    if (count <= 0) return t('home.sourcing.printProgressImportedNone');
    return t(
      count > 1
        ? 'home.sourcing.printProgressImportedMany'
        : 'home.sourcing.printProgressImportedOne',
      { count },
    );
  };

  /** « 1 fiche à relancer », ou « aucune à relancer ». */
  const relanceText = (count: number): string => {
    if (count <= 0) return t('home.sourcing.printProgressRelanceNone');
    return t(
      count > 1
        ? 'home.sourcing.printProgressRelanceMany'
        : 'home.sourcing.printProgressRelanceOne',
      { count },
    );
  };

  return (
    <section className="src-compare" aria-live="polite">
      <div className="src-compare-head">
        <h2>
          <i className="ri-scales-3-line" aria-hidden="true" />
          {t('home.sourcing.compareTitle')}
        </h2>
        <p>{t('home.sourcing.compareNote')}</p>
        {items.length === 2 && (
          <span className="src-compare-gap">
            {netGapPct === null
              ? t('home.sourcing.compareGap', { value: eur(netGap) })
              : t('home.sourcing.compareGapPct', { value: eur(netGap), pct: pct(netGapPct) })}
          </span>
        )}
        {remembered && items.length > 0 && (
          <span
            className="src-compare-saved"
            title={
              inAccount
                ? t('home.sourcing.compareRememberedAccountHint')
                : t('home.sourcing.compareRememberedHint')
            }
          >
            <i className={inAccount ? 'ri-cloud-line' : 'ri-save-3-line'} aria-hidden="true" />
            {inAccount
              ? t('home.sourcing.compareRememberedAccount')
              : t('home.sourcing.compareRemembered')}
          </span>
        )}
        <div className="src-compare-actions">
          {picks.length === 0 ? (
            <span className="src-compare-empty">{t('home.sourcing.compareScenarioEmpty')}</span>
          ) : (
            <label
              className={`src-compare-pick${scenarioLocked ? ' is-locked' : ''}`}
              title={
                scenarioLocked
                  ? t('home.sourcing.compareScenarioFull')
                  : t('home.sourcing.compareScenarioHint')
              }
            >
              <i className="ri-bookmark-3-line" aria-hidden="true" />
              <select
                value={scenarioKey ?? ''}
                onChange={(event) => onPickScenario(event.target.value)}
                disabled={scenarioLocked}
                aria-label={t('home.sourcing.compareScenarioLab')}
              >
                <option value="">{t('home.sourcing.compareScenarioNone')}</option>
                {picks.map((pick, index) => (
                  <option key={pick.scenario.id} value={`scenario-${pick.scenario.id}`}>
                    {scenarioLabel(pick.scenario, index, t('home.calc.scenario'))}
                  </option>
                ))}
              </select>
              <i className="ri-arrow-down-s-line src-compare-pick-caret" aria-hidden="true" />
            </label>
          )}
          <button
            type="button"
            className="src-compare-clip"
            onClick={onCopyText}
            disabled={items.length < 2}
            title={
              items.length < 2
                ? t('home.sourcing.compareCopyNeed')
                : t('home.sourcing.compareCopyHint')
            }
          >
            <i className="ri-file-copy-2-line" aria-hidden="true" />
            {t('home.sourcing.compareCopy')}
          </button>
          {/* L'état d'avancement de la feuille, rappelé à côté du bouton
              d'impression : ce qui reste à compléter et à relancer se voit
              sans ouvrir la feuille. */}
          {progress && (
            <span className="src-compare-progress" title={t('home.sourcing.compareProgressHint')}>
              <i className="ri-loop-left-line" aria-hidden="true" />
              <span className="src-compare-progress-lab">
                {t('home.sourcing.compareProgressLab')}
              </span>
              <span
                className={`src-compare-progress-item${progress.todo === 0 ? ' is-done' : ' is-open'}`}
              >
                <i
                  className={progress.todo === 0 ? 'ri-check-line' : 'ri-user-unfollow-line'}
                  aria-hidden="true"
                />
                {todoText(progress.todo)}
              </span>
              <span
                className={`src-compare-progress-item${
                  progress.relance === 0 ? ' is-done' : ' is-open'
                }`}
              >
                <i
                  className={progress.relance === 0 ? 'ri-check-line' : 'ri-mail-send-line'}
                  aria-hidden="true"
                />
                {relanceText(progress.relance)}
              </span>
              <span
                className={`src-compare-progress-item${
                  progress.imported === 0 ? ' is-done' : ' is-open'
                }`}
              >
                <i
                  className={progress.imported === 0 ? 'ri-check-line' : 'ri-upload-2-line'}
                  aria-hidden="true"
                />
                {importedText(progress.imported)}
              </span>
            </span>
          )}
          <button
            type="button"
            className="src-compare-print"
            onClick={onPrint}
            disabled={items.length < 2}
            title={
              items.length < 2
                ? t('home.sourcing.comparePrintNeed')
                : t('home.sourcing.comparePrintHint')
            }
          >
            <i className="ri-printer-line" aria-hidden="true" />
            {t('home.sourcing.comparePrint')}
          </button>
          <button
            type="button"
            className="src-compare-csv"
            onClick={onExportCsv}
            disabled={items.length < 2}
            title={
              items.length < 2
                ? t('home.sourcing.compareCsvNeed')
                : t('home.sourcing.compareCsvHint')
            }
          >
            <i className="ri-file-excel-2-line" aria-hidden="true" />
            {t('home.sourcing.compareCsv')}
          </button>
          <input
            ref={fileInput}
            className="src-compare-file"
            type="file"
            accept=".csv,text/csv"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportCsv(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="src-compare-import"
            onClick={() => fileInput.current?.click()}
            title={t('home.sourcing.compareImportHint')}
          >
            <i className="ri-upload-2-line" aria-hidden="true" />
            {t('home.sourcing.compareImport')}
          </button>
          {onClearAllRecipients && (
            <button
              type="button"
              className="src-compare-clearall"
              onClick={() => onClearAllRecipients(filledContactKeys)}
              disabled={filledContactKeys.length === 0}
              title={
                filledContactKeys.length === 0
                  ? t('home.sourcing.compareClearAllNone')
                  : t('home.sourcing.compareClearAllHint')
              }
            >
              <i className="ri-eraser-line" aria-hidden="true" />
              {t('home.sourcing.compareClearAll')}
            </button>
          )}
          <button type="button" className="src-compare-clear" onClick={onClear}>
            <i className="ri-close-line" aria-hidden="true" />
            {t('home.sourcing.compareClear')}
          </button>
        </div>
      </div>

      <div className="src-compare-grid">
        {items.map((item) => {
          const { name, metrics, threshold, level } = item;
          const mail = item.origin === 'product' ? mailOf(item) : null;
          /* L'adresse vient-elle du fichier de travail plutôt que du clavier ? */
          const importedStamp = imported[item.key];
          const contact = recipients[item.key] ?? EMPTY_RECIPIENT;
          const hasContact = contact.name.trim() !== '' || contact.email.trim() !== '';
          return (
            <article key={item.key} className={`src-compare-col is-${level}`}>
              <div className="src-compare-top">
                {item.image ? (
                  <img
                    className="src-compare-img"
                    src={item.image}
                    alt={name}
                    title={`${name} · ${t('home.sourcing.nav')}`}
                  />
                ) : (
                  <span className="src-compare-img src-compare-img--ph" aria-hidden="true">
                    <i className="ri-bookmark-3-line" />
                  </span>
                )}
                <div className="src-compare-copy">
                  <h3 title={name}>{name}</h3>
                  <span
                    className={`dash-verdict is-${level}`}
                    title={t(
                      item.origin === 'scenario'
                        ? 'home.sourcing.compareScenarioTag'
                        : 'home.sourcing.compareProductTag',
                    )}
                  >
                    <i className={VERDICT_ICONS[level]} aria-hidden="true" />
                    {t(VERDICT_LEGEND_KEYS[level].title)}
                  </span>
                  <span className="src-compare-origin">
                    <i
                      className={
                        item.origin === 'scenario' ? 'ri-bookmark-3-line' : 'ri-radar-line'
                      }
                      aria-hidden="true"
                    />
                    {item.origin === 'scenario'
                      ? t('home.sourcing.compareScenarioTag')
                      : item.category
                        ? t(`home.sourcing.cat.${item.category}`)
                        : t('home.sourcing.compareProductTag')}
                  </span>
                  {/* Un scénario dont l'adresse vient du CSV porte la même trace. */}
                  {item.origin === 'scenario' && importedStamp && (
                    <span className="src-compare-imported">
                      <i className="ri-upload-2-line" aria-hidden="true" />
                      {t('home.sourcing.compareToImported', {
                        date: importedWhen(importedStamp),
                      })}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="src-compare-remove"
                  onClick={() => onRemove(item.key)}
                  aria-label={t('home.sourcing.compareRemove', { name })}
                  title={t('home.sourcing.compareRemove', { name })}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </div>

              <dl className="src-compare-rows">
                {lines.map((line) => {
                  const raw = line.value(item);
                  const win = winnerOf(line) === items.indexOf(item);
                  /* The percentage gap hangs on the leading column only. */
                  const delta = leadOf(line) === items.indexOf(item) ? deltaOf(line) : null;
                  return (
                    <div
                      key={line.key}
                      className={`${line.strong ? 'is-strong' : ''}${win ? ' is-top' : ''}`}
                    >
                      <dt>{line.label}</dt>
                      <dd>
                        {Number.isFinite(raw) ? line.format(raw) : '—'}
                        {delta !== null && (
                          <span
                            className="src-compare-delta"
                            title={t('home.sourcing.compareDeltaHint')}
                          >
                            {'Δ '}
                            {pct(delta)}
                          </span>
                        )}
                        {win && <i className="ri-check-line" aria-hidden="true" />}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              {item.origin === 'product' && onRecipient && (
                <div className="src-compare-to">
                  <div className="src-compare-to-head">
                    <span className="src-compare-to-lab">
                      <i className="ri-user-received-line" aria-hidden="true" />
                      {t('home.sourcing.compareToLab')}
                    </span>
                    {hasContact && onClearRecipient && (
                      <button
                        type="button"
                        className="src-compare-to-clear"
                        onClick={() => onClearRecipient(item.key, item.name)}
                        title={t('home.sourcing.compareToClearHint')}
                      >
                        <i className="ri-delete-bin-6-line" aria-hidden="true" />
                        {t('home.sourcing.compareToClear')}
                      </button>
                    )}
                  </div>
                  <div className="src-compare-to-fields">
                    <input
                      className="src-compare-to-input"
                      type="text"
                      value={contact.name}
                      onChange={(event) => onRecipient(item.key, { name: event.target.value })}
                      placeholder={t('home.sourcing.compareToNamePh')}
                      aria-label={t('home.sourcing.compareToName', { name })}
                      maxLength={60}
                      autoComplete="off"
                    />
                    <input
                      className="src-compare-to-input"
                      type="text"
                      inputMode="email"
                      value={contact.email}
                      onChange={(event) => onRecipient(item.key, { email: event.target.value })}
                      placeholder={t('home.sourcing.compareToEmailPh')}
                      aria-label={t('home.sourcing.compareToEmail', { name })}
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                  {contact.email.trim() !== '' && (
                    <span className="src-compare-to-ok">
                      <i className="ri-file-pdf-2-line" aria-hidden="true" />
                      {t('home.sourcing.compareToOk')}
                    </span>
                  )}
                  {/* Une adresse ramenée par le fichier se distingue d'une saisie
                      au clavier : le badge porte la date de l'import. */}
                  {importedStamp && contact.email.trim() !== '' && (
                    <span className="src-compare-to-imported">
                      <i className="ri-upload-2-line" aria-hidden="true" />
                      {t('home.sourcing.compareToImported', {
                        date: importedWhen(importedStamp),
                      })}
                    </span>
                  )}
                </div>
              )}

              {item.origin === 'product' && mail && (
                <button
                  type="button"
                  className={`src-compare-mail${
                    mailState[item.key] === 'done' ? ' is-done' : ''
                  }${mailState[item.key] === 'fail' ? ' is-fail' : ''}`}
                  onClick={(event) => void copyItemMail(event, item)}
                  title={
                    mailState[item.key] === 'fail'
                      ? t('home.sourcing.compareMailBiFail')
                      : t('home.sourcing.compareMailBiHint')
                  }
                >
                  <i
                    className={
                      mailState[item.key] === 'done'
                        ? 'ri-check-line'
                        : mailState[item.key] === 'fail'
                          ? 'ri-error-warning-line'
                          : 'ri-translate-2'
                    }
                    aria-hidden="true"
                  />
                  {t(
                    mailState[item.key] === 'done'
                      ? 'home.sourcing.compareMailBiDone'
                      : mailState[item.key] === 'fail'
                        ? 'home.sourcing.compareMailBiFail'
                        : 'home.sourcing.compareMailBi',
                  )}
                </button>
              )}

              {/* Ce produit a déjà reçu son message : la date reste sur la colonne. */}
              {item.origin === 'product' && mailWhenText(item.key) !== '' && (
                <span className="src-compare-mail-when">
                  <i className="ri-time-line" aria-hidden="true" />
                  {mailWhenText(item.key)}
                  <button
                    type="button"
                    className="src-compare-mail-when-x"
                    onClick={(event) => clearItemMail(event, item.key)}
                    aria-label={t('home.sourcing.compareMailClear', { name })}
                    title={t('home.sourcing.compareMailClearHint')}
                  >
                    <i className="ri-close-line" aria-hidden="true" />
                  </button>
                </span>
              )}

              {item.origin === 'scenario' && item.values && (
                <Link
                  className="src-compare-open"
                  to="/calculateur#calculator"
                  onClick={() => onOpenScenario(item)}
                  aria-label={t('home.sourcing.compareOpenLabel', { name })}
                  title={t('home.sourcing.compareOpenHint')}
                >
                  <i className="ri-tools-line" aria-hidden="true" />
                  {t('home.sourcing.compareOpen')}
                </Link>
              )}
            </article>
          );
        })}

        {items.length === 1 && (
          <p className="src-compare-slot">
            <i className="ri-add-line" aria-hidden="true" />
            {picks.length === 0
              ? t('home.sourcing.comparePickSolo')
              : t('home.sourcing.comparePick')}
          </p>
        )}
      </div>
    </section>
  );
}