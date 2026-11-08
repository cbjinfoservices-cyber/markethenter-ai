import { useEffect, useRef } from 'react';

/** Alt + flèche droite / gauche : la vue gardée suivante ou précédente,
 *  rappelée sans lâcher le clavier. Alt + un chiffre de 1 à 8 repose
 *  directement la pastille de ce rang, sans traverser les autres.
 *  Les champs de saisie gardent leurs propres raccourcis, la touche n'y est
 *  donc pas interceptée. */
export function useViewCycleShortcut(
  onStep: (direction: -1 | 1) => void,
  onPick?: (seat: number) => void,
) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const isArrow = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
      const isDigit = /^[1-8]$/.test(event.key);
      if (!isArrow && !isDigit) return;
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      event.preventDefault();
      if (isArrow) {
        stepRef.current(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (pickRef.current) pickRef.current(Number(event.key) - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}