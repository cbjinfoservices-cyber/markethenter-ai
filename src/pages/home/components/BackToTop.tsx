import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollMemory } from '@/pages/home/useScrollMemory';
import { BACK_TO_TOP_KEY, scrollPageToTop, useBackToTopShortcut } from '@/pages/home/useBackToTopShortcut';

/** Discreet "back to top" control, echoing the reading progress bar. */
export default function BackToTop({ remember = true }: { remember?: boolean }) {
  const { t } = useTranslation();
  useScrollMemory(remember);
  useBackToTopShortcut();
  const [show, setShow] = useState(false);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPercent(max > 0 ? Math.min(100, Math.max(0, Math.round((y / max) * 100))) : 0);
      setShow(y > window.innerHeight * 0.55);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('load', schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const jump = useCallback(() => {
    scrollPageToTop();
  }, []);

  const label = t('home.nav.backToTop');

  return (
    <button
      type="button"
      className={['back-top', show ? 'is-on' : ''].filter(Boolean).join(' ')}
      aria-label={`${label} — ${percent}% (${BACK_TO_TOP_KEY.toUpperCase()})`}
      title={t('home.nav.backToTopHint')}
      tabIndex={show ? 0 : -1}
      onClick={jump}
    >
      <i className="ri-arrow-up-line" aria-hidden="true" />
      <span className="back-top-pct" aria-hidden="true">{percent}%</span>
    </button>
  );
}