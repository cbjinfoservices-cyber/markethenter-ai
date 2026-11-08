import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ?? '';
const anonKey = (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const isSupabaseReady = url !== '' && anonKey !== '';

/** Single Supabase client for the whole app (never instantiate another one). */
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);