import { supabase } from '@/lib/supabase';
import { isPsychoRule, loadTarget } from '@/pages/home/calcModel';
import type { PsychoRule } from '@/pages/home/calcModel';

/**
 * The rounding rule kept in the signed-in seller's workspace, next to the
 * margin floor: the ending chosen on the laptop is the ending read on the
 * phone. `null` means the account never chose one yet.
 */
export async function fetchPsychoRule(userId: string): Promise<PsychoRule | null> {
  const { data, error } = await supabase
    .from('calc_workspace')
    .select('psycho_rule')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = (data as { psycho_rule: string | null }).psycho_rule;
  return isPsychoRule(raw) ? raw : null;
}

/**
 * Writes only the rule. An existing workspace keeps its inputs, its target and
 * its names untouched; a brand-new account gets a row with this browser's
 * target, so a half-empty workspace is never invented.
 */
export async function savePsychoRule(userId: string, value: PsychoRule): Promise<void> {
  const rule: PsychoRule = isPsychoRule(value) ? value : '90';
  const stamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('calc_workspace')
    .update({ psycho_rule: rule, updated_at: stamp })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return;

  const target = Number(loadTarget().replace(',', '.'));
  const { error: insertError } = await supabase.from('calc_workspace').upsert(
    {
      user_id: userId,
      psycho_rule: rule,
      target_net: Number.isFinite(target) ? target : 5,
      updated_at: stamp,
    },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
}