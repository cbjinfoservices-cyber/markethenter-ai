import { useEffect, useRef } from 'react';

/** Alt + H ou la touche « ? » : le récapitulatif des raccourcis du carnet
 *  s'ouvre et se referme au clavier. Échap le referme aussi. Les champs de
 *  saisie gardent leurs touches, la frappe n'y est pas interceptée. */
export function useHelpShortcut(onToggle: () => void, onClose: () => void) {
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      /* Alt + H, lu sur le code de la touche : Alt transforme la lettre. */
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (event.code === 'KeyH') {
          event.preventDefault();
          toggleRef.current();
        }
        return;
      }
      /* « ? » sans modificateur : le raccourci d'aide habituel. */
      if (event.key === '?' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}