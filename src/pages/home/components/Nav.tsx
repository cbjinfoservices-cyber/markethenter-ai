import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LangSwitch from './LangSwitch';
import AccountMenu from './AccountMenu';
import AlertPill from './AlertPill';
import DisplayPrefs from './DisplayPrefs';
import BackToTop from './BackToTop';
import { useActiveSection } from '@/pages/home/useActiveSection';
import { useSupplierAlerts } from '@/pages/home/supplierAlerts';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from './SiteNavigationLinks';
import { readReadingSpots, resumeReading, saveReadingSpot } from '@/pages/home/readingSpot';
import type { ReadingSpot } from '@/pages/home/readingSpot';
import type { PageSkin } from '@/pages/home/pageSkin';

const SOLID_AT = 24;
const COMPACT_AT = 64;
const MOBILE_COMPACT_AT = 8;
const MOBILE_MAX = 780;
const LAST_MOBILE_KEY = 'mh.nav.lastMobile';

/** Sections listed in the burger, the only ones it can remember. */
const MOBILE_IDS = ['modules', 'pricing', 'faq', 'contact'];

/** How long the alert dot keeps pulsing after a new supplier goes over. */
const PULSE_MS = 5200;

type NavProps = {
  skin: PageSkin;
  onToggleSkin: () => void;
  onSkin: (next: PageSkin) => void;
  veil: number;
  onVeil: (next: number) => void;
  comfort: boolean;
  onComfort: (next: boolean) => void;
};

