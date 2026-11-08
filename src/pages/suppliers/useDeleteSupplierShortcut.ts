import { useEffect, useRef } from 'react';

/** Alt + Suppr : la fiche sélectionnée au clavier se retire, après
 *  confirmation. La touche se lit sur le code du clavier, donc le
 *  « Suppr » du Mac (Retour arrière) marche aussi. Les champs de saisie
 *  gardent leur effacement de caractère. */
export function useDeleteSupplierShortcut(onAsk: () => void) {
  const handler = useRef(onAsk);
  handler.current = onAsk;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.code !== 'Delete' && event.code !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      event.preventDefault();
      handler.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}