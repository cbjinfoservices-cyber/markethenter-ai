import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageSkin } from '@/pages/home/pageSkin';
import {
  VEIL_DEFAULT,
  VEIL_MAX,
  VEIL_MIN,
  VEIL_STEP,
  clampVeil,
} from '@/pages/home/veilPref';
import '@/pages/home/prefs.css';

type Props = {
  skin: PageSkin;
  onSkin: (next: PageSkin) => void;
  veil: number;
  onVeil: (next: number) => void;
  /** La lecture confort agrandit la citation et les petits libellés. */
  comfort: boolean;
  onComfort: (next: boolean) => void;
  /** Popover dans l'en-tête, ou bloc posé à plat dans le menu du burger. */
  variant?: 'popover' | 'inline';
};

/**
 * Les préférences d'affichage : le thème clair/sombre, et le curseur qui dose
 * le voile des photos. Un seul endroit pour les deux, sur cette page.
 */
export default function DisplayPrefs({
  skin,
  onSkin,
  veil,
  onVeil,
  comfort,
  onComfort,
  variant = 'popover',
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const sliderId = useId();

  useEffect(() => {
    if (!open) return undefined;
    /* Le clavier arrive directement sur le curseur : c'est le réglage
       qu'on vient chercher ici. */
    panel.current?.querySelector<HTMLElement>('.prefs-range')?.focus();
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fill = ((clampVeil(veil) - VEIL_MIN) / (VEIL_MAX - VEIL_MIN)) * 100;

  /* La vignette montre le voile en direct, à la même échelle que les sections
     photographiques : on n'a plus à fermer le panneau pour juger. */
  const peek = (
    <div
      className="prefs-peek"
      aria-hidden="true"
      style={{ '--peek': `${clampVeil(veil)}%` } as CSSProperties}
    >
      <img
        className="prefs-peek-photo"
        src="https://readdy.ai/api/search-image?query=Cinematic%20dark%20slate%20studio%20backdrop%20with%20a%20small%20glowing%20glass%20data%20tablet%20standing%20on%20a%20matte%20black%20desk%2C%20amber%20rim%20light%20and%20soft%20volumetric%20haze%2C%20main%20subject%20in%20the%20left%20third%2C%20right%20half%20calm%20empty%20dark%20negative%20space%2C%20wide%20cinematic%20shot%2C%20high%20detail%2C%20harmonious%20muted%20composition&width=700&height=200&seq=prefs-peek-veil&orientation=landscape"
        alt=""
      />
      <span className="prefs-peek-veil" />
      <span className="prefs-peek-tag">{t('home.prefs.veilPeek')}</span>
      <span className="prefs-peek-copy">
        <b>7,80 €</b>
        <em>{t('home.prefs.veilPeekLab')}</em>
      </span>
    </div>
  );

  const slider = (
    <div className="prefs-veil">
      <div className="prefs-row-head">
        <label className="prefs-lab" htmlFor={sliderId}>{t('home.prefs.veil')}</label>
        <span className="prefs-value">{veil} %</span>
      </div>
      <input
        id={sliderId}
        className="prefs-range"
        type="range"
        min={VEIL_MIN}
        max={VEIL_MAX}
        step={VEIL_STEP}
        value={veil}
        onChange={(event) => onVeil(Number(event.target.value))}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-label={t('home.prefs.veil')}
        aria-valuetext={`${veil} %`}
      />
      {peek}
      <div className="prefs-scale" aria-hidden="true">
        <span>{t('home.prefs.veilPhoto')}</span>
        <span>{t('home.prefs.veilRead')}</span>
      </div>
      <p className="prefs-hint">{t('home.prefs.veilHint')}</p>
      <button type="button" className="prefs-reset" onClick={() => onVeil(VEIL_DEFAULT)}>
        <i className="ri-refresh-line" aria-hidden="true" />
        {t('home.prefs.reset')}
      </button>
    </div>
  );

  /* La lecture confort ne touche ni les titres ni les chiffres : seulement la
     citation et les petits libellés, pour un œil fatigué en fin de journée. */
  const comfortRow = (
    <div className="prefs-comfort">
      <div className="prefs-comfort-copy">
        <b>{t('home.prefs.comfort')}</b>
        <em>{t('home.prefs.comfortHint')}</em>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={comfort}
        className={['prefs-switch', comfort ? 'is-on' : ''].filter(Boolean).join(' ')}
        onClick={() => onComfort(!comfort)}
      >
        <span className="prefs-switch-knob" aria-hidden="true" />
        <span className="prefs-switch-lab">
          {t(comfort ? 'home.prefs.comfortOn' : 'home.prefs.comfortOff')}
        </span>
      </button>
    </div>
  );

  const settings = (
    <>
      {slider}
      {comfortRow}
    </>
  );

  if (variant === 'inline') {
    return <div className="prefs-inline">{settings}</div>;
  }

  return (
    <div className="prefs" ref={box}>
      <button
        type="button"
        ref={trigger}
        className={['prefs-btn', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('home.prefs.open')}
        title={t('home.prefs.open')}
      >
        <i className="ri-equalizer-2-line" aria-hidden="true" />
        <span>{t('home.prefs.title')}</span>
      </button>

      {open && (
        <div className="prefs-panel" role="dialog" aria-label={t('home.prefs.title')} ref={panel}>
          <div className="prefs-head">
            <span className="prefs-title">
              <i className="ri-contrast-2-line" aria-hidden="true" />
              {t('home.prefs.title')}
            </span>
            <button
              type="button"
              className="prefs-x"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              aria-label={t('home.palette.close')}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>

          <div className="prefs-theme" role="group" aria-label={t('home.prefs.theme')}>
            <button
              type="button"
              className={skin === 'light' ? 'is-on' : undefined}
              onClick={() => onSkin('light')}
              aria-pressed={skin === 'light'}
            >
              <i className="ri-sun-line" aria-hidden="true" />
              {t('home.prefs.light')}
            </button>
            <button
              type="button"
              className={skin === 'dark' ? 'is-on' : undefined}
              onClick={() => onSkin('dark')}
              aria-pressed={skin === 'dark'}
            >
              <i className="ri-moon-clear-line" aria-hidden="true" />
              {t('home.prefs.dark')}
            </button>
          </div>

          {settings}
        </div>
      )}
    </div>
  );
}