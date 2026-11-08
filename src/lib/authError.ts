export function authErrorKey(raw: string): string | null {
  const message = raw.toLowerCase();
  if (message.includes('invalid login credentials')) return 'home.account.errInvalid';
  if (message.includes('not confirmed')) return 'home.account.errUnconfirmed';
  if (message.includes('rate limit')) return 'home.account.errRate';
  if (message.includes('already registered') || message.includes('already exists')) return 'home.account.errExists';
  if (message.includes('error sending') || message.includes('smtp') || message.includes('supabase-mail')) {
    return 'home.account.errMailService';
  }
  if (message.includes('password')) return 'home.account.errPassword';
  if (message.includes('invalid email') || message.includes('email address') && message.includes('invalid')) {
    return 'home.account.errEmail';
  }
  return null;
}
