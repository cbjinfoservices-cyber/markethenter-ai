import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PALETTES,
  applyPalette,
  readPalette,
  rememberPalette,
} from '@/components/feature/themePalettes';
import './palette.css';

/**
 * A small palette button, bottom-left of every page: pick one of the colour
 * panels and the whole site follows, on this device only.
 */
export default function PalettePicker() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>(() => readPalette());
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const pick = (id: string) => {
    setCurrent(id);
    applyPalette(id);
    rememberPalette(id);
  };

  return (
    <div className="pal-wrap" ref={wrap}>
      <button
        type="button"
        className={`pal-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('home.palette.aria')}
        title={t('home.palette.aria')}
      >
        <i className="ri-palette-line" aria-hidden="true" />
        <span>{t('home.palette.trigger')}</span>
      </button>

      {open && (
        <div className="pal-panel" role="dialog" aria-label={t('home.palette.title')}>
          <div className="pal-head">
            <span className="pal-title">
              <i className="ri-contrast-2-line" aria-hidden="true" />
              {t('home.palette.title')}
            </span>
            <button
              type="button"
              className="pal-close"
              onClick={() => setOpen(false)}
              aria-label={t('home.palette.close')}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
          <p className="pal-intro">{t('home.palette.intro')}</p>

          <div className="pal-grid">
            {PALETTES.map((palette) => {
              const on = palette.id === current;
              return (
                <button
                  key={palette.id}
                  type="button"
                  className={`pal-item${on ? ' is-on' : ''}`}
                  onClick={() => pick(palette.id)}
                  aria-pressed={on}
                  title={t(`home.palette.${palette.id}`)}
                >
                  <span className="pal-dots" aria-hidden="true">
                    {palette.dots.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <span className="pal-name">{t(`home.palette.${palette.id}`)}</span>
                  {on && <i className="ri-check-line pal-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <p className="pal-note">
            <i className="ri-smartphone-line" aria-hidden="true" />
            {t('home.palette.note')}
          </p>
        </div>
      )}
    </div>
  );
}