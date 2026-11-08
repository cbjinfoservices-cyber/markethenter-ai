import { useEffect, useRef } from 'react';

/** Alt + N : une nouvelle fiche fournisseur s'ouvre sans lâcher le clavier.
 *  La touche se lit sur le code du clavier, donc elle marche aussi quand Alt
 *  transforme la lettre en caractère. Les champs de saisie gardent la frappe. */
export function useNewSupplierShortcut(onOpen: () => void) {
  const handler = useRef(onOpen);
  handler.current = onOpen;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.code !== 'KeyN') return;
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