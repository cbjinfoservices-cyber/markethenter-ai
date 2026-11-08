export function confirmationRedirectUrl(origin: string, basePath: string): string {
  const base = `${basePath.replace(/\/+$/, '')}/`;
  return new URL('dashboard', new URL(base, origin)).href;
}
