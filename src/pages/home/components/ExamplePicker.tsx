import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compute, makeFormatters } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { CALC_EXAMPLES } from '@/pages/home/calcExamples';
import { verdictLevelOf } from '@/pages/home/calcVerdict';
import { useGoodFloor } from '@/pages/home/useGoodMargin';

type Props = {
  locale: string;
  onLoad: (values: Values, name: string) => void;
};

/** Loads one of three ready-made products so the tool is useful in two clicks. */
export default function ExamplePicker({ locale, onLoad }: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const [goodFloor] = useGoodFloor();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="calc-examples" ref={wrap}>
      <div className="calc-examples-head">
        <button
          type="button"
          className="calc-btn calc-btn--ghost"
          aria-expanded={open}
          aria-controls="calc-example-list"
          onClick={() => setOpen((prev) => !prev)}
        >
          <i className={open ? 'ri-close-line' : 'ri-sparkling-line'} aria-hidden="true" />
          {open ? t('home.calc.examplesClose') : t('home.calc.examples')}
        </button>
        <span className="calc-examples-hint">{t('home.calc.examplesHint')}</span>
      </div>

      {open && (
        <div className="calc-examples-panel" id="calc-example-list">
          {CALC_EXAMPLES.map((example) => {
            const metrics = compute(example.values);
            const level = verdictLevelOf(metrics.net, metrics.netMargin, goodFloor);
            const name = t(example.nameKey);
            return (
              <button
                type="button"
                className="calc-example"
                key={example.id}
                onClick={() => {
                  onLoad(example.values, name);
                  setOpen(false);
                }}
              >
                <span className="calc-example-top">
                  <i className={example.icon} aria-hidden="true" />
                  <span className="calc-example-name">{name}</span>
                </span>
                <span className="calc-example-meta">
                  <span>{t(example.tagKey)}</span>
                  <b className={`is-${level}`}>{pct(metrics.netMargin)}</b>
                </span>
                <span className="calc-example-meta">
                  <span>{t('home.calc.examplesNet')}</span>
                  <b className={metrics.net < 0 ? 'is-neg' : undefined}>{eur(metrics.net)}</b>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}