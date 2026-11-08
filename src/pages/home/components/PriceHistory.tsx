import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  compute,
  makeFormatters,
  maxSupplierFor,
  num,
  priceForMargin,
  psychoFloorPrice,
} from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { buildSupplierMail } from '@/pages/home/supplierMail';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import {
  buildDefaultHistory,
  buildDefaultSecondHistory,
  loadHistory,
  loadSecondHistory,
  monthLabels,
  persistHistory,
  secondKey,
} from '@/pages/home/priceHistory';
import {
  equivalentSeries,
  loadQuoteCosts,
  persistQuoteCosts,
  quoteValues,
} from '@/pages/home/quoteCosts';
import type { QuoteCosts } from '@/pages/home/quoteCosts';

const EMPTY_QUOTE_COSTS: QuoteCosts = { shipping: '', packaging: '', customs: '' };

/** Les trois coûts qui peuvent différer d'un fournisseur à l'autre. */
const QUOTE_COST_FIELDS: { field: keyof QuoteCosts; label: string }[] = [
  { field: 'shipping', label: 'home.calc.shipping' },
  { field: 'packaging', label: 'home.calc.packaging' },
  { field: 'customs', label: 'home.calc.customs' },
];

type Props = {
  historyKey: string;
  values: Values;
  label: string;
  locale: string;
  initialSeries?: number[];
  initialSecond?: number[];
  breakEven?: number;
  /** Seuil de marge verte : il fixe le prix de vente plancher de l'e-mail. */
  goodFloor?: number;
  supplierName?: string;
  secondName?: string;
  supplierEmail?: string;
  secondEmail?: string;
  onSupplierName?: (name: string) => void;
  onSecondName?: (name: string) => void;
  onSupplierEmail?: (email: string) => void;
  onSecondEmail?: (email: string) => void;
  onSeriesChange?: (series: number[]) => void;
  onSecondChange?: (series: number[]) => void;
};