export default function Nav({ skin, onToggleSkin, onSkin, veil, onVeil, comfort, onComfort }: NavProps) {
  const { t } = useTranslation();
  const { items: navigation, signedIn } = useSiteNavigation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [compact, setCompact] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastMobile, setLastMobile] = useState('');
  const [spots, setSpots] = useState<ReadingSpot[]>([]);
  const [alertPulse, setAlertPulse] = useState(false);
  const seenAlerts = useRef('');
  const pulseTimer = useRef<number | undefined>(undefined);
  const mobilePanel = useRef<HTMLDivElement>(null);
  const burgerBtn = useRef<HTMLButtonElement>(null);
  const active = useActiveSection();
  const alerts = useSupplierAlerts(t);
  const alertCount = signedIn ? alerts.length : 0;
  const alertMonths = alerts.reduce((sum, alert) => sum + alert.monthsOver, 0);

  /* Remember the last section read in the burger. */
  useEffect(() => {
    try {
      const savedMobile = window.localStorage.getItem(LAST_MOBILE_KEY);
      if (savedMobile && MOBILE_IDS.includes(savedMobile)) setLastMobile(savedMobile);
    } catch {
      /* storage unavailable — the panels still work */
    }
  }, []);

  /* A supplier that just crossed break-even makes the burger dot pulse, then
     it settles: the count alone stays readable afterwards. */
  useEffect(() => {
    const keys = alerts
      .map((alert) => alert.key)
      .sort()
      .join('|');
    const previous = seenAlerts.current;
    seenAlerts.current = keys;
    if (!previous) return;
    const before = new Set(previous.split('|'));
    const crossed = keys.split('|').some((key) => key !== '' && !before.has(key));
    if (!crossed) return;
    setAlertPulse(true);
    window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setAlertPulse(false), PULSE_MS);
  }, [alerts]);

  useEffect(() => () => window.clearTimeout(pulseTimer.current), []);

  /* The burger keeps the last section actually read. */
  useEffect(() => {
    if (!MOBILE_IDS.includes(active)) return;
    setLastMobile(active);
    try {
      window.localStorage.setItem(LAST_MOBILE_KEY, active);
    } catch {
      /* storage unavailable — the marker stays for this session only */
    }
  }, [active]);

  /* Where exactly the reader stopped inside that section, line by line.
     Saved while scrolling and once more when leaving the section, so passing
     through a chapter never erases the line it was left on. */
  useEffect(() => {
    if (!MOBILE_IDS.includes(active)) return undefined;
    let raf = 0;
    let lastY = window.scrollY;
    const save = () => {
      raf = 0;
      saveReadingSpot(active, lastY);
    };
    const schedule = () => {
      lastY = window.scrollY;
      if (!raf) raf = window.requestAnimationFrame(save);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      if (raf) window.cancelAnimationFrame(raf);
      saveReadingSpot(active, lastY);
    };
  }, [active]);

  /* The burger offers several resumable stops, freshest first. */
  useEffect(() => {
    if (!open) return;
    setSpots(
      readReadingSpots()
        .filter((spot) => MOBILE_IDS.includes(spot.id))
        .slice(0, 3),
    );
  }, [open, active]);

  /* Compact header + reading progress. Mobile shrinks much sooner. */
  useEffect(() => {
    const apply = () => {
      const y = window.scrollY;
      const isMobile = window.innerWidth <= MOBILE_MAX;
      const compactAt = isMobile ? MOBILE_COMPACT_AT : COMPACT_AT;
      const solidAt = isMobile ? MOBILE_COMPACT_AT : SOLID_AT;
      setScrolled(y > solidAt);
      setCompact(y > compactAt);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    apply();
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply);
    window.addEventListener('load', apply);
    return () => {
      window.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('load', apply);
    };
  }, []);

  /* Move keyboard focus into the freshly opened burger panel. */
  useEffect(() => {
    if (!open) return;
    const first = mobilePanel.current?.querySelector<HTMLElement>('a, button');
    first?.focus();
  }, [open]);

  const sectionLabels: Record<string, string> = {
    overview: t('home.nav.overview'),
    detection: t('home.nav.detection'),
    margin: t('home.nav.margin'),
    score: t('home.nav.score'),
    modules: t('home.nav.modules'),
    calculator: t('home.nav.calculator'),
    pricing: t('home.nav.pricing'),
    faq: t('home.nav.faq'),
    contact: t('home.nav.contact'),
  };
  const readout = active ? sectionLabels[active] || '' : '';

  const closeAll = () => {
    setOpen(false);
  };

  /* The remembered line is read at click time, so a fresh stop wins. */
  const resume = (id: string) => {
    closeAll();
    window.setTimeout(() => resumeReading(id), 40);
  };

  const mobileItems = () => Array.from(mobilePanel.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
    .filter((el) => el.offsetParent !== null);

  const onMobileKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = mobileItems();
    if (!list.length) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      const i = ((index % list.length) + list.length) % list.length;
      list[i].focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        go(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        go(current <= 0 ? list.length - 1 : current - 1);
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(list.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        burgerBtn.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const headerClass = ['nav', scrolled ? 'is-solid' : '', compact ? 'is-compact' : ''].filter(Boolean).join(' ');

  return (
    <>
      <header className={headerClass}>
        <a href="#overview" data-progress="0" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </a>
        <nav className="nav-links">
          <SiteNavigationLinks items={navigation.map((item) => signedIn ? item : {
            ...item,
            current: active === item.key,
          })} />
        </nav>
        <div className="nav-right">
          <button
            type="button"
            className={`nav-skin${skin === 'light' ? ' is-on' : ''}`}
            onClick={onToggleSkin}
            aria-pressed={skin === 'light'}
            title={t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}
          >
            <i
              className={skin === 'light' ? 'ri-moon-clear-line' : 'ri-sun-line'}
              aria-hidden="true"
            />
            <span>{t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}</span>
          </button>
          <DisplayPrefs skin={skin} onSkin={onSkin} veil={veil} onVeil={onVeil} comfort={comfort} onComfort={onComfort} />
          {signedIn && <AlertPill />}
          <AccountMenu />
          <button
            type="button"
            ref={burgerBtn}
            className={['burger', alertCount > 0 ? 'has-alert' : ''].filter(Boolean).join(' ')}
            aria-label={
              alertCount > 0
                ? `${t('home.nav.menu')} — ${t('home.alerts.badge', { count: alertCount, months: alertMonths })}`
                : t('home.nav.menu')
            }
            aria-expanded={open}
            aria-controls="nav-mobile-panel"
            onClick={() => setOpen((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.preventDefault();
                setOpen(false);
              }
            }}
          >
            <i className={open ? 'ri-close-line' : 'ri-menu-line'} />
            {alertCount > 0 && (
              <span
                className={['burger-badge', alertPulse ? 'is-new' : ''].filter(Boolean).join(' ')}
                aria-hidden="true"
              >
                {alertCount}
              </span>
            )}
          </button>
        </div>
        <span className={['nav-readout', scrolled && readout ? 'is-on' : ''].filter(Boolean).join(' ')} aria-hidden="true">
          <span className="nav-readout-dot" />
          {readout}
        </span>
        <div
          className="nav-progress"
          role="progressbar"
          aria-label={t('home.nav.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      </header>
      {open && (
        <div className="nav-mobile" id="nav-mobile-panel" ref={mobilePanel} onKeyDown={onMobileKeys}>
          {signedIn && <AlertPill />}
          {signedIn && (
          <div className="nav-mobile-pro-head">
            <p className="nav-mobile-lab">{t('home.nav.pro')}</p>
            {alertCount > 0 && (
              <span
                className={['nav-mobile-count', alertPulse ? 'is-new' : ''].filter(Boolean).join(' ')}
              >
                <i className="ri-alert-line" aria-hidden="true" />
                {t('home.alerts.chip', { count: alertCount })}
              </span>
            )}
          </div>
          )}
          {navigation.map((item) => !signedIn ? (
            <a
              key={item.key}
              href={item.to.slice(1)}
              className={[
                active === item.key ? 'is-current' : '',
                lastMobile === item.key && active !== item.key ? 'is-recent' : '',
              ].filter(Boolean).join(' ') || undefined}
              aria-current={active === item.key ? 'true' : undefined}
              onClick={closeAll}
            >
              {item.label}
            </a>
          ) : (
            <Link
              key={item.key}
              to={item.to}
              className={`nav-mobile-pro${item.current ? ' is-current' : ''}`}
              aria-current={item.current ? 'page' : undefined}
              onClick={closeAll}
            >
              <i className={item.icon} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
          {!signedIn && spots.length > 0 && (
            <div className="nav-mobile-resume">
              {spots.map((spot, index) => {
                const name = sectionLabels[spot.id];
                if (!name) return null;
                return (
                  <a
                    key={spot.id}
                    className={['nav-mobile-last', index === 0 ? 'is-latest' : ''].filter(Boolean).join(' ')}
                    href={`#${spot.id}`}
                    aria-label={
                      index === 0
                        ? t('home.nav.lastSectionResume', { name })
                        : t('home.nav.earlierSectionResume', { name })
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      resume(spot.id);
                    }}
                  >
                    <i
                      className={index === 0 ? 'ri-history-line' : 'ri-arrow-turn-forward-line'}
                      aria-hidden="true"
                    />
                    <span>
                      {index === 0
                        ? t('home.nav.lastSection', { name })
                        : t('home.nav.earlierSection', { name })}
                    </span>
                    <i className="ri-corner-up-right-line nav-mobile-last-go" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          )}
          <div className="nav-mobile-skin">
            <button
              type="button"
              className={`nav-skin${skin === 'light' ? ' is-on' : ''}`}
              onClick={onToggleSkin}
              aria-pressed={skin === 'light'}
            >
              <i
                className={skin === 'light' ? 'ri-moon-clear-line' : 'ri-sun-line'}
                aria-hidden="true"
              />
              <span>
                {t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}
              </span>
            </button>
          </div>
          <div className="nav-mobile-prefs">
            <p className="nav-mobile-lab">{t('home.prefs.veilLab')}</p>
            <DisplayPrefs
              variant="inline"
              skin={skin}
              onSkin={onSkin}
              veil={veil}
              onVeil={onVeil}
              comfort={comfort}
              onComfort={onComfort}
            />
          </div>
          <div className="nav-mobile-lang">
            <p className="nav-mobile-lab">{t('home.account.lang')}</p>
            <LangSwitch />
          </div>
        </div>
      )}
      <BackToTop />
    </>
  );
}