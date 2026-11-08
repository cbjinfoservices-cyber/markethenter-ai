const SPOTS_KEY = 'mh.nav.readingSpots';
const LEGACY_KEY = 'mh.nav.readingSpot';
const MAX_SPOTS = 6;

export type ReadingSpot = {
  /** Section the reader was in when they stopped. */
  id: string;
  /** Raw scroll position, so the resume lands exactly on the same line. */
  y: number;
  /** When it was last read, so the list can stay most-recent-first. */
  at: number;
};

type Store = Record<string, { y: number; at: number }>;

function parseStore(raw: string | null): Store {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Store = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([id, value]) => {
      if (!id || !value || typeof value !== 'object') return;
      const entry = value as { y?: unknown; at?: unknown };
      const y = Number(entry.y);
      const at = Number(entry.at);
      if (!Number.isFinite(y) || y < 0) return;
      out[id] = { y: Math.round(y), at: Number.isFinite(at) ? at : 0 };
    });
    return out;
  } catch {
    return {};
  }
}

/** One store per browser: every section keeps its own stopping line. */
function readStore(): Store {
  try {
    const store = parseStore(window.localStorage.getItem(SPOTS_KEY));
    if (Object.keys(store).length > 0) return store;

    /* Older builds kept a single spot — it becomes the first entry. */
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (!legacy) return store;
    const parsed: unknown = JSON.parse(legacy);
    if (!parsed || typeof parsed !== 'object') return store;
    const source = parsed as { id?: unknown; y?: unknown };
    if (typeof source.id !== 'string' || source.id === '') return store;
    const y = Number(source.y);
    if (!Number.isFinite(y) || y < 0) return store;
    return { [source.id]: { y: Math.round(y), at: Date.now() } };
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    window.localStorage.setItem(SPOTS_KEY, JSON.stringify(store));
  } catch {
    /* storage blocked — resume falls back to the section heading */
  }
}

/** Remembers the exact scroll line inside the section being read. */
export function saveReadingSpot(id: string, y: number): void {
  if (!id || !Number.isFinite(y)) return;
  const store = readStore();
  const rounded = Math.round(y);
  const known = store[id];
  if (known && known.y === rounded && Date.now() - known.at < 20000) return;
  store[id] = { y: rounded, at: Date.now() };

  /* Keep the list short: the oldest stops are dropped first. */
  const ids = Object.keys(store);
  if (ids.length > MAX_SPOTS) {
    ids
      .sort((a, b) => store[a].at - store[b].at)
      .slice(0, ids.length - MAX_SPOTS)
      .forEach((oldId) => delete store[oldId]);
  }
  writeStore(store);
}

/** Every remembered section, most recently read first. */
export function readReadingSpots(): ReadingSpot[] {
  const store = readStore();
  return Object.keys(store)
    .map((id) => ({ id, y: store[id].y, at: store[id].at }))
    .sort((a, b) => b.at - a.at);
}

/** The last section read — kept for callers that only need one stop. */
export function readReadingSpot(): ReadingSpot | null {
  const spots = readReadingSpots();
  return spots.length > 0 ? spots[0] : null;
}

/** Puts the reader back exactly where they stopped in that section. */
export function resumeReading(id: string): void {
  const spot = readReadingSpots().find((entry) => entry.id === id) ?? null;
  const element = document.getElementById(id);
  const headingTop = element ? element.getBoundingClientRect().top + window.scrollY : 0;
  const nav = document.querySelector<HTMLElement>('.nav');
  const offset = (nav?.offsetHeight ?? 64) + 12;

  /* A remembered line wins over the section heading: same pixels, same view. */
  const top = spot ? spot.y : Math.max(0, headingTop - offset);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}

export { SPOTS_KEY, LEGACY_KEY };