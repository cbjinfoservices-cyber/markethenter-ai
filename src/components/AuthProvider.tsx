import { useEffect, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null, loading: true, authError: false,
  });

  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authChanged = true;
      setState({ session, loading: false, authError: false });
    });

    void supabase.auth.getSession().then(({ data: result, error }) => {
      if (!active || authChanged) return;
      setState({ session: result.session, loading: false, authError: Boolean(error) });
    }).catch((error: unknown) => {
      if (!active || authChanged) return;
      console.error('Unable to restore authentication session', error);
      setState({ session: null, loading: false, authError: true });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
