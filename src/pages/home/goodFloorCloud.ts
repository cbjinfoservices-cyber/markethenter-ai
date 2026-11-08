import { supabase } from '@/lib/supabase';
import { clampGoodFloor } from '@/pages/home/calcVerdict';
import { loadTarget } from '@/pages/home/calcModel';

/**
 * The green floor kept in the signed-in seller's workspace, so the threshold
 * set on one device is the threshold read on the next one. `null` means the
 * account never chose one yet.
 */
export async function fetchGoodFloor(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('calc_workspace')
    .select('good_floor')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = Number((data as { good_floor: number | string | null }).good_floor);
  return Number.isFinite(raw) ? clampGoodFloor(raw) : null;
}

/**
 * Writes only the floor. When the account already holds a workspace, nothing
 * else is touched — the inputs and the target stay exactly as they were saved.
 * On a brand-new account the row is created with this browser's target, so a
 * half-empty workspace is never invented.
 */
export async function saveGoodFloor(userId: string, value: number): Promise<void> {
  const floor = clampGoodFloor(value);
  const stamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('calc_workspace')
    .update({ good_floor: floor, updated_at: stamp })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return;

  const target = Number(loadTarget().replace(',', '.'));
  const { error: insertError } = await supabase.from('calc_workspace').upsert(
    {
      user_id: userId,
      good_floor: floor,
      target_net: Number.isFinite(target) ? target : 5,
      updated_at: stamp,
    },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
}