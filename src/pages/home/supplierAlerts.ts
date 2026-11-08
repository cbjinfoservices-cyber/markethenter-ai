import { useEffect, useState } from 'react';
import { loadScenarios, num, thresholdFor } from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';
import {
  HISTORY_MONTHS,
  SECOND_SUFFIX,
  buildDefaultHistory,
  loadSupplierNames,
  readStoredHistoryOnly,
} from '@/pages/home/priceHistory';
import { supplierNameOf } from '@/pages/home/supplierCompare';

/** Fired by the calculator whenever a saved curve or a cost changes. */
export const ALERTS_EVENT = 'mh:calc:alerts';

export type SupplierAlert = {
  key: string;
  scenarioName: string;
  supplierName: string;
  monthsOver: number;
  breakEven: number;
};

type Translate = (key: string) => string;

/** Months where the purchase price is above break-even: the sale loses money. */
export function countMonthsOver(series: number[], breakEven: number): number {
  if (!(breakEven > 0)) return 0;
  return series.filter((price) => price > breakEven + 0.005).length;
}

export function buildSupplierAlerts(
  scenarios: Scenario[],
  histories: Record<string, number[]>,
  names: Record<string, string>,
  t: Translate,
): SupplierAlert[] {
  const out: SupplierAlert[] = [];

  scenarios.forEach((scenario, index) => {
    const key = `s${scenario.id}`;
    const breakEven = thresholdFor(scenario.values, 0).breakEvenPrice;
    if (!Number.isFinite(breakEven) || breakEven <= 0) return;

    const scenarioName =
      scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
    const storedA = histories[key];
    const seriesA =
      storedA && storedA.length === HISTORY_MONTHS
        ? storedA
        : buildDefaultHistory(key, num(scenario.values.supplier));
    const overA = countMonthsOver(seriesA, breakEven);
    if (overA > 0) {
      out.push({
        key,
        scenarioName,
        supplierName: supplierNameOf(names, key, t('home.calc.historySupplierA')),
        monthsOver: overA,
        breakEven,
      });
    }

    const storedB = histories[`${key}${SECOND_SUFFIX}`];
    if (!storedB || storedB.length !== HISTORY_MONTHS) return;
    const overB = countMonthsOver(storedB, breakEven);
    if (overB > 0) {
      out.push({
        key: `${key}${SECOND_SUFFIX}`,
        scenarioName,
        supplierName: supplierNameOf(
          names,
          `${key}${SECOND_SUFFIX}`,
          t('home.calc.historySupplierB'),
        ),
        monthsOver: overB,
        breakEven,
      });
    }
  });

  return out;
}

type AlertRow = {
  scenario: Scenario;
  threshold: { feasible: boolean; breakEvenPrice: number };
  seriesA: number[];
  comparableB: number[] | null;
};

/** Same alerts, computed from the dashboard's already-loaded rows. */
export function buildAlertsFromRows(
  rows: AlertRow[],
  names: Record<string, string>,
  t: Translate,
): SupplierAlert[] {
  const out: SupplierAlert[] = [];

  rows.forEach((row, index) => {
    const key = `s${row.scenario.id}`;
    const breakEven = row.threshold.feasible ? row.threshold.breakEvenPrice : 0;
    if (!(breakEven > 0)) return;
    const scenarioName =
      row.scenario.name.trim() ||
      `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;

    const overA = countMonthsOver(row.seriesA, breakEven);
    if (overA > 0) {
      out.push({
        key,
        scenarioName,
        supplierName: supplierNameOf(names, key, t('home.calc.historySupplierA')),
        monthsOver: overA,
        breakEven,
      });
    }

    if (!row.comparableB) return;
    const overB = countMonthsOver(row.comparableB, breakEven);
    if (overB > 0) {
      out.push({
        key: `${key}${SECOND_SUFFIX}`,
        scenarioName,
        supplierName: supplierNameOf(
          names,
          `${key}${SECOND_SUFFIX}`,
          t('home.calc.historySupplierB'),
        ),
        monthsOver: overB,
        breakEven,
      });
    }
  });

  return out;
}

/** Reads what this browser already knows, so the header can warn on any page. */
export function readStoredAlerts(t: Translate): SupplierAlert[] {
  const scenarios = loadScenarios();
  if (scenarios.length === 0) return [];

  const histories: Record<string, number[]> = {};
  scenarios.forEach((scenario) => {
    const key = `s${scenario.id}`;
    const storedA = readStoredHistoryOnly(key);
    if (storedA) histories[key] = storedA;
    const storedB = readStoredHistoryOnly(`${key}${SECOND_SUFFIX}`);
    if (storedB) histories[`${key}${SECOND_SUFFIX}`] = storedB;
  });

  return buildSupplierAlerts(scenarios, histories, loadSupplierNames(), t);
}

export function notifyAlerts(): void {
  try {
    window.dispatchEvent(new Event(ALERTS_EVENT));
  } catch {
    /* no listener — nothing to refresh */
  }
}

/**
 * Live list of suppliers priced above break-even. The calculator pings the
 * event, so the header reacts as soon as a number changes.
 */
export function useSupplierAlerts(t: Translate): SupplierAlert[] {
  const [alerts, setAlerts] = useState<SupplierAlert[]>(() => readStoredAlerts(t));

  useEffect(() => {
    const sync = () => setAlerts(readStoredAlerts(t));
    window.addEventListener(ALERTS_EVENT, sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener(ALERTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [t]);

  return alerts;
}