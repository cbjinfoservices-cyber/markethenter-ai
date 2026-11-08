import { supabase } from '@/lib/supabase';
import { FIELD_KEYS, INITIAL } from '@/pages/home/calcModel';
import type { Scenario, Values } from '@/pages/home/calcModel';
import { HISTORY_MONTHS, cleanEmail } from '@/pages/home/priceHistory';

export type CloudWorkspace = {
  inputs: Values | null;
  target: string | null;
  scenarios: Scenario[];
  histories: Record<string, number[]>;
  supplierNames: Record<string, string>;
  supplierEmails: Record<string, string>;
};

function readNames(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.slice(0, 28);
  });
  return out;
}

function readEmails(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const email = cleanEmail(value);
      if (email !== '') out[key] = email;
    }
  });
  return out;
}

function readValues(raw: unknown): Values | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const out: Values = { ...INITIAL };
  let found = false;
  FIELD_KEYS.forEach((key) => {
    const value = source[key];
    if (typeof value === 'string' && value !== '') {
      out[key] = value;
      found = true;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = String(value);
      found = true;
    }
  });
  return found ? out : null;
}

function readSeries(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const value = Number(item);
    if (!Number.isFinite(value) || value < 0) return [];
    out.push(value);
  }
  return out.length === HISTORY_MONTHS ? out : [];
}

/** Reads the signed-in seller's saved workspace. Throws on a request error. */
export async function fetchWorkspace(userId: string): Promise<CloudWorkspace> {
  const [workspaceRes, scenariosRes, historyRes] = await Promise.all([
    supabase
      .from('calc_workspace')
      .select('inputs, target_net, supplier_names, supplier_emails')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('calc_scenarios')
      .select('position, name, values')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
    supabase.from('calc_price_history').select('scenario_key, series').eq('user_id', userId),
  ]);

  if (workspaceRes.error) throw workspaceRes.error;
  if (scenariosRes.error) throw scenariosRes.error;
  if (historyRes.error) throw historyRes.error;

  const scenarios: Scenario[] = [];
  (scenariosRes.data ?? []).forEach((row) => {
    const entry = row as { position: number; name: string | null; values: unknown };
    const values = readValues(entry.values);
    if (!values) return;
    const position = Number(entry.position);
    if (!Number.isFinite(position)) return;
    scenarios.push({
      id: position,
      name: typeof entry.name === 'string' ? entry.name : '',
      values,
    });
  });

  const histories: Record<string, number[]> = {};
  (historyRes.data ?? []).forEach((row) => {
    const entry = row as { scenario_key: string | null; series: unknown };
    if (typeof entry.scenario_key !== 'string') return;
    const series = readSeries(entry.series);
    if (series.length === HISTORY_MONTHS) histories[entry.scenario_key] = series;
  });

  const workspace = workspaceRes.data as
    | {
        inputs: unknown;
        target_net: number | string | null;
        supplier_names: unknown;
        supplier_emails: unknown;
      }
    | null;

  const targetNumber = workspace ? Number(workspace.target_net) : NaN;

  return {
    inputs: workspace ? readValues(workspace.inputs) : null,
    target: Number.isFinite(targetNumber) ? String(targetNumber) : null,
    scenarios: scenarios.slice(0, 3),
    histories,
    supplierNames: workspace ? readNames(workspace.supplier_names) : {},
    supplierEmails: workspace ? readEmails(workspace.supplier_emails) : {},
  };
}

/** Writes the whole workspace back for the signed-in seller. */
export async function saveWorkspace(
  userId: string,
  inputs: Values,
  target: string,
  scenarios: Scenario[],
  histories: Record<string, number[]>,
  supplierNames: Record<string, string> = {},
  supplierEmails?: Record<string, string>,
): Promise<void> {
  const stamp = new Date().toISOString();
  const targetNumber = Number(target.replace(',', '.'));

  const { error: workspaceError } = await supabase.from('calc_workspace').upsert(
    {
      user_id: userId,
      inputs,
      target_net: Number.isFinite(targetNumber) ? targetNumber : 0,
      supplier_names: supplierNames,
      /* Only a caller that really owns the addresses writes them, so a
         sourcing save never wipes what was typed in the calculator. */
      ...(supplierEmails ? { supplier_emails: supplierEmails } : {}),
      updated_at: stamp,
    },
    { onConflict: 'user_id' },
  );
  if (workspaceError) throw workspaceError;

  const { error: clearScenariosError } = await supabase
    .from('calc_scenarios')
    .delete()
    .eq('user_id', userId);
  if (clearScenariosError) throw clearScenariosError;

  if (scenarios.length > 0) {
    const rows = scenarios.slice(0, 3).map((scenario, index) => ({
      user_id: userId,
      position: index + 1,
      name: scenario.name,
      values: scenario.values,
      updated_at: stamp,
    }));
    const { error } = await supabase.from('calc_scenarios').insert(rows);
    if (error) throw error;
  }

  const { error: clearHistoryError } = await supabase
    .from('calc_price_history')
    .delete()
    .eq('user_id', userId);
  if (clearHistoryError) throw clearHistoryError;

  const entries = Object.entries(histories).filter(
    ([, series]) => series.length === HISTORY_MONTHS,
  );
  if (entries.length > 0) {
    const rows = entries.map(([key, series]) => ({
      user_id: userId,
      scenario_key: key,
      series,
      updated_at: stamp,
    }));
    const { error } = await supabase.from('calc_price_history').insert(rows);
    if (error) throw error;
  }
}