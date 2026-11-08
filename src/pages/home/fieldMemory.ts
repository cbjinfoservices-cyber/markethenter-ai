import type { FieldKey } from '@/pages/home/calcModel';

/** How many committed values a single field keeps. */
export const FIELD_MEMORY_MAX = 5;
export const FIELD_MEMORY_KEY = 'mh:calc:fieldmem';
/* Some sessions must leave no trace at all: the switch is stored on the device,
   like the values themselves, and off means nothing is ever written. */
export const FIELD_MEMORY_ON_KEY = 'mh:calc:fieldmem:on';

export function readMemoryEnabled(): boolean {
  try {
    return window.localStorage.getItem(FIELD_MEMORY_ON_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** The switch is shared by the tool and the page bar, so both always agree. */
type MemoryListener = (enabled: boolean) => void;
const memoryListeners = new Set<MemoryListener>();

export function subscribeMemoryEnabled(listener: MemoryListener): () => void {
  memoryListeners.add(listener);
  return () => {
    memoryListeners.delete(listener);
  };
}

export function persistMemoryEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(FIELD_MEMORY_ON_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage blocked — the switch lasts for this visit */
  }
  memoryListeners.forEach((listener) => listener(enabled));
}

/** Removes whatever was already kept, so turning the switch off really erases
    the trace instead of just hiding it. */
export function wipeFieldMemory(): void {
  try {
    window.localStorage.removeItem(FIELD_MEMORY_KEY);
  } catch {
    /* storage blocked — nothing was stored anyway */
  }
}

/** Newest first, per field. Duplicates are kept on purpose: seeing 12 → 15 → 12
    is exactly how a round trip (an "aller-retour") becomes visible. */
export type FieldMemory = Partial<Record<FieldKey, string[]>>;

export function loadFieldMemory(): FieldMemory {
  try {
    const stored = window.localStorage.getItem(FIELD_MEMORY_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: FieldMemory = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      const list = value
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .slice(0, FIELD_MEMORY_MAX);
      if (list.length > 0) out[key as FieldKey] = list;
    });
    return out;
  } catch {
    return {};
  }
}

export function persistFieldMemory(memory: FieldMemory): void {
  try {
    window.localStorage.setItem(FIELD_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked — the list stays for this visit only */
  }
}

/** Records a committed value (on blur), skipping a repeat of the latest one so
    pressing the same number twice does not fill the list. */
export function rememberValue(
  memory: FieldMemory,
  key: FieldKey,
  value: string,
): FieldMemory {
  const clean = value.trim();
  if (clean === '') return memory;
  const list = memory[key] ?? [];
  if (list[0] === clean) return memory;
  return { ...memory, [key]: [clean, ...list].slice(0, FIELD_MEMORY_MAX) };
}

/** True when the value just committed had already been used earlier: the
    reader went back and forth on this field. */
export function isRoundTrip(list: string[]): boolean {
  return list.length > 1 && list.slice(1).includes(list[0]);
}