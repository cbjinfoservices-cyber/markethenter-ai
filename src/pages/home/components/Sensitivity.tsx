import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters, num } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import {
  buildSensitivityPoints,
  buildSensitivityText,
  sensitivityMarkers,
} from '@/pages/home/sensitivityModel';
import { VERDICT_KEYS, verdictLevelOf } from '@/pages/home/calcVerdict';
import {
  buildSensitivityCsv,
  downloadCsv,
  sensitivityFilename,
} from '@/pages/home/calcExport';
import { recordExport } from '@/pages/home/exportLog';

type Props = {
  values: Values;
  locale: string;
  label: string;
  /** Margin from which the verdict turns green — colours the nine prices. */
  goodFloor: number;
  /** Fills the calculator's sale price field with the clicked price. */
  onPickPrice?: (price: number) => void;
  /** Fournisseur(s) du scénario : leur adresse part avec le fichier CSV. */
  suppliers?: { name: string; email: string }[];
};

export default function Sensitivity({
  values,
  locale,
  label,
  goodFloor,
  onPickPrice,
  suppliers = [],
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const [csvState, setCsvState] = useState<'idle' | 'done' | 'fail'>('idle');
  /* La grille copiée en texte, pour la coller directement dans WhatsApp. */
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle');
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);
  const pickTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(copyTimer.current);
      window.clearTimeout(pickTimer.current);
    },
    [],
  );

  const current = num(values.price);

  const points = useMemo(() => buildSensitivityPoints(values), [values]);
  const markers = useMemo(() => sensitivityMarkers(points, values), [points, values]);
  const { nowIndex, breakIndex, hasBreakEven, breakEven } = markers;

  /* First price that clears the chosen green floor: the floor price of the ladder. */
  const floorIndex = useMemo(
    () => points.findIndex((point) => verdictLevelOf(point.net, point.margin, goodFloor) === 'good'),
    [points, goodFloor],
  );

  const maxAbs = useMemo(
    () => Math.max(...points.map((point) => Math.abs(point.net)), 0.01),
    [points],
  );

  const pickPrice = (price: number) => {
    if (!onPickPrice) return;
    onPickPrice(price);
    setPicked(price);
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(() => setPicked(null), 6000);
  };

  /* Le tableau tel quel, en texte : WhatsApp le garde lisible, sans fichier. */
  const copyGrid = async () => {
    const tags = points.map((point, index) =>
      index === nowIndex
        ? t('home.calc.sensitivityNow')
        : index === floorIndex
          ? t('home.calc.sensitivityFloorTag')
          : index === breakIndex
            ? t('home.calc.sensitivityBreak')
            : '',
    );
    const text = buildSensitivityText(
      `${t('home.calc.sensitivityTitle')} — ${label}`,
      points,
      tags,
      { eur, pct },
      t('home.calc.sensitivityNote', {
        price: eur(current),
        breakEven: hasBreakEven ? eur(breakEven) : '—',
      }),
    );
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      setCopyState('done');
    } catch {
      setCopyState('fail');
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 6000);
  };

  const downloadGrid = () => {
    const rows = points.map((point, index) => ({
      ...point,
      tag:
        index === nowIndex
          ? t('home.calc.sensitivityNow')
          : index === breakIndex
            ? t('home.calc.sensitivityBreak')
            : '',
    }));
    const filename = sensitivityFilename(new Date(), suppliers);
    const ok = downloadCsv(
      /* Le destinataire voyage dans le nom du fichier, pas seulement dedans. */
      filename,
      buildSensitivityCsv(rows, locale, (key) => t(key), label, suppliers),
    );
    if (ok) recordExport(filename);
    setCsvState(ok ? 'done' : 'fail');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCsvState('idle'), 6000);
  };

  return (
    <div className="sens">
      <div className="sens-head">
        <h3>{t('home.calc.sensitivityTitle')}</h3>
        <span className="ph-tag" title={label}>
          <i className="ri-line-chart-line" aria-hidden="true" /> {label}
        </span>
        <div className="calc-tools">
          <button
            type="button"
            className="calc-btn calc-btn--ghost"
            onClick={copyGrid}
            title={t('home.calc.sensitivityCopyHint')}
          >
            <i className="ri-whatsapp-line" aria-hidden="true" />
            {t('home.calc.sensitivityCopy')}
          </button>
          <button type="button" className="calc-btn calc-btn--ghost" onClick={downloadGrid}>
            <i className="ri-file-excel-2-line" aria-hidden="true" />
            {t('home.calc.sensitivityCsv')}
          </button>
        </div>
      </div>

      <p className="calc-hint">{t('home.calc.sensitivityIntro')}</p>
      <p className="calc-hint calc-hint--soft">
        <i className="ri-lightbulb-line" aria-hidden="true" />
        {t('home.calc.sensitivityFloor', { value: goodFloor })}
      </p>
      {onPickPrice && (
        <p className="calc-hint calc-hint--soft">
          <i className="ri-cursor-line" aria-hidden="true" />
          {t('home.calc.sensitivityPickHint')}
        </p>
      )}

      <div className="sens-grid">
        <div className="sens-row sens-row--lab" aria-hidden="true">
          <span>{t('home.calc.sensitivityPrice')}</span>
          <span />
          <span>{t('home.calc.netProfit')}</span>
          <span>{t('home.calc.netMargin')}</span>
          <span />
        </div>

        {points.map((point, index) => {
          const isNow = index === nowIndex;
          const isBreak = index === breakIndex;
          const isFloor = index === floorIndex;
          const level = verdictLevelOf(point.net, point.margin, goodFloor);
          const tag = isNow
            ? t('home.calc.sensitivityNow')
            : isFloor
              ? t('home.calc.sensitivityFloorTag')
              : isBreak
                ? t('home.calc.sensitivityBreak')
                : '';
          return (
            <div
              key={`sens-${point.price}`}
              className={`sens-row is-${level}${isNow ? ' is-now' : ''}${
                isFloor ? ' is-floor' : ''
              }${point.net < 0 ? ' is-neg' : ''}`}
              title={t(VERDICT_KEYS[level].title)}
            >
              {onPickPrice ? (
                <button
                  type="button"
                  className="sens-price sens-pick"
                  onClick={() => pickPrice(point.price)}
                  aria-label={t('home.calc.sensitivityPick', { price: eur(point.price) })}
                  title={t('home.calc.sensitivityPick', { price: eur(point.price) })}
                >
                  {eur(point.price)}
                  <i className="ri-corner-down-left-line" aria-hidden="true" />
                </button>
              ) : (
                <span className="sens-price">{eur(point.price)}</span>
              )}
              <span className="sens-track">
                <span
                  className="sens-fill"
                  style={{ width: `${(Math.abs(point.net) / maxAbs) * 100}%` }}
                />
              </span>
              <span className="sens-net">{eur(point.net)}</span>
              <span className="sens-margin">{pct(point.margin)}</span>
              <span className="sens-tag">{tag}</span>
            </div>
          );
        })}
      </div>

      {picked !== null && (
        <p className="calc-hint calc-hint--ok" role="status">
          <i className="ri-checkbox-circle-line" aria-hidden="true" />
          {t('home.calc.sensitivityPicked', { price: eur(picked) })}
        </p>
      )}

      {copyState !== 'idle' && (
        <p className={`calc-hint ${copyState === 'done' ? 'calc-hint--ok' : 'calc-hint--fail'}`}>
          <i
            className={copyState === 'done' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}
            aria-hidden="true"
          />
          {copyState === 'done'
            ? t('home.calc.sensitivityCopyDone')
            : t('home.calc.sensitivityCopyFail')}
        </p>
      )}

      {csvState !== 'idle' && (
        <p className={`calc-hint ${csvState === 'done' ? 'calc-hint--ok' : 'calc-hint--fail'}`}>
          <i
            className={csvState === 'done' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}
            aria-hidden="true"
          />
          {csvState === 'done' ? t('home.calc.sensitivityCsvDone') : t('home.calc.sensitivityCsvFail')}
        </p>
      )}

      <p className="calc-hint calc-hint--soft">
        <i className="ri-information-line" aria-hidden="true" />
        {t('home.calc.sensitivityNote', {
          price: eur(current),
          breakEven: hasBreakEven ? eur(breakEven) : '—',
        })}
      </p>
    </div>
  );
}