import { useEffect } from 'react';

type Options = {
  /** Nothing to clear means the shortcut does nothing. */
  enabled: boolean;
  onTrigger: () => void;
};

/**
 * Shift + F drops the category, the verdict and the margin floor but leaves the
 * sorting untouched — the same gesture as the "Retirer les filtres" button,
 * without reaching for the mouse. Typing in a field is never hijacked.
 */
export default function useClearFiltersShortcut({ enabled, onTrigger }: Options): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'F' && event.key !== 'f') return;

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