export default function PriceHistory({
  historyKey,
  values,
  label,
  locale,
  initialSeries,
  initialSecond,
  breakEven = 0,
  goodFloor = 20,
  supplierName = '',
  secondName = '',
  supplierEmail = '',
  secondEmail = '',
  onSupplierName,
  onSecondName,
  onSupplierEmail,
  onSecondEmail,
  onSeriesChange,
  onSecondChange,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const fmt2 = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );
  const months = useMemo(() => monthLabels(locale), [locale]);

  const basePrice = num(values.supplier);
  const secondStorageKey = secondKey(historyKey);

  const [series, setSeries] = useState<number[]>(() =>
    initialSeries && initialSeries.length === 12
      ? [...initialSeries]
      : loadHistory(historyKey, basePrice),
  );
  const [seriesB, setSeriesB] = useState<number[]>(() =>
    initialSecond && initialSecond.length === 12
      ? [...initialSecond]
      : loadSecondHistory(secondStorageKey, basePrice),
  );
  const [compare, setCompare] = useState<boolean>(
    () => Boolean(initialSecond && initialSecond.length === 12),
  );
  /* Transport, emballage et douane propres au devis B. */
  const [costsB, setCostsB] = useState<QuoteCosts>(
    () => loadQuoteCosts()[secondStorageKey] ?? EMPTY_QUOTE_COSTS,
  );
  const [editing, setEditing] = useState(false);
  /* L'adresse qu'on vient de copier, et si la copie a marché. */
  const [copyState, setCopyState] = useState<{ key: 'a' | 'b'; ok: boolean } | null>(null);
  /* L'e-mail bilingue copié depuis la fiche, sans passer par le récapitulatif. */
  const [mailState, setMailState] = useState<{ key: 'a' | 'b'; ok: boolean } | null>(null);
  /* La règle d'arrondi du prix plancher, la même que sur la feuille fournisseur. */
  const [psychoRule] = usePsychoRule();

  /* Coller l'adresse dans Alibaba ou WhatsApp sans la retaper. */
  const copyEmail = async (key: 'a' | 'b', value: string) => {
    const email = value.trim();
    if (email === '') return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(email);
      setCopyState({ key, ok: true });
    } catch {
      setCopyState({ key, ok: false });
    }
  };

  const copyLabel = (key: 'a' | 'b') => {
    if (copyState?.key !== key) return t('home.calc.historyCopyEmail');
    return t(
      copyState.ok ? 'home.calc.historyCopyEmailDone' : 'home.calc.historyCopyEmailFail',
    );
  };

  /* Le même e-mail que sur la feuille fournisseur : prix de vente plancher
     arrondi et prix d'achat maximum, calculés avec les chiffres à l'écran. */
  const mailFor = (name: string) => {
    const green = priceForMargin(values, goodFloor);
    const sale = green === null ? null : psychoFloorPrice(green, psychoRule);
    if (sale === null) return null;
    const buy = maxSupplierFor(values, sale, goodFloor);
    if (buy === null) return null;
    return buildSupplierMail('bi', { name, sale: eur(sale), buy: eur(buy) });
  };

  const copyBilingual = async (key: 'a' | 'b', name: string) => {
    const mail = mailFor(name);
    if (!mail) {
      setMailState({ key, ok: false });
      return;
    }
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`);
      setMailState({ key, ok: true });
    } catch {
      setMailState({ key, ok: false });
    }
  };

  const mailLabel = (key: 'a' | 'b') => {
    if (mailState?.key !== key) return t('home.calc.historyMailBi');
    return t(mailState.ok ? 'home.calc.historyMailBiDone' : 'home.calc.historyMailBiFail');
  };

  /* Sans prix plancher calculable, le bouton reste visible mais inactif :
     pas de message trompeur, et la raison est dans l'infobulle. */
  const canMail = priceForMargin(values, goodFloor) !== null;

  const notify = useRef(onSeriesChange);
  notify.current = onSeriesChange;
  const notifyB = useRef(onSecondChange);
  notifyB.current = onSecondChange;

  useEffect(() => {
    persistHistory(historyKey, series);
    notify.current?.(series);
  }, [historyKey, series]);

  useEffect(() => {
    if (!compare) {
      notifyB.current?.([]);
      return;
    }
    persistHistory(secondStorageKey, seriesB);
    notifyB.current?.(seriesB);
  }, [compare, secondStorageKey, seriesB]);

  const overA =
    breakEven > 0 ? series.filter((price) => price > breakEven + 0.005).length : 0;

  /* Le devis B avec ses propres coûts, et ses prix ramenés à ceux du devis A
     pour que le seuil et le verdict comparent des coûts rendus identiques. */
  const valuesB = useMemo(() => quoteValues(values, costsB), [values, costsB]);
  const comparableB = useMemo(
    () => equivalentSeries(seriesB, values, valuesB),
    [seriesB, values, valuesB],
  );

  const overB =
    compare && breakEven > 0
      ? comparableB.filter((price) => price > breakEven + 0.005).length
      : 0;

  const nets = useMemo(
    () => series.map((price) => compute({ ...values, supplier: String(price) }).net),
    [series, values],
  );

  const netsB = useMemo(
    () =>
      compare
        ? seriesB.map((price) => compute({ ...valuesB, supplier: String(price) }).net)
        : [],
    [compare, seriesB, valuesB],
  );

  const statsOf = (list: number[]) => {
    const total = list.reduce((sum, value) => sum + value, 0);
    return {
      avg: list.length > 0 ? total / list.length : 0,
      min: Math.min(...list),
      max: Math.max(...list),
    };
  };

  const stats = useMemo(() => statsOf(series), [series]);
  const statsB = useMemo(() => statsOf(seriesB), [seriesB]);

  const bestIndex = useMemo(
    () => nets.reduce((best, net, index) => (net > nets[best] ? index : best), 0),
    [nets],
  );

  const scale = compare ? [...series, ...seriesB] : series;
  const chartMax = Math.max(...scale, basePrice, 0.01);
  const chartMin = Math.min(...scale, basePrice);
  const span = Math.max(0.01, chartMax - chartMin);
  const heightOf = (value: number) => 22 + ((value - chartMin) / span) * 72;

  const avgDelta = stats.avg > 0 ? ((basePrice - stats.avg) / stats.avg) * 100 : 0;
  const vsA = stats.avg > 0 ? ((statsB.avg - stats.avg) / stats.avg) * 100 : 0;
  const bestMonth = months[bestIndex];
  const bestNet = nets[bestIndex];

  /* Real names typed by the seller travel to the CSV and the printed recap. */
  const nameA = supplierName.trim() || t('home.calc.historySupplierA');
  const nameB = secondName.trim() || t('home.calc.historySupplierB');

  const verdictStats = useMemo(() => {
    let winsA = 0;
    let winsB = 0;
    let gap = 0;
    series.forEach((price, index) => {
      const other = comparableB[index];
      if (!Number.isFinite(other)) return;
      gap += price - other;
      if (other < price - 0.005) winsB += 1;
      else if (other > price + 0.005) winsA += 1;
    });
    const ties = series.length - winsA - winsB;
    const verdict: 'a' | 'b' | 'tie' =
      winsA === winsB
        ? Math.abs(gap) < 0.01
          ? 'tie'
          : gap > 0
            ? 'b'
            : 'a'
        : winsA > winsB
          ? 'a'
          : 'b';
    return { winsA, winsB, ties, gap, verdict };
  }, [series, comparableB]);

  const update = (index: number, raw: string, second = false) => {
    const parsed = Number(raw.replace(',', '.'));
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    if (second) {
      setSeriesB((prev) => {
        const copy = [...prev];
        copy[index] = next;
        return copy;
      });
      return;
    }
    setSeries((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  };

  const resetHistory = () => {
    setSeries(buildDefaultHistory(historyKey, basePrice));
    if (compare) setSeriesB(buildDefaultSecondHistory(secondStorageKey, basePrice));
  };

  /* Un coût du devis B change : on le garde pour ce scénario, dans ce navigateur. */
  const updateCostB = (field: keyof QuoteCosts, value: string) => {
    const next = { ...costsB, [field]: value };
    setCostsB(next);
    const all = loadQuoteCosts();
    all[secondStorageKey] = next;
    persistQuoteCosts(all);
  };

  return (
    <div className="ph" id={`history-${historyKey}`}>
      <div className="ph-head">
        <h3>{t('home.calc.historyTitle')}</h3>
        <span className="ph-tag" title={label}>
          <i className="ri-store-2-line" aria-hidden="true" /> {label}
        </span>
        <div className="calc-tools">
          <button
            type="button"
            className={`calc-btn${compare ? '' : ' calc-btn--ghost'}`}
            onClick={() => setCompare((prev) => !prev)}
            aria-pressed={compare}
          >
            <i className={compare ? 'ri-check-double-line' : 'ri-layout-column-line'} aria-hidden="true" />
            {compare ? t('home.calc.historyCompareOff') : t('home.calc.historyCompareOn')}
          </button>
          <button
            type="button"
            className="calc-btn calc-btn--ghost"
            onClick={() => setEditing((prev) => !prev)}
          >
            <i className={editing ? 'ri-check-line' : 'ri-edit-line'} aria-hidden="true" />
            {editing ? t('home.calc.historyDone') : t('home.calc.historyEdit')}
          </button>
          {editing && (
            <button type="button" className="calc-btn calc-btn--ghost" onClick={resetHistory}>
              <i className="ri-refresh-line" aria-hidden="true" />
              {t('home.calc.historyReset')}
            </button>
          )}
        </div>
      </div>

      <p className="calc-hint">
        {compare ? t('home.calc.historyCompareIntro') : t('home.calc.historyIntro')}
      </p>

      {/* La fiche du fournisseur : son nom et son adresse, pour que le modèle
          d'e-mail trouve son destinataire sans rien retaper sur papier. */}
      <div className="ph-contact">
        <span className="ph-contact-cap">
          <i className="ri-contacts-book-2-line" aria-hidden="true" />
          {t('home.calc.historyContactTitle')}
        </span>
        <div className="ph-contact-row">
          <label className="ph-contact-item">
            <span className="ph-swatch ph-swatch--a" aria-hidden="true" />
            <input
              className="ph-name"
              type="text"
              maxLength={24}
              value={supplierName}
              placeholder={t('home.calc.historySupplierA')}
              aria-label={t('home.calc.historySupplierAName')}
              onChange={(e) => onSupplierName?.(e.target.value)}
            />
            <span className="ph-email-wrap">
              <i className="ri-mail-line" aria-hidden="true" />
              <input
                className="ph-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={80}
                value={supplierEmail}
                placeholder={t('home.calc.historySupplierAEmail')}
                aria-label={t('home.calc.historySupplierAEmail')}
                onChange={(e) => onSupplierEmail?.(e.target.value)}
              />
            </span>
            {supplierEmail.trim() !== '' && (
              <button
                type="button"
                className={`ph-copy${
                  copyState?.key === 'a'
                    ? copyState.ok
                      ? ' is-done'
                      : ' is-fail'
                    : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  void copyEmail('a', supplierEmail);
                }}
              >
                <i
                  className={
                    copyState?.key === 'a' && copyState.ok
                      ? 'ri-check-line'
                      : 'ri-file-copy-line'
                  }
                  aria-hidden="true"
                />
                {copyLabel('a')}
              </button>
            )}
            {/* L'e-mail bilingue, copié sans ouvrir le récapitulatif. */}
            <button
              type="button"
              className={`ph-copy ph-copy--mail${
                mailState?.key === 'a' ? (mailState.ok ? ' is-done' : ' is-fail') : ''
              }`}
              onMouseDown={(e) => e.preventDefault()}
              disabled={!canMail}
              title={canMail ? t('home.calc.historyMailBiHint') : t('home.calc.historyMailBiNone')}
              onClick={() => {
                void copyBilingual('a', nameA);
              }}
            >
              <i
                className={
                  mailState?.key === 'a' && mailState.ok
                    ? 'ri-check-line'
                    : mailState?.key === 'a'
                      ? 'ri-error-warning-line'
                      : 'ri-translate-2'
                }
                aria-hidden="true"
              />
              {mailLabel('a')}
            </button>
          </label>
          {compare && (
            <label className="ph-contact-item">
              <span className="ph-swatch ph-swatch--b" aria-hidden="true" />
              <input
                className="ph-name ph-name--b"
                type="text"
                maxLength={24}
                value={secondName}
                placeholder={t('home.calc.historySupplierB')}
                aria-label={t('home.calc.historySupplierBName')}
                onChange={(e) => onSecondName?.(e.target.value)}
              />
              <span className="ph-email-wrap ph-email-wrap--b">
                <i className="ri-mail-line" aria-hidden="true" />
                <input
                  className="ph-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={80}
                  value={secondEmail}
                  placeholder={t('home.calc.historySupplierBEmail')}
                  aria-label={t('home.calc.historySupplierBEmail')}
                  onChange={(e) => onSecondEmail?.(e.target.value)}
                />
              </span>
              {secondEmail.trim() !== '' && (
                <button
                  type="button"
                  className={`ph-copy${
                    copyState?.key === 'b'
                      ? copyState.ok
                        ? ' is-done'
                        : ' is-fail'
                      : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    void copyEmail('b', secondEmail);
                  }}
                >
                  <i
                    className={
                      copyState?.key === 'b' && copyState.ok
                        ? 'ri-check-line'
                        : 'ri-file-copy-line'
                    }
                    aria-hidden="true"
                  />
                  {copyLabel('b')}
                </button>
              )}
              <button
                type="button"
                className={`ph-copy ph-copy--mail${
                  mailState?.key === 'b' ? (mailState.ok ? ' is-done' : ' is-fail') : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!canMail}
                title={
                  canMail ? t('home.calc.historyMailBiHint') : t('home.calc.historyMailBiNone')
                }
                onClick={() => {
                  void copyBilingual('b', nameB);
                }}
              >
                <i
                  className={
                    mailState?.key === 'b' && mailState.ok
                      ? 'ri-check-line'
                      : mailState?.key === 'b'
                        ? 'ri-error-warning-line'
                        : 'ri-translate-2'
                  }
                  aria-hidden="true"
                />
                {mailLabel('b')}
              </button>
            </label>
          )}
        </div>
        <p className="calc-hint calc-hint--soft">
          <i className="ri-edit-line" aria-hidden="true" />
          {t('home.calc.historyNamesHint')}
        </p>
        <p className="calc-hint calc-hint--soft">
          <i className="ri-mail-send-line" aria-hidden="true" />
          {t('home.calc.historySupplierEmailHint')}
        </p>
      </div>

      {compare && (
        <div className="ph-contact ph-quote-costs">
          <span className="ph-contact-cap">
            <i className="ri-calculator-line" aria-hidden="true" />
            {t('home.calc.historyQuoteCostsTitle')}
          </span>
          <div className="ph-contact-row">
            {QUOTE_COST_FIELDS.map(({ field, label }) => (
              <label className="ph-contact-item" key={field}>
                <span>{t(label)}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={costsB[field]}
                  placeholder={values[field]}
                  aria-label={`${nameB} ${t(label)}`}
                  onChange={(e) => updateCostB(field, e.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="calc-hint calc-hint--soft">
            <i className="ri-information-line" aria-hidden="true" />
            {t('home.calc.historyQuoteCostsHint')}
          </p>
        </div>
      )}

      {compare && (
        <div className="ph-legend">
          <span className="ph-legend-item">
            <span className="ph-swatch ph-swatch--a" aria-hidden="true" />
            <b className="ph-legend-name">{nameA}</b>
          </span>
          <span className="ph-legend-item">
            <span className="ph-swatch ph-swatch--b" aria-hidden="true" />
            <b className="ph-legend-name">{nameB}</b>
          </span>
        </div>
      )}

      <div className="ph-scroll">
        <div className="ph-chart" role="img" aria-label={t('home.calc.historyTitle')}>
          {series.map((price, index) => {
            const other = seriesB[index];
            const cheaper = price < basePrice - 0.005;
            const isBest = index === bestIndex;
            const over = breakEven > 0 && price > breakEven + 0.005;
            const overOther = compare && breakEven > 0 && comparableB[index] > breakEven + 0.005;
            return (
              <div
                key={`${historyKey}-${months[index].short}`}
                className={`ph-col${cheaper ? ' is-cheap' : ''}${isBest ? ' is-best' : ''}${
                  over ? ' is-over' : ''
                }`}
              >
                <span className="ph-price">{fmt2.format(price)}</span>
                <span className={`ph-track${compare ? ' is-pair' : ''}`}>
                  <span className="ph-fill" style={{ height: `${heightOf(price)}%` }} />
                  {compare && (
                    <span
                      className={`ph-fill ph-fill--b${overOther ? ' is-over-b' : ''}`}
                      style={{ height: `${heightOf(other)}%` }}
                    />
                  )}
                </span>
                <span className="ph-month">{months[index].short}</span>
                <span className="ph-net">{eur(nets[index])}</span>
                {compare && (
                  <span className="ph-net ph-net--b">{eur(netsB[index] ?? 0)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ph-stats">
        <span>
          {t('home.calc.historyToday')} <b>{eur(basePrice)}</b>
        </span>
        <span>
          {t('home.calc.historyAvg')} <b>{eur(stats.avg)}</b>
        </span>
        <span>
          {t('home.calc.historyMin')} <b>{eur(stats.min)}</b>
        </span>
        <span>
          {t('home.calc.historyMax')} <b>{eur(stats.max)}</b>
        </span>
        <span>
          {t('home.calc.historyVsAvg')} <b>{pct(avgDelta)}</b>
        </span>
      </div>

      {compare && (
        <div className="ph-stats ph-stats--b">
          <span className="ph-stats-tag">{nameB}</span>
          <span>
            {t('home.calc.historyAvg')} <b>{eur(statsB.avg)}</b>
          </span>
          <span>
            {t('home.calc.historyMin')} <b>{eur(statsB.min)}</b>
          </span>
          <span>
            {t('home.calc.historyMax')} <b>{eur(statsB.max)}</b>
          </span>
        </div>
      )}

      {breakEven > 0 && (
        <p className={`ph-alert${overA + overB > 0 ? ' is-over' : ''}`} role="status">
          <i
            className={overA + overB > 0 ? 'ri-alert-line' : 'ri-shield-check-line'}
            aria-hidden="true"
          />
          {compare
            ? overA + overB > 0
              ? t('home.calc.historyAlertBoth', {
                  a: overA,
                  b: overB,
                  price: eur(breakEven),
                  nameA,
                  nameB,
                })
              : t('home.calc.historyAlertNone', { price: eur(breakEven) })
            : overA > 0
              ? t('home.calc.historyAlert', { n: overA, price: eur(breakEven) })
              : t('home.calc.historyAlertNone', { price: eur(breakEven) })}
        </p>
      )}

      {compare && (
        <div className={`ph-verdict${verdictStats.verdict === 'tie' ? ' is-tie' : ''}`}>
          <p className="ph-verdict-line" role="status">
            <i
              className={verdictStats.verdict === 'tie' ? 'ri-scales-3-line' : 'ri-trophy-line'}
              aria-hidden="true"
            />
            {verdictStats.verdict === 'b'
              ? t('home.calc.historyVerdictB', {
                  name: nameB,
                  n: verdictStats.winsB,
                  total: eur(Math.abs(verdictStats.gap)),
                })
              : verdictStats.verdict === 'a'
                ? t('home.calc.historyVerdictA', {
                    name: nameA,
                    n: verdictStats.winsA,
                    total: eur(Math.abs(verdictStats.gap)),
                  })
                : t('home.calc.historyVerdictTie', { a: nameA, b: nameB })}
          </p>
          <div className="ph-verdict-bar" aria-hidden="true">
            <span
              className="ph-verdict-fill ph-verdict-fill--a"
              style={{ width: `${(verdictStats.winsA / series.length) * 100}%` }}
            />
            <span
              className="ph-verdict-fill ph-verdict-fill--tie"
              style={{ width: `${(verdictStats.ties / series.length) * 100}%` }}
            />
            <span
              className="ph-verdict-fill ph-verdict-fill--b"
              style={{ width: `${(verdictStats.winsB / series.length) * 100}%` }}
            />
          </div>
          <div className="ph-verdict-legend">
            <span>
              {nameA} · {verdictStats.winsA}/{series.length}
            </span>
            <span>
              {nameB} · {verdictStats.winsB}/{series.length}
            </span>
          </div>
        </div>
      )}

      {compare && (
        <p className="ph-note ph-note--compare">
          <i className="ri-scales-3-line" aria-hidden="true" />{' '}
          {vsA <= 0
            ? t('home.calc.historyCompareCheaper', {
                name: nameB,
                value: pct(Math.abs(vsA)),
                price: eur(Math.abs(statsB.avg - stats.avg)),
              })
            : t('home.calc.historyComparePricier', {
                name: nameB,
                value: pct(Math.abs(vsA)),
                price: eur(Math.abs(statsB.avg - stats.avg)),
              })}
        </p>
      )}

      <p className="ph-note">
        <i className="ri-price-tag-3-line" aria-hidden="true" />{' '}
        {avgDelta <= 0
          ? t('home.calc.historyDeltaDown', { value: pct(Math.abs(avgDelta)) })
          : t('home.calc.historyDeltaUp', { value: pct(avgDelta) })}
      </p>
      <p className="ph-note ph-note--best">
        <i className="ri-award-line" aria-hidden="true" />{' '}
        {t('home.calc.historyBestLine', {
          month: bestMonth.long,
          price: eur(series[bestIndex]),
          net: eur(bestNet),
        })}
      </p>

      {editing && (
        <div className="ph-edit">
          {months.map((month, index) => (
            <label key={`edit-${month.short}-${index}`}>
              <span>{month.short}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.05}
                value={series[index]}
                onChange={(e) => update(index, e.target.value)}
                aria-label={`${nameA} ${month.long}`}
              />
              {compare && (
                <input
                  className="ph-edit-b"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.05}
                  value={seriesB[index]}
                  onChange={(e) => update(index, e.target.value, true)}
                  aria-label={`${nameB} ${month.long}`}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <p className="calc-hint calc-hint--soft">
        <i className="ri-save-line" aria-hidden="true" /> {t('home.calc.historyNetHint')}
      </p>
    </div>
  );
}