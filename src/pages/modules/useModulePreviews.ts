import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import {
  compute,
  loadInputs,
  loadTarget,
  makeFormatters,
  num,
  thresholdFor,
} from '@/pages/home/calcModel';
import { verdictLevelOf } from '@/pages/home/calcVerdict';
import { readScenarios } from '@/pages/sourcing/scenarioPicker';
import { SOURCING_PRODUCTS } from '@/mocks/sourcing';
import { rowFor, valuesFor } from '@/pages/sourcing/productMargin';
import type { SourcingProduct } from '@/pages/sourcing/productMargin';
import { MODULE_PREVIEWS } from '@/pages/modules/modulePreview';

/** A preview with its labels and figures already resolved to real text. */
export type ResolvedPreview = {
  lab: string;
  big: string;
  l1: string;
  v1: string;
  l2: string;
  v2: string;
  bar?: number;
  /** The figures come from the reader's own data, not from an example. */
  live: boolean;
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

const medianOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The figure strip of each module card. The example values only stay on the
 * modules that are not live yet: the calculator, the dashboard and the sourcing
 * board read their own numbers — the last saved costing, the scenarios of the
 * account and the catalogue actually on the board. `goodFloor` comes from the
 * header of the page, so every preview moves the moment the floor moves.
 */
export default function useModulePreviews(
  locale: string,
  goodFloor: number,
): Record<string, ResolvedPreview> {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [live, setLive] = useState<Record<string, ResolvedPreview>>({});

  const base = useMemo(() => {
    const map: Record<string, ResolvedPreview> = {};
    Object.entries(MODULE_PREVIEWS).forEach(([index, preview]) => {
      map[index] = {
        lab: t(preview.lab),
        big: t(preview.big),
        l1: t(preview.l1),
        v1: t(preview.v1),
        l2: t(preview.l2),
        v2: t(preview.v2),
        bar: preview.bar,
        live: false,
      };
    });
    return map;
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const target = num(loadTarget());
      const floor = goodFloor;
      const { eur, pct } = makeFormatters(locale);
      const next: Record<string, ResolvedPreview> = {};

      /* Sourcing board: the catalogue every listing on the board comes from. */
      const catalogue = SOURCING_PRODUCTS as SourcingProduct[];
      const rows = catalogue.map((product) => rowFor(product, target, floor));
      const best = rows.reduce<SourcingRowLike | null>(
        (top, row) => (!top || row.metrics.net > top.metrics.net ? row : top),
        null,
      );

      /* Calculator: the last saved costing, or the best listing of the board. */
      const draft = loadInputs();
      const costing = draft ?? (best ? valuesFor(best.product) : null);
      if (costing) {
        const metrics = compute(costing);
        const threshold = thresholdFor(costing, target);
        next['02'] = {
          lab: draft ? t('home.modulesPage.pv02labDraft') : t('home.modulesPage.pv02lab'),
          big: eur(metrics.net),
          l1: t('home.modulesPage.pv02l1'),
          v1: pct(metrics.netMargin),
          l2: t('home.modulesPage.pv02l2'),
          v2: threshold.feasible ? eur(threshold.minPrice) : '—',
          bar: clamp(metrics.netMargin),
          live: true,
        };
      }

      if (rows.length > 0) {
        const median = medianOf(rows.map((row) => row.metrics.netMargin));
        next['04'] = {
          lab: t('home.modulesPage.pv04labLive'),
          big: String(rows.length),
          l1: t('home.modulesPage.pv04l2'),
          v1: pct(median),
          l2: t('home.modulesPage.pv04best'),
          v2: best ? eur(best.metrics.net) : '—',
          bar: clamp(median),
          live: true,
        };
      }

      /* Dashboard: the scenarios saved for this account, browser as fallback. */
      let picks: Awaited<ReturnType<typeof readScenarios>> = [];
      try {
        picks = await readScenarios(user?.id ?? null);
      } catch {
        picks = [];
      }
      const analysed = picks.map((pick) => {
        const metrics = compute(pick.scenario.values);
        return { metrics, level: verdictLevelOf(metrics.net, metrics.netMargin, floor) };
      });
      const monthly = analysed.reduce((sum, entry) => sum + entry.metrics.monthly, 0);
      const green = analysed.filter((entry) => entry.level === 'good').length;
      const topMonthly = analysed.length > 0
        ? Math.max(...analysed.map((entry) => entry.metrics.monthly))
        : 0;

      next['03'] = {
        lab: analysed.length > 0
          ? t('home.modulesPage.pv03labLive')
          : t('home.modulesPage.pv03labEmpty'),
        big: analysed.length > 0 ? `${monthly > 0 ? '+' : ''}${eur(monthly)}` : '—',
        l1: t('home.modulesPage.pv03best'),
        v1: analysed.length > 0 ? eur(topMonthly) : '—',
        l2: t('home.modulesPage.pv03l2'),
        v2: `${green} / ${analysed.length}`,
        bar: analysed.length > 0 ? clamp((green / analysed.length) * 100) : 0,
        live: true,
      };

      if (!cancelled) setLive(next);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [locale, t, user?.id, goodFloor]);

  return useMemo(() => ({ ...base, ...live }), [base, live]);
}

type SourcingRowLike = {
  product: SourcingProduct;
  metrics: { net: number; netMargin: number };
};