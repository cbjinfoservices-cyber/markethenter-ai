import { useTranslation } from 'react-i18next';
import type { PrintCurve as PrintCurveData } from '@/pages/home/printCurves';

type Props = {
  curve: PrintCurveData;
  scenarioId: number;
  name: string;
  months: { short: string; long: string }[];
  eur: (value: number) => string;
  large?: boolean;
};

/**
 * One scenario's 12-month purchase price curve, shared by the internal recap
 * and the supplier-only document so both always print the same picture.
 */
export default function PrintCurve({ curve, scenarioId, name, months, eur, large = false }: Props) {
  const { t } = useTranslation();
  const classe = (price: number, second: boolean): string => {
    if (second) return 'sheet-curve-bar sheet-curve-bar--b';
    return curve.over > 0 && price > curve.breakEven + 0.005
      ? 'sheet-curve-bar is-over'
      : 'sheet-curve-bar';
  };

  return (
    <>
      <div
        className={`sheet-curve${large ? ' sheet-curve--lg' : ''}`}
        role="img"
        aria-label={t('home.calc.printHistoryAria', { name })}
      >
        {curve.series.map((price, index) => (
          <span
            key={`${scenarioId}-c${index}`}
            className={classe(price, false)}
            style={{ height: `${curve.heightOf(price)}%` }}
          />
        ))}
        {curve.second?.map((price, index) => (
          <span
            key={`${scenarioId}-b${index}`}
            className={classe(price, true)}
            style={{ height: `${curve.heightOf(price)}%` }}
          />
        ))}
        {curve.hasBreak && (
          <span className="sheet-curve-line" style={{ bottom: `${curve.linePct}%` }} />
        )}
      </div>
      <span className="sheet-curve-axis">
        {months[0].short} — {months[months.length - 1].short}
      </span>
      <span className="sheet-split-cap">
        {curve.over > 0
          ? t('home.calc.printHistoryNote', {
              min: eur(curve.lowPrice),
              max: eur(curve.highPrice),
              n: curve.over,
            })
          : t('home.calc.printHistorySafe', {
              min: eur(curve.lowPrice),
              max: eur(curve.highPrice),
            })}
      </span>
      {curve.hasBreak && (
        <span className="sheet-curve-beline">
          <span className="sheet-curve-beline-mark" aria-hidden="true" />
          {t('home.calc.printBreakEvenLine', { price: eur(curve.breakEven) })}
        </span>
      )}
      {curve.second && (
        <span className="sheet-split-cap">
          {t('home.calc.printCompareNote', { name: curve.nameB })}
        </span>
      )}
      {curve.second && (
        <span className="sheet-curve-verdict">
          {curve.verdict === 'tie'
            ? t('home.calc.printCompareTie', { a: curve.nameA, b: curve.nameB })
            : t('home.calc.printCompareVerdict', {
                name: curve.verdict === 'b' ? curve.nameB : curve.nameA,
                n: curve.verdict === 'b' ? curve.winsB : curve.winsA,
                total: eur(Math.abs(curve.gap)),
              })}
        </span>
      )}
    </>
  );
}