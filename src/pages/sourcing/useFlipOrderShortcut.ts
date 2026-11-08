import { useEffect } from 'react';

type Options = {
  /** Nothing to flip (one row or none) means the shortcut does nothing. */
  enabled: boolean;
  onTrigger: () => void;
};

/**
 * Shift + I reverses the whole grid order — the same gesture as the "Inverser
 * l'ordre" button, without reaching for the mouse. It follows the sorting, it
 * does not change it, and typing in a field is never hijacked.
 */
export default function useFlipOrderShortcut({ enabled, onTrigger }: Options): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'I' && event.key !== 'i') return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      onTrigger();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, onTrigger]);
}