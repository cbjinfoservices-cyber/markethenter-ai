import { fetchWorkspace, saveWorkspace } from '@/pages/home/cloudStore';
import {
  INITIAL,
  loadInputs,
  loadScenarios,
  loadTarget,
  persistScenarios,
} from '@/pages/home/calcModel';
import type { Scenario, Values } from '@/pages/home/calcModel';

/** The calculator and the dashboard both live with three scenarios. */
export const MAX_SCENARIOS = 3;
const SAVED_KEY = 'mh:sourcing:saved';

export type SavedEntry = { id: number; name: string; where: 'cloud' | 'local' };
export type SavedMap = Record<string, SavedEntry>;

/** Which sourced product already lives in the dashboard, and where. */
export function readSaved(): SavedMap {
  try {
    const stored = window.localStorage.getItem(SAVED_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SavedMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const entry = value as { id?: unknown; name?: unknown; where?: unknown };
      if (!entry || typeof entry.name !== 'string') return;
      const id = Number(entry.id);
      if (!Number.isFinite(id) || id <= 0) return;
      out[key] = {
        id,
        name: entry.name,
        where: entry.where === 'cloud' ? 'cloud' : 'local',
      };
    });
    return out;
  } catch {
    return {};
  }
}

/** Remembers the save and hands back the fresh map, ready for the page state. */
export function rememberSaved(productId: string, entry: SavedEntry): SavedMap {
  const next = { ...readSaved(), [productId]: entry };
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the card simply forgets on reload */
  }
  return next;
}

/** A marketplace title squeezed into a scenario name. */
export function scenarioNameFor(name: string, fallback: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  const base = clean === '' ? fallback : clean;
  if (base.length <= 40) return base;
  return `${base.slice(0, 39).trimEnd()}…`;
}

const sameName = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** Names of the scenarios that really exist right now, cloud or local. */
export async function readScenarioNames(userId: string | null): Promise<string[] | null> {
  try {
    if (userId) {
      const remote = await fetchWorkspace(userId);
      return remote.scenarios.map((scenario) => scenario.name);
    }
    return loadScenarios().map((scenario) => scenario.name);
  } catch {
    return null;
  }
}

/** Drops saved badges whose scenario was deleted since — never a lying card. */
export function pruneSaved(names: string[]): SavedMap {
  const current = readSaved();
  const next: SavedMap = {};
  let changed = false;
  Object.entries(current).forEach(([key, entry]) => {
    if (names.some((name) => sameName(name, entry.name))) next[key] = entry;
    else changed = true;
  });
  if (changed) {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked — the badge stays for this session */
    }
  }
  return changed ? next : current;
}

type Merge = { list: Scenario[]; updated: boolean; id: number };

/** Adds the product, or refreshes the scenario that already carries its name. */
function merge(scenarios: Scenario[], name: string, values: Values): Merge | null {
  const index = scenarios.findIndex((scenario) => sameName(scenario.name, name));
  if (index >= 0) {
    const list = scenarios.map((scenario, i) =>
      i === index ? { ...scenario, values } : scenario,
    );
    return { list, updated: true, id: scenarios[index].id };
  }
  if (scenarios.length >= MAX_SCENARIOS) return null;
  const used = new Set(scenarios.map((scenario) => scenario.id));
  let id = MAX_SCENARIOS;
  for (let i = 1; i <= MAX_SCENARIOS; i += 1) {
    if (!used.has(i)) {
      id = i;
      break;
    }
  }
  return { list: [...scenarios, { id, name, values }], updated: false, id };
}

export type SaveOutcome =
  | { ok: true; id: number; name: string; where: 'cloud' | 'local'; updated: boolean }
  | { ok: false; reason: 'full' | 'error' };

/**
 * Writes one sourced product into the seller's scenarios: the cloud workspace
 * when signed in, this browser otherwise — exactly the two sources the
 * dashboard reads. Never throws.
 */
export async function saveSourcedScenario(
  name: string,
  values: Values,
  userId: string | null,
): Promise<SaveOutcome> {
  if (userId) {
    try {
      const remote = await fetchWorkspace(userId);
      const merged = merge(remote.scenarios, name, values);
      if (!merged) return { ok: false, reason: 'full' };
      await saveWorkspace(
        userId,
        remote.inputs ?? loadInputs() ?? INITIAL,
        remote.target ?? loadTarget(),
        merged.list,
        remote.histories,
        remote.supplierNames,
      );
      return { ok: true, id: merged.id, name, where: 'cloud', updated: merged.updated };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  const merged = merge(loadScenarios(), name, values);
  if (!merged) return { ok: false, reason: 'full' };
  persistScenarios(merged.list);
  return { ok: true, id: merged.id, name, where: 'local', updated: merged.updated };
}