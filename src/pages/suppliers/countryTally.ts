import type { Supplier } from '@/pages/suppliers/supplierStore';

/** Un pays de la liste, avec le nombre de fiches qui s'y trouvent. */
export type CountryCount = {
  /** Le pays tel qu'il est écrit sur les fiches, '' quand il manque. */
  key: string;
  count: number;
  unknown: boolean;
};

/** Les fiches comptées par pays, du plus fourni au moins fourni. Les fiches
 *  sans pays restent à la fin : elles n'ont pas de rang à défendre. */
export function tallyCountries(list: Supplier[]): CountryCount[] {
  const map = new Map<string, number>();
  list.forEach((supplier) => {
    const key = supplier.country.trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  const out: CountryCount[] = [];
  map.forEach((count, key) => {
    out.push({ key, count, unknown: key === '' });
  });
  return out.sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    if (b.count !== a.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
}