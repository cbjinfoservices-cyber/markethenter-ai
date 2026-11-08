import { useEffect } from 'react';

/** Heights of the calculator page's sticky header, per breakpoint. */
const HEADER_DESKTOP = 74;
const HEADER_MOBILE = 60;

function headerOffset(): number {
  return window.innerWidth <= 780 ? HEADER_MOBILE : HEADER_DESKTOP;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Brings the calculator itself under the header when the reader arrives with
 * numbers to load (from the dashboard) or through a `#calculator` link.
 * It waits for the layout to settle so late fonts and images cannot push the
 * tool back out of view, then scrolls once.
 */
export function useCalculatorLanding(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const smooth = !prefersReducedMotion();
    let done = false;
    let tries = 0;
    let last = Number.NaN;
    let stable = 0;
    let timer = 0;

    const step = () => {
      if (done) return;
      tries += 1;
      const target = document.getElementById('calculator');
      if (!target) {
        if (tries > 40) {
          done = true;
          return;
        }
        timer = window.setTimeout(step, 80);
        return;
      }

      const max = document.documentElement.scrollHeight - window.innerHeight;
      const raw = target.getBoundingClientRect().top + window.scrollY - headerOffset();
      const top = Math.max(0, Math.min(max > 0 ? max : raw, raw));
      stable = Math.abs(top - last) < 2 ? stable + 1 : 0;
      last = top;

      if (stable < 1 && tries < 24) {
        timer = window.setTimeout(step, 90);
        return;
      }

      done = true;
      window.scrollTo({ top, left: 0, behavior: smooth ? 'smooth' : 'auto' });
    };

    timer = window.setTimeout(step, 60);

    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);
}

export default useCalculatorLanding;