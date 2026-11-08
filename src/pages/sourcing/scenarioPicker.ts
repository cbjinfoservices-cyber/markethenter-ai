import { fetchWorkspace } from '@/pages/home/cloudStore';
import { loadScenarios } from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';

export type ScenarioSource = 'cloud' | 'local';

/** A dashboard scenario the reader can put side by side with a sourced product. */
export type ScenarioPick = { scenario: Scenario; where: ScenarioSource };

const fromBrowser = (): ScenarioPick[] =>
  loadScenarios().map((scenario) => ({ scenario, where: 'local' }));

/**
 * The scenarios that already live in the dashboard: the signed-in account
 * first, this browser as the same fallback the dashboard uses. Never throws.
 */
export async function readScenarios(userId: string | null): Promise<ScenarioPick[]> {
  if (!userId) return fromBrowser();
  try {
    const remote = await fetchWorkspace(userId);
    if (remote.scenarios.length > 0) {
      return remote.scenarios.map((scenario) => ({ scenario, where: 'cloud' }));
    }
    return fromBrowser();
  } catch {
    return fromBrowser();
  }
}

/** A scenario name that is never empty, so the picker stays readable. */
export function scenarioLabel(scenario: Scenario, index: number, fallback: string): string {
  const name = scenario.name.replace(/\s+/g, ' ').trim();
  if (name !== '') return name;
  return `${fallback} ${String.fromCharCode(65 + (index % 26))}`;
}