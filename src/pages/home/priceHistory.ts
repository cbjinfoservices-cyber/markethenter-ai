export const HISTORY_MONTHS = 12;

const HISTORY_PREFIX = 'mh:calc:history:';

function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100000;
}

function wave(seed: number, index: number): number {
  const x = Math.sin(seed * 0.0007 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A plausible 12-month supplier price history ending on the current supplier
 * price. Deterministic per storage key, so a scenario always opens on the
 * same curve until the seller adjusts it.
 */
export function buildDefaultHistory(key: string, base: number): number[] {
  const seed = seedOf(key);
  const out: number[] = [];
  for (let i = 0; i < HISTORY_MONTHS; i += 1) {
    const t = i / (HISTORY_MONTHS - 1);
    const trend = 1 + 0.055 * (t - 1);
    const wobble = 0.026 * Math.sin(t * Math.PI * 2 + (seed % 7));
    const noise = (wave(seed, i) - 0.5) * 0.05;
    const value = base * (trend + wobble + noise);
    out.push(Math.round(Math.max(0.01, value) * 100) / 100);
  }
  return out;
}

function historyKey(key: string): string {
  return `${HISTORY_PREFIX}${key}`;
}

/** Storage suffix for the second supplier curve of the same scenario. */
export const SECOND_SUFFIX = ':b';

export function secondKey(key: string): string {
  return `${key}${SECOND_SUFFIX}`;
}

/**
 * Default curve for the second supplier: same 12-month horizon, slightly
 * cheaper average and a different seasonal shape, so the two bar series
 * read as two real quotes instead of one duplicated line.
 */
export function buildDefaultSecondHistory(key: string, base: number): number[] {
  const seed = seedOf(`${key}:second`);
  const out: number[] = [];
  for (let i = 0; i < HISTORY_MONTHS; i += 1) {
    const t = i / (HISTORY_MONTHS - 1);
    const trend = 1 + 0.038 * (t - 1);
    const wobble = 0.038 * Math.cos(t * Math.PI * 2 + (seed % 5));
    const noise = (wave(seed, i + 3) - 0.5) * 0.04;
    const value = base * 0.94 * (trend + wobble + noise);
    out.push(Math.round(Math.max(0.01, value) * 100) / 100);
  }
  return out;
}

/** Reads a stored curve only — never generates a default one. */
export function readStoredHistoryOnly(key: string): number[] | null {
  try {
    const stored = window.localStorage.getItem(historyKey(key));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length !== HISTORY_MONTHS) return null;
    const out: number[] = [];
    for (const item of parsed) {
      const value = Number(item);
      if (!Number.isFinite(value) || value < 0) return null;
      out.push(value);
    }
    return out;
  } catch {
    return null;
  }
}

export function loadHistory(key: string, base: number): number[] {
  return readStoredHistory(key, base, buildDefaultHistory);
}

/** Same as loadHistory, but seeded with the second supplier's default curve. */
export function loadSecondHistory(key: string, base: number): number[] {
  return readStoredHistory(key, base, buildDefaultSecondHistory);
}

function readStoredHistory(
  key: string,
  base: number,
  fallbackOf: (storageKey: string, basePrice: number) => number[],
): number[] {
  const fallback = fallbackOf(key, base);
  try {
    const stored = window.localStorage.getItem(historyKey(key));
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length !== HISTORY_MONTHS) return fallback;
    const out: number[] = [];
    for (const item of parsed) {
      const value = Number(item);
      if (!Number.isFinite(value) || value < 0) return fallback;
      out.push(value);
    }
    return out;
  } catch {
    return fallback;
  }
}

export function persistHistory(key: string, series: number[]): void {
  try {
    window.localStorage.setItem(historyKey(key), JSON.stringify(series));
  } catch {
    /* storage blocked — history stays for this session only */
  }
}

const NAMES_KEY = 'mh:calc:supplier-names';

/**
 * Real supplier names typed by the seller ("Shenzhen A", "Ningbo B"…),
 * keyed by scenario storage key so each comparison keeps its own names.
 */
export function loadSupplierNames(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(NAMES_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') out[key] = value.slice(0, 28);
    });
    return out;
  } catch {
    return {};
  }
}

/** Un nom vient d'être enregistré : les compteurs « à baptiser » se remettent à jour. */
export const SUPPLIER_NAMES_EVENT = 'mh:calc:supplier-names';

export function persistSupplierNames(names: Record<string, string>): void {
  try {
    window.localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    window.dispatchEvent(new Event(SUPPLIER_NAMES_EVENT));
  } catch {
    /* storage blocked — names stay for this session only */
  }
}

const EMAILS_KEY = 'mh:calc:supplier-emails';

/** A typed address, kept short and readable, or an empty string. */
export function cleanEmail(value: string): string {
  return value.replace(/\s+/g, '').slice(0, 80).toLowerCase();
}

/**
 * Supplier e-mail addresses typed by the seller, keyed by the same scenario
 * key as the names, so the ready-to-send message finds its recipient.
 */
export function loadSupplierEmails(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(EMAILS_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const email = cleanEmail(value);
        if (email !== '') out[key] = email;
      }
    });
    return out;
  } catch {
    return {};
  }
}

/** Une adresse vient d'être enregistrée : les compteurs se remettent à jour. */
export const SUPPLIER_EMAILS_EVENT = 'mh:calc:supplier-emails';

export function persistSupplierEmails(emails: Record<string, string>): void {
  try {
    window.localStorage.setItem(EMAILS_KEY, JSON.stringify(emails));
    window.dispatchEvent(new Event(SUPPLIER_EMAILS_EVENT));
  } catch {
    /* storage blocked — addresses stay for this session only */
  }
}

/** The address stored for one supplier key, or an empty string. */
export function supplierEmailOf(emails: Record<string, string>, key: string): string {
  return cleanEmail(emails[key] ?? '');
}

export function monthLabels(
  locale: string,
  count = HISTORY_MONTHS,
): { short: string; long: string }[] {
  const shortFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const longFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const now = new Date();
  const out: { short: string; long: string }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      short: shortFmt.format(date).replace('.', ''),
      long: longFmt.format(date),
    });
  }
  return out;
}