import { supabase } from '@/lib/supabase';
import { sanitizeView } from '@/pages/sourcing/viewMemory';
import type { ViewMemory } from '@/pages/sourcing/viewMemory';
import { sanitizeCompare } from '@/pages/sourcing/compareMemory';
import type { CompareMemory } from '@/pages/sourcing/compareMemory';
import { MARGIN_OFF } from '@/pages/sourcing/components/SourcingFilters';
import { clampMinMargin } from '@/pages/sourcing/minMarginMemory';
import { appendViewTrace, sanitizeViewLog } from '@/pages/sourcing/viewHistory';
import type { ViewTrace } from '@/pages/sourcing/viewHistory';

/**
 * The reading posture of the sourcing board — sort, tie-breaker, filters, the
 * minimum margin slider — and the two comparison columns, kept in the signed-in
 * seller's workspace. A board arranged on the laptop opens the same way on the
 * phone, like the green floor.
 */
export type SourcingCloud = {
  /** `null` when the account never chose a view. */
  view: ViewMemory | null;
  /** `null` when the account never compared anything. */
  compare: CompareMemory | null;
  /** Minimum margin requirement, in percent. `null` when never set. */
  minMargin: number | null;
  /** When the account's board was last arranged, ISO string. `null` if never. */
  savedAt: string | null;
  /** The arrangements kept in the account, newest first (up to 30). */
  history: ViewTrace[];
};

export type SourcingCloudPatch = {
  view: ViewMemory | null;
  compare: CompareMemory | null;
  minMargin: number;
};

/** What a write leaves behind: the stamp and the refreshed history. */
export type SourcingSave = {
  savedAt: string;
  history: ViewTrace[];
};

type Row = {
  sourcing_view?: unknown;
  sourcing_compare?: unknown;
  sourcing_margin?: unknown;
  sourcing_view_at?: unknown;
  sourcing_view_log?: unknown;
};

export async function fetchSourcingCloud(userId: string): Promise<SourcingCloud> {
  const { data, error } = await supabase
    .from('calc_workspace')
    .select('sourcing_view, sourcing_compare, sourcing_margin, sourcing_view_at, sourcing_view_log')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { view: null, compare: null, minMargin: null, savedAt: null, history: [] };
  }

  const row = data as Row;
  const rawMargin =
    row.sourcing_margin == null || row.sourcing_margin === ''
      ? Number.NaN
      : Number(row.sourcing_margin);
  const rawStamp = typeof row.sourcing_view_at === 'string' ? row.sourcing_view_at : null;
  return {
    view: row.sourcing_view == null ? null : sanitizeView(row.sourcing_view),
    compare: row.sourcing_compare == null ? null : sanitizeCompare(row.sourcing_compare),
    minMargin: Number.isFinite(rawMargin) ? clampMinMargin(rawMargin) : null,
    savedAt: rawStamp && Number.isFinite(Date.parse(rawStamp)) ? rawStamp : null,
    history: sanitizeViewLog(row.sourcing_view_log),
  };
}

/**
 * Writes the view, the comparison and the margin requirement together. When the
 * account already holds a workspace nothing else is touched — inputs, target
 * and green floor stay as they were. A brand-new account gets a row holding
 * only these sourcing settings.
 *
 * Each write also stamps the arrangement into a long history, so the account
 * can show what changed and when — the history keeps the thirty latest.
 */
export async function saveSourcingCloud(
  userId: string,
  patch: SourcingCloudPatch,
): Promise<SourcingSave> {
  const view = patch.view ? sanitizeView(patch.view) : null;
  const compare = patch.compare ? sanitizeCompare(patch.compare) : null;
  const margin = clampMinMargin(patch.minMargin);
  const storedMargin = margin === MARGIN_OFF ? null : margin;
  const stamp = new Date().toISOString();

  /* The existing history comes first: a write never erases what came before. */
  const { data: current, error: readError } = await supabase
    .from('calc_workspace')
    .select('sourcing_view_log')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const previous = sanitizeViewLog((current as Row | null)?.sourcing_view_log);
  const history = view
    ? appendViewTrace(previous, { at: stamp, view, minMargin: margin })
    : previous;

  const { data, error } = await supabase
    .from('calc_workspace')
    .update({
      sourcing_view: view,
      sourcing_compare: compare,
      sourcing_margin: storedMargin,
      sourcing_view_at: stamp,
      sourcing_view_log: history,
      updated_at: stamp,
    })
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return { savedAt: stamp, history };

  const { error: insertError } = await supabase.from('calc_workspace').upsert(
    {
      user_id: userId,
      sourcing_view: view,
      sourcing_compare: compare,
      sourcing_margin: storedMargin,
      sourcing_view_at: stamp,
      sourcing_view_log: history,
      updated_at: stamp,
    },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
  return { savedAt: stamp, history };
}