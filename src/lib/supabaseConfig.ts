export function validSupabaseConfig(url: string, key: string): boolean {
  if (!key.trim() || key.trim() === 'placeholder-anon-key') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (['invalid', 'test', 'example'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return false;
    if (host === 'placeholder.supabase.co' || host === 'account-ui-test.supabase.co') return false;
    return parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(host));
  } catch {
    return false;
  }
}
