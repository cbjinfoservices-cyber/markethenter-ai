import { useCallback, useEffect, useState } from 'react';
import { fetchAccountAccess, accountErrorKey } from '@/lib/accountAccess';
import type { AccountAccess } from '@/lib/accountAccess';

export default function useAccountAccess(userId: string | undefined) {
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<{
    userId: string | undefined;
    access: AccountAccess | null;
    error: string | null;
    loading: boolean;
  }>({ userId: undefined, access: null, error: null, loading: false });
  const refresh = useCallback(() => setEpoch((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState({ userId, access: null, error: null, loading: Boolean(userId) });
    if (userId) {
      fetchAccountAccess(userId).then((access) => {
        if (active) setState({ userId, access, error: null, loading: false });
      }).catch((error: unknown) => {
        if (active) setState({ userId, access: null, error: accountErrorKey(error), loading: false });
      });
    }
    return () => { active = false; };
  }, [userId, epoch]);

  if (state.userId !== userId) return { access: null, error: null, loading: Boolean(userId), refresh };
  return { access: state.access, error: state.error, loading: state.loading, refresh };
}
