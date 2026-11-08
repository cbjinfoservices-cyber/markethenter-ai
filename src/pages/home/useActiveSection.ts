import { useEffect, useState } from 'react';

/** Sections that the header can highlight, in document order. */
const SECTION_IDS = [
  'overview',
  'detection',
  'margin',
  'score',
  'modules',
  'calculator',
  'pricing',
  'faq',
  'contact',
];

type Marker = { id: string; top: number };

const PROBE = 0.35;

/**
 * Returns the id of the section currently under the reading line.
 * Chapters (the video beats) are laid out inside a sticky stage, so their
 * beats are mapped through the chapter scroll progress instead of rects.
 */
export function useActiveSection(): string {
  const [active, setActive] = useState('overview');

  useEffect(() => {
    let raf = 0;

    const compute = () => {
      raf = 0;
      const vh = window.innerHeight;
      const probe = window.scrollY + vh * PROBE;
      const markers: Marker[] = [];

      document.querySelectorAll<HTMLElement>('.chapter').forEach((chapter) => {
        const top = chapter.getBoundingClientRect().top + window.scrollY;
        const travel = Math.max(0, chapter.offsetHeight - vh);
        chapter.querySelectorAll<HTMLElement>('.beat[id]').forEach((beat) => {
          const from = parseFloat(beat.dataset.from || '0') || 0;
          markers.push({ id: beat.id, top: top + travel * from });
        });
      });

      SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('beat')) return;
        markers.push({ id, top: el.getBoundingClientRect().top + window.scrollY });
      });

      markers.sort((a, b) => a.top - b.top);

      let current = '';
      markers.forEach((marker) => {
        if (marker.top <= probe) current = marker.id;
      });

      setActive(current);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return active;
}

export default useActiveSection;