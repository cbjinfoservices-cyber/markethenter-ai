/**
 * Two tiny memories that make the round trip dashboard → calculator →
 * dashboard legible:
 *  - "fixing": the scenario that was just sent to the calculator, with its
 *    verdict at that moment;
 *  - "fixed": the scenarios that came back green, so the dashboard is allowed
 *    to say they were corrected.
 * Both live in sessionStorage: they describe one work session, not a fact
 * worth keeping forever.
 */
const FIXING_KEY = 'mh:calc:fixing';
const FIXED_KEY = 'mh:dash:fixed';

export type FixingScenario = {
  id: number;
  /** Verdict when the scenario left for the calculator. */
  wasBad: boolean;
};

export function markFixing(id: number, wasBad: boolean): void {
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    window.sessionStorage.setItem(FIXING_KEY, JSON.stringify({ id, wasBad }));
  } catch {
    /* storage blocked — the badge simply never appears */
  }
}

export function readFixing(): FixingScenario | null {
  try {
    const stored = window.sessionStorage.getItem(FIXING_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as { id?: unknown; wasBad?: unknown };
    const id = Number(source.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, wasBad: source.wasBad === true };
  } catch {
    return null;
  }
}

export function clearFixing(): void {
  try {
    window.sessionStorage.removeItem(FIXING_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A scenario that went from red to green on the way back. */
export function rememberFixed(id: number): void {
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    const stored = window.sessionStorage.getItem(FIXED_KEY);
    const ids: number[] = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(ids) || ids.includes(id)) return;
    window.sessionStorage.setItem(FIXED_KEY, JSON.stringify([...ids, id]));
  } catch {
    /* storage blocked — nothing to remember */
  }
}

export function readFixed(): number[] {
  try {
    const stored = window.sessionStorage.getItem(FIXED_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  } catch {
    return [];
  }
}

export function clearFixed(): void {
  try {
    window.sessionStorage.removeItem(FIXED_KEY);
  } catch {
    /* nothing to clear */
  }
}