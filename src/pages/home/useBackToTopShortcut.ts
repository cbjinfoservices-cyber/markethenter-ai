import { useEffect } from 'react';

/** Key that sends the reader back to the top of the page. */
export const BACK_TO_TOP_KEY = 't';

export function isTypingTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

/** Smooth (or instant, when motion is reduced) jump to the very top. */
export function scrollPageToTop(): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

/**
 * Pressing "T" jumps back to the top, unless the reader is typing in a field,
 * a dialog captured the key, a modifier is held, or an IME is composing.
 */
export function handleBackToTopKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (typeof event.key !== 'string' || event.key.toLowerCase() !== BACK_TO_TOP_KEY) return;
  if (isTypingTarget(document.activeElement as HTMLElement | null)) return;
  event.preventDefault();
  scrollPageToTop();
}

/** Site-wide shortcut built on handleBackToTopKey. */
export function useBackToTopShortcut(): void {
  useEffect(() => {
    window.addEventListener('keydown', handleBackToTopKey);
    return () => window.removeEventListener('keydown', handleBackToTopKey);
  }, []);
}

export default useBackToTopShortcut;