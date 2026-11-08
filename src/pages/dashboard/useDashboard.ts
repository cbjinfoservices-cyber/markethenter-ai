import { useCallback, useEffect, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { fetchWorkspace } from '@/pages/home/cloudStore';
import {
  compute,
  loadInputs,
  loadScenarios,
  loadTarget,
  num,
  thresholdFor,
} from '@/pages/home/calcModel';
import type { Metrics, Scenario, Threshold, Values } from '@/pages/home/calcModel';
import {
  HISTORY_MONTHS,
  SECOND_SUFFIX,
  SUPPLIER_NAMES_EVENT,
  buildDefaultHistory,
  loadSupplierNames,
  readStoredHistoryOnly,
  secondKey,
} from '@/pages/home/priceHistory';
import { compareQuotes } from '@/pages/home/supplierCompare';
import type { QuoteComparison } from '@/pages/home/supplierCompare';
import {
  equivalentSeries,
  loadQuoteCosts,
  secondQuoteValues,
} from '@/pages/home/quoteCosts';
import type { QuoteCosts } from '@/pages/home/quoteCosts';

export type DashboardRow = {
  scenario: Scenario;
  metrics: Metrics;
  threshold: Threshold;
  seriesA: number[];
  seriesB: number[] | null;
  /** Scenario values with the second quote's own transport, packaging and customs. */
  secondValues: Values;
  /** Second quote expressed as first-quote purchase prices, for comparisons. */
  comparableB: number[] | null;
  comparison: QuoteComparison | null;
};

export type DashboardSource = 'cloud' | 'local';

type Snapshot = {
  loading: boolean;
  error: boolean;
  rows: DashboardRow[];
  draft: { values: Values; metrics: Metrics; threshold: Threshold } | null;
  supplierNames: Record<string, string>;
  source: DashboardSource;
};

const EMPTY: Snapshot = {
  loading: true,
  error: false,
  rows: [],
  draft: null,
  supplierNames: {},
  source: 'local',
};

/** Curves saved in this browser, without inventing a second quote. */
function localHistories(scenarios: Scenario[]): Record<string, number[]> {
  const histories: Record<string, number[]> = {};
  scenarios.forEach((scenario) => {
    const key = `s${scenario.id}`;
    const stored = readStoredHistoryOnly(key);
    if (stored) histories[key] = stored;
    const storedB = readStoredHistoryOnly(secondKey(key));
    if (storedB) histories[`${key}${SECOND_SUFFIX}`] = storedB;
  });
  return histories;
}

function buildRows(
  scenarios: Scenario[],
  histories: Record<string, number[]>,
  target: number,
  costs: Record<string, QuoteCosts>,
): DashboardRow[] {
  return scenarios.map((scenario) => {
    const key = `s${scenario.id}`;
    const stored = histories[key];
    const seriesA =
      stored && stored.length === HISTORY_MONTHS
        ? stored
        : buildDefaultHistory(key, num(scenario.values.supplier));
    const storedB = histories[`${key}${SECOND_SUFFIX}`];
    const seriesB = storedB && storedB.length === HISTORY_MONTHS ? storedB : null;
    const secondValues = secondQuoteValues(
      scenario.values,
      costs[`${key}${SECOND_SUFFIX}`],
      seriesB ? seriesB[seriesB.length - 1] : null,
    );
    return {
      scenario,
      metrics: compute(scenario.values),
      threshold: thresholdFor(scenario.values, target),
      seriesA,
      seriesB,
      secondValues,
      comparableB: seriesB ? equivalentSeries(seriesB, scenario.values, secondValues) : null,
      comparison:
        seriesB ? compareQuotes(seriesA, equivalentSeries(seriesB, scenario.values, secondValues)) : null,
    };
  });
}

/**
 * Loads the seller workspace for the dashboard: the signed-in account first,
 * this browser as a fallback. Never throws — the page shows a retry instead.
 */
export default function useDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [epoch, setEpoch] = useState(0);

  const reload = useCallback(() => setEpoch((prev) => prev + 1), []);

  /* Un nom vient d'être saisi sur une fiche (au clavier, ou par le fichier
     revenu d'Excel) : les cartes le reprennent sans recharger la page. */
  useEffect(() => {
    const sync = () => {
      const local = loadSupplierNames();
      setSnapshot((prev) => ({
        ...prev,
        supplierNames: { ...prev.supplierNames, ...local },
      }));
    };
    window.addEventListener(SUPPLIER_NAMES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SUPPLIER_NAMES_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    setSnapshot((prev) => ({ ...prev, loading: true, error: false }));

    const run = async () => {
      try {
        let scenarios: Scenario[] = [];
        let histories: Record<string, number[]> = {};
        let supplierNames = loadSupplierNames();
        let source: DashboardSource = 'local';

        if (user) {
          const remote = await fetchWorkspace(user.id);
          if (remote.scenarios.length > 0) {
            scenarios = remote.scenarios;
            histories = remote.histories;
            supplierNames = { ...supplierNames, ...remote.supplierNames };
            source = 'cloud';
          }
        }

        if (scenarios.length === 0) {
          scenarios = loadScenarios();
          histories = localHistories(scenarios);
          source = 'local';
        }

        if (cancelled) return;
        const targetRaw = loadTarget();
        const target = num(targetRaw);
        /* Only a really saved draft is previewed: the demo numbers are never
           passed off as the seller's own last input. */
        const storedDraft = loadInputs();
        setSnapshot({
          loading: false,
          error: false,
          rows: buildRows(scenarios, histories, target, loadQuoteCosts()),
          draft: storedDraft
            ? {
                values: storedDraft,
                metrics: compute(storedDraft),
                threshold: thresholdFor(storedDraft, target),
              }
            : null,
          supplierNames,
          source,
        });
      } catch {
        if (!cancelled) {
          setSnapshot((prev) => ({ ...prev, loading: false, error: true }));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, epoch]);

  return {
    ...snapshot,
    signedIn: Boolean(user),
    email: user?.email ?? '',
    reload,
  };
}