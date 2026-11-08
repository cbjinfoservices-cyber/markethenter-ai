import { useEffect, useState } from 'react';
import { SUPPLIERS_EVENT, SUPPLIERS_STORAGE_KEY } from '@/pages/suppliers/supplierStore';

/**
 * Le nombre de fiches du carnet qui attendent une relance.
 *
 * Lu directement dans le stockage, sans passer par `loadSuppliers` : les
 * en-têtes de toutes les pages lisent ce compteur, et ils ne doivent ni
 * réensemencer le carnet ni écrire quoi que ce soit au passage.
 */
function readDueCount(): number {
  try {
    const stored = window.localStorage.getItem(SUPPLIERS_STORAGE_KEY);
    if (stored === null) return 0;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return 0;
    let count = 0;
    parsed.forEach((entry) => {
      if (entry && typeof entry === 'object' && (entry as { followUp?: unknown }).followUp === true) {
        count += 1;
      }
    });
    return count;
  } catch {
    return 0;
  }
}

/** Compteur vivant : il suit le carnet ouvert dans un autre onglet. */
export function useSupplierDueCount(): number {
  const [count, setCount] = useState<number>(() => readDueCount());

  useEffect(() => {
    const sync = () => setCount(readDueCount());
    window.addEventListener(SUPPLIERS_EVENT, sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener(SUPPLIERS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return count;
}