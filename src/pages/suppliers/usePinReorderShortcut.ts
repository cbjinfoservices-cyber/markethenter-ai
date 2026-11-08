import { useEffect, useRef } from 'react';

/** Alt + Maj + flèche : la vue épinglée affichée à l'écran monte ou descend
 *  d'un cran parmi les épinglées. C'est la même chose que les petites
 *  flèches de la pastille, mais sans la souris. Alt + flèche seule garde son
 *  rôle : rappeler la vue précédente ou suivante. */
export function usePinReorderShortcut(onMove: (direction: -1 | 1) => void) {
  const handler = useRef(onMove);
  handler.current = onMove;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) return;
      if (event.ctrlKey || event.metaKey) return;
      const isArrow = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
      if (!isArrow) return;
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      event.preventDefault();
      handler.current(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}