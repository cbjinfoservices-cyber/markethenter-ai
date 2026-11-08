import { createContext, useCallback, useContext, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { confirmationRedirectUrl } from '@/lib/authRedirect';

export type SignUpOutcome = { error: string | null; needsConfirmation: boolean };

export type AuthState = { session: Session | null; loading: boolean; authError: boolean };
export const AuthContext = createContext<AuthState | null>(null);

export default function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside AuthProvider');
  const { session, loading, authError } = state;
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpOutcome> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: confirmationRedirectUrl(window.location.origin, __BASE_PATH__) },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmationRedirectUrl(window.location.origin, __BASE_PATH__) },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return error ? error.message : null;
  }, []);

  const user = session?.user ?? null;

  return useMemo(
    () => ({ user, loading, authError, signIn, signUp, resendConfirmation, signOut }),
    [user, loading, authError, signIn, signUp, resendConfirmation, signOut],
  );
}