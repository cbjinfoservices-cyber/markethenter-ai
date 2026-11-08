/** The two comparison columns — sourced products and/or a dashboard scenario — survive the visit. */
const KEY = 'mh:sourcing:compare';

/** Les colonnes du comparatif changent : le menu se remet à jour. */
export const COMPARE_MEMORY_EVENT = 'mh:sourcing:compare';

export type CompareMemory = {
  /** Ids of the sourced listings sitting in the board. */
  products: string[];
  /** Dashboard scenario in the other column, if any. */
  scenarioId: number | null;
};

export const EMPTY_COMPARE: CompareMemory = { products: [], scenarioId: null };

const cleanProducts = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const id = entry.trim();
    if (id === '' || out.includes(id)) return;
    if (out.length >= 2) return;
    out.push(id);
  });
  return out;
};

const cleanScenario = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Turns anything — browser memory or a row read back from the account — into
 * a usable comparison, one valid field at a time.
 */
export function sanitizeCompare(input: unknown): CompareMemory {
  if (!input || typeof input !== 'object') return { ...EMPTY_COMPARE };
  const source = input as { products?: unknown; scenarioId?: unknown };
  return {
    products: cleanProducts(source.products),
    scenarioId: cleanScenario(source.scenarioId),
  };
}

/** Reads the remembered comparison, one valid field at a time. */
export function readCompare(): CompareMemory {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (!stored) return { ...EMPTY_COMPARE };
    return sanitizeCompare(JSON.parse(stored));
  } catch {
    return { ...EMPTY_COMPARE };
  }
}

/** True when nothing is being compared — the storage is cleared instead of kept. */
export function isCompareEmpty(memory: CompareMemory): boolean {
  return memory.products.length === 0 && memory.scenarioId === null;
}

/** Stores the two columns; an empty board clears the memory. */
export function rememberCompare(memory: CompareMemory): void {
  try {
    if (isCompareEmpty(memory)) {
      window.localStorage.removeItem(KEY);
      window.dispatchEvent(new Event(COMPARE_MEMORY_EVENT));
      return;
    }
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        products: memory.products.slice(0, 2),
        scenarioId: memory.scenarioId,
      }),
    );
    window.dispatchEvent(new Event(COMPARE_MEMORY_EVENT));
  } catch {
    /* storage blocked — the board simply opens empty next time */
  }
}