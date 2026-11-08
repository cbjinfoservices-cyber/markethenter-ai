import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { compute, makeFormatters, priceForMargin, thresholdFor } from '@/pages/home/calcModel';
import type { Scenario, Values } from '@/pages/home/calcModel';
import { SECOND_SUFFIX } from '@/pages/home/priceHistory';
import { quotesOfScenario, supplierNameOf } from '@/pages/home/supplierCompare';
import PriceHistory from './PriceHistory';
import LastExportNote from './LastExportNote';
import Sensitivity from './Sensitivity';

export type ImportResult = { status: 'done' | 'fail'; count: number; truncated: boolean } | null;

type Props = {
  scenarios: Scenario[];
  locale: string;
  max: number;
  target: number;
  /** Margin from which the verdict turns green, shared with the results panel. */
  goodFloor: number;
  activeId: number | null;
  draftValues: Values;
  onSave: () => void;
  onReset: () => void;
  onRename: (id: number, name: string) => void;
  onRemove: (id: number) => void;
  onLoad: (scenario: Scenario) => void;
  onDuplicate: (scenario: Scenario) => void;
  onPrint: () => void;
  onPrintSupplier: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  exportState: 'idle' | 'done' | 'fail';
  importResult: ImportResult;
  histories: Record<string, number[]>;
  historyEpoch: number;
  supplierNames: Record<string, string>;
  supplierEmails: Record<string, string>;
  onSupplierName: (key: string, name: string) => void;
  onSupplierEmail: (key: string, email: string) => void;
  onHistoryChange: (key: string, series: number[]) => void;
  /** Fills the calculator's sale price field with a price picked on the grid. */
  onPickPrice: (price: number) => void;
};

export default function ScenarioStrip({
  scenarios,
  locale,
  max,
  target,
  goodFloor,
  activeId,
  draftValues,
  onSave,
  onReset,
  onRename,
  onRemove,
  onLoad,
  onDuplicate,
  onPrint,
  onPrintSupplier,
  onExport,
  onImport,
  exportState,
  importResult,
  histories,
  historyEpoch,
  supplierNames,
  supplierEmails,
  onSupplierName,
  onSupplierEmail,
  onHistoryChange,
  onPickPrice,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const full = scenarios.length >= max;

  const rows = useMemo(
    () =>
      scenarios.map((s) => ({
        scenario: s,
        metrics: compute(s.values),
        threshold: thresholdFor(s.values, target),
        /* The sale price at which this scenario turns green: printed on the
           card next to the margin, and on paper. */
        greenPrice: priceForMargin(s.values, goodFloor),
      })),
    [scenarios, target, goodFloor],
  );
  const bestNet = rows.length > 1 ? Math.max(...rows.map((r) => r.metrics.net)) : null;

  /* Month-by-month supplier verdict, shown as a badge straight on the cards. */
  const quotes = useMemo(
    () => rows.map(({ scenario }) => quotesOfScenario(scenario, histories)),
    [rows, histories],
  );

  const active = scenarios.find((s) => s.id === activeId) ?? null;
  const activeIndex = active ? scenarios.findIndex((s) => s.id === active.id) : -1;
  const historyKey = active ? `s${active.id}` : 'draft';
  const historyValues = active ? active.values : draftValues;
  const historyLabel = active
    ? active.name.trim() ||
      `${t('home.calc.scenario')} ${String.fromCharCode(65 + Math.max(0, activeIndex))}`
    : t('home.calc.historyDraft');
  const breakEven = thresholdFor(historyValues, 0).breakEvenPrice;

  return (
    <div className="calc-compare" data-reveal>
      <div className="calc-compare-head">
        <h3>{t('home.calc.compareTitle')}</h3>
        <div className="calc-tools">
          <button type="button" className="calc-btn" onClick={onSave} disabled={full}>
            <i className="ri-add-line" aria-hidden="true" />
            {t('home.calc.save')}
          </button>
          <button type="button" className="calc-btn calc-btn--ghost" onClick={onReset}>
            <i className="ri-refresh-line" aria-hidden="true" />
            {t('home.calc.reset')}
          </button>
          <button
            type="button"
            className="calc-btn calc-btn--ghost"
            onClick={onPrint}
            title={t('home.calc.printDraftHint')}
          >
            <i className="ri-printer-line" aria-hidden="true" />
            {t('home.calc.print')}
          </button>
          <button
            type="button"
            className="calc-btn calc-btn--ghost"
            onClick={onPrintSupplier}
            title={t('home.calc.printDraftHint')}
          >
            <i className="ri-store-2-line" aria-hidden="true" />
            {t('home.calc.printSupplier')}
          </button>
          <button
            type="button"
            className="calc-btn calc-btn--ghost"
            onClick={onExport}
            disabled={scenarios.length === 0}
          >
            <i className="ri-file-excel-2-line" aria-hidden="true" />
            {t('home.calc.exportCsv')}
          </button>
          <label className="calc-btn calc-btn--ghost calc-import" title={t('home.calc.importHint')}>
            <i className="ri-upload-2-line" aria-hidden="true" />
            {t('home.calc.importCsv')}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={t('home.calc.importCsv')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <p className="calc-hint">{full ? t('home.calc.max') : t('home.calc.compareIntro')}</p>

      {exportState === 'done' && (
        <p className="calc-hint calc-hint--ok">
          <i className="ri-checkbox-circle-line" aria-hidden="true" />
          {t('home.calc.csvDone')}
        </p>
      )}
      {exportState === 'fail' && (
        <p className="calc-hint calc-hint--fail">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {t('home.calc.csvFail')}
        </p>
      )}

      {/* Ce qui est déjà parti : nom du fichier et heure du téléchargement. */}
      <LastExportNote locale={locale} />

      {importResult && importResult.status === 'done' && (
        <>
          <p className="calc-hint calc-hint--ok">
            <i className="ri-checkbox-circle-line" aria-hidden="true" />
            {t('home.calc.importDone', { n: importResult.count })}
          </p>
          {importResult.truncated && (
            <p className="calc-hint calc-hint--warn">
              <i className="ri-information-line" aria-hidden="true" />
              {t('home.calc.importTruncated')}
            </p>
          )}
        </>
      )}
      {importResult && importResult.status === 'fail' && (
        <p className="calc-hint calc-hint--fail">
          <i className="ri-error-warning-line" aria-hidden="true" />
          {t('home.calc.importFail')}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="calc-empty">{t('home.calc.empty')}</p>
      ) : (
        <div className="calc-cards">
          {rows.map(({ scenario, metrics, threshold, greenPrice }, index) => {
            const isBest = bestNet !== null && metrics.net === bestNet;
            const fallbackName = `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
            const quote = quotes[index];
            const comparison = quote?.comparison ?? null;
            const nameA = supplierNameOf(
              supplierNames,
              `s${scenario.id}`,
              t('home.calc.historySupplierA'),
            );
            const nameB = supplierNameOf(
              supplierNames,
              `s${scenario.id}${SECOND_SUFFIX}`,
              t('home.calc.historySupplierB'),
            );
            const winnerName = comparison?.winner === 'b' ? nameB : nameA;
            const winnerMonths =
              comparison?.winner === 'b' ? comparison.winsB : comparison?.winsA ?? 0;
            return (
              <article
                key={scenario.id}
                className={`calc-card${isBest ? ' is-best' : ''}${
                  scenario.id === activeId ? ' is-active' : ''
                }`}
              >
                <div className="calc-card-top">
                  <input
                    className="calc-card-name"
                    type="text"
                    value={scenario.name}
                    placeholder={fallbackName}
                    aria-label={t('home.calc.nameLabel')}
                    maxLength={28}
                    onChange={(e) => onRename(scenario.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="calc-card-x"
                    aria-label={t('home.calc.duplicate')}
                    title={t('home.calc.duplicate')}
                    onClick={() => onDuplicate(scenario)}
                    disabled={full}
                  >
                    <i className="ri-file-copy-line" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="calc-card-x"
                    aria-label={t('home.calc.remove')}
                    onClick={() => onRemove(scenario.id)}
                  >
                    <i className="ri-close-line" aria-hidden="true" />
                  </button>
                </div>

                {isBest && <span className="calc-best">{t('home.calc.best')}</span>}

                {comparison && (
                  <span
                    className={`calc-card-supplier${
                      comparison.winner === 'tie' ? ' is-tie' : ''
                    }`}
                    title={
                      comparison.winner === 'tie'
                        ? t('home.calc.supplierBestTie', { a: nameA, b: nameB })
                        : t('home.calc.supplierBestTitle', {
                            name: winnerName,
                            n: winnerMonths,
                            total: eur(Math.abs(comparison.gap)),
                          })
                    }
                  >
                    <i
                      className={
                        comparison.winner === 'tie' ? 'ri-scales-3-line' : 'ri-trophy-line'
                      }
                      aria-hidden="true"
                    />
                    <span className="calc-card-supplier-lab">
                      {t('home.calc.supplierBestBadge')}
                    </span>
                    <b>
                      {comparison.winner === 'tie'
                        ? t('home.calc.supplierBestTieShort')
                        : winnerName}
                    </b>
                    {comparison.winner !== 'tie' && (
                      <span className="calc-card-supplier-save">
                        {t('home.calc.supplierBestSave', {
                          value: eur(comparison.savedPerUnit),
                        })}
                      </span>
                    )}
                  </span>
                )}

                <b className={`calc-card-net${metrics.net < 0 ? ' is-neg' : ' is-pos'}`}>
                  {eur(metrics.net)}
                </b>
                <span className="calc-card-cap">
                  {t('home.calc.netProfit')} · {pct(metrics.netMargin)}
                </span>
                <span
                  className={`calc-card-green${greenPrice === null ? ' is-none' : ''}`}
                  title={t('home.calc.cardGreenHint', { value: goodFloor })}
                >
                  <i className="ri-checkbox-blank-circle-fill" aria-hidden="true" />
                  <em>{t('home.calc.cardGreenFrom')}</em>
                  <b>{greenPrice === null ? '—' : eur(greenPrice)}</b>
                </span>

                <div className="calc-card-bar" aria-hidden="true">
                  <span className="calc-card-bar-cost" style={{ width: `${metrics.costPct}%` }} />
                  <span className="calc-card-bar-profit" style={{ width: `${metrics.profitPct}%` }} />
                </div>
                <div className="calc-card-split">
                  <span>{t('home.calc.costPart')} {pct(metrics.costPct)}</span>
                  <span>{t('home.calc.profitPart')} {pct(metrics.profitPct)}</span>
                </div>

                <dl className="calc-card-rows">
                  <div>
                    <dt>{t('home.calc.roi')}</dt>
                    <dd>{pct(metrics.roi)}</dd>
                  </div>
                  <div>
                    <dt>{t('home.calc.totalCost')}</dt>
                    <dd>{eur(metrics.totalCost)}</dd>
                  </div>
                  <div>
                    <dt>{t('home.calc.minPriceShort')}</dt>
                    <dd>{threshold.feasible ? eur(threshold.minPrice) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('home.calc.monthly')}</dt>
                    <dd>{eur(metrics.monthly)}</dd>
                  </div>
                  <div>
                    <dt>{t('home.calc.price')}</dt>
                    <dd>{eur(metrics.price)}</dd>
                  </div>
                  <div>
                    <dt>{t('home.calc.netHT')}</dt>
                    <dd>{eur(metrics.netHT)}</dd>
                  </div>
                </dl>

                <button type="button" className="calc-card-load" onClick={() => onLoad(scenario)}>
                  {t('home.calc.load')}
                  <i className="ri-arrow-right-up-line" aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <Link to="/dashboard" className="calc-side-link">
        {t('home.calc.orInDash')}
        <i className="ri-arrow-right-line" aria-hidden="true" />
      </Link>

      <PriceHistory
        key={`${historyKey}:${historyEpoch}`}
        historyKey={historyKey}
        values={historyValues}
        label={historyLabel}
        locale={locale}
        initialSeries={histories[historyKey]}
        initialSecond={histories[`${historyKey}:b`]}
        breakEven={breakEven}
        goodFloor={goodFloor}
        supplierName={supplierNames[historyKey] ?? ''}
        secondName={supplierNames[`${historyKey}:b`] ?? ''}
        supplierEmail={supplierEmails[historyKey] ?? ''}
        secondEmail={supplierEmails[`${historyKey}:b`] ?? ''}
        onSupplierName={(name) => onSupplierName(historyKey, name)}
        onSecondName={(name) => onSupplierName(`${historyKey}:b`, name)}
        onSupplierEmail={(email) => onSupplierEmail(historyKey, email)}
        onSecondEmail={(email) => onSupplierEmail(`${historyKey}:b`, email)}
        onSeriesChange={(series) => onHistoryChange(historyKey, series)}
        onSecondChange={(series) => onHistoryChange(`${historyKey}:b`, series)}
      />

      <Sensitivity
        values={historyValues}
        locale={locale}
        label={historyLabel}
        goodFloor={goodFloor}
        onPickPrice={onPickPrice}
        suppliers={[
          {
            name: supplierNameOf(supplierNames, historyKey, t('home.calc.historySupplierA')),
            email: supplierEmails[historyKey] ?? '',
          },
          {
            name: supplierNameOf(
              supplierNames,
              `${historyKey}${SECOND_SUFFIX}`,
              t('home.calc.historySupplierB'),
            ),
            email: supplierEmails[`${historyKey}${SECOND_SUFFIX}`] ?? '',
          },
        ]}
      />
    </div>
  );
}