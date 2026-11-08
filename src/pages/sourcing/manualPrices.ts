/** Listing prices above this ceiling are treated as non conforming and need a manual price. */
export const SUSPECT_PRICE_CEILING = 1000;

const STORAGE_KEY = 'mh-sourcing-manual-prices';

export function isSuspectPrice(price: number): boolean {
  return !Number.isFinite(price) || price <= 0 || price > SUSPECT_PRICE_CEILING;
}

export function loadManualPrices(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function saveManualPrice(asin: string, price: number): void {
  const prices = loadManualPrices();
  prices[asin] = price;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
}
