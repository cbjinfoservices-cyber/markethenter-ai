import { useCallback, useEffect, useState } from 'react';
import {
  persistMemoryEnabled,
  readMemoryEnabled,
  subscribeMemoryEnabled,
} from '@/pages/home/fieldMemory';

/**
 * Reads and writes the "keep the field memory" switch. Shared state, so the
 * calculator's setting and the reminder in the page bar can never disagree.
 */
export function useMemoryEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => readMemoryEnabled());

  useEffect(() => subscribeMemoryEnabled(setEnabled), []);

  const update = useCallback((next: boolean) => {
    setEnabled(next);
    persistMemoryEnabled(next);
  }, []);

  return [enabled, update];
}

export default useMemoryEnabled;