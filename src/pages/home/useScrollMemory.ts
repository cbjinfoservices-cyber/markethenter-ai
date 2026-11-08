import { useEffect } from 'react';

const KEY = 'mh.home.scrollY';
const MIN_RESTORE = 120;

function readSaved(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSaved(value: number): void {
  try {
    window.localStorage.setItem(KEY, String(Math.round(value)));
  } catch {
    /* storage blocked — nothing to persist */
  }
}

/**
 * Remembers where the reader stopped and puts them back there when the page
 * is opened again. A hash in the URL always wins over the saved position.
 */
export function useScrollMemory(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const saved = readSaved();
    if (!saved || saved < MIN_RESTORE) return undefined;
    if (window.location.hash) return undefined;

    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    } catch {
      /* older browsers — the retry loop below still handles it */
    }

    let done = false;
    let tries = 0;

    const restore = () => {
      if (done) return;
      tries += 1;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const movedByReader = window.scrollY > 4;
      if (movedByReader || max >= saved || tries > 45) {
        done = true;
        if (max > 0) window.scrollTo({ top: Math.min(saved, max), behavior: 'auto' });
        return;
      }
      window.setTimeout(restore, 70);
    };

    const kickoff = window.setTimeout(restore, 60);
    return () => {
      done = true;
      window.clearTimeout(kickoff);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    const save = () => {
      raf = 0;
      writeSaved(window.scrollY);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(save);
    };
    const flush = () => save();

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
}

export default useScrollMemory;