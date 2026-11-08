import { compute, loadInputs, loadTarget } from '@/pages/home/calcModel';
import type { Values } from '@/pages/home/calcModel';
import { verdictLevelOf } from '@/pages/home/calcVerdict';
import { readGoodFloor } from '@/pages/home/useGoodMargin';
import { clearFixing, readFixing, rememberFixed } from '@/pages/home/scenarioFix';

const HANDOFF_KEY = 'mh.calc.handoff';

/**
 * Leaving the tool after loading a red scenario: if the numbers left on screen
 * are green now, the dashboard may say it was corrected. Read once, then
 * forgotten so the badge never lingers.
 */
function settleFixedScenario(): void {
  const fixing = readFixing();
  if (!fixing) return;
  const values = loadInputs();
  if (values) {
    const metrics = compute(values);
    if (verdictLevelOf(metrics.net, metrics.netMargin, readGoodFloor()) === 'good') {
      rememberFixed(fixing.id);
    }
  }
  clearFixing();
}

export type CalcHandoff = {
  values: Values;
  target: string;
  at: number;
};

/** Called when the reader leaves the calculator for the dashboard. */
export function markCalculatorHandoff(): void {
  settleFixedScenario();
  try {
    const values = loadInputs();
    if (!values) return;
    const payload: CalcHandoff = { values, target: loadTarget(), at: Date.now() };
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* storage blocked — the dashboard simply skips the preview */
  }
}

export function readCalculatorHandoff(): CalcHandoff | null {
  try {
    const stored = window.sessionStorage.getItem(HANDOFF_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as { values?: unknown; target?: unknown; at?: unknown };
    if (!source.values || typeof source.values !== 'object') return null;
    const raw = source.values as Record<string, unknown>;
    if (typeof raw.price !== 'string' || typeof raw.supplier !== 'string') return null;
    const at = Number(source.at);
    return {
      values: raw as Values,
      target: typeof source.target === 'string' && source.target.trim() !== '' ? source.target : '5',
      at: Number.isFinite(at) ? at : 0,
    };
  } catch {
    return null;
  }
}

export function clearCalculatorHandoff(): void {
  try {
    window.sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* nothing to clear */
  }
}

export { HANDOFF_KEY };