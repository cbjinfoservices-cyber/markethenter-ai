import { isRecord } from '../../../supabase/functions/_shared/amazon';
import { parsePriceObservation } from '../../../supabase/functions/sourcing-bestsellers/verification';

export type LiveItem = {
  asin?: string;
  title?: string;
  image?: string;
  price?: number;
  rating?: number;
  reviews?: number;
  rank?: number;
  link?: string;
};

export type DetailObservation = { asin: string; price: number | null; checkedAt: string };

export class PriceVerificationError extends Error {
  readonly observations: DetailObservation[];
  readonly providerStatus?: number;

  constructor(code: string, observations: DetailObservation[], providerStatus?: number) {
    super(code);
    this.observations = observations;
    this.providerStatus = providerStatus;
  }
}

export function parsePriceVerification(payload: unknown): DetailObservation[] {
  if (!isRecord(payload) || (payload.error !== undefined && typeof payload.error !== 'string') ||
    (payload.providerStatus !== undefined && (typeof payload.providerStatus !== 'number' ||
      !Number.isInteger(payload.providerStatus) || payload.providerStatus < 400 || payload.providerStatus > 599))) {
    throw new Error('provider-invalid');
  }
  const raw = payload.observations === undefined && payload.error ? [] : payload.observations;
  if (!Array.isArray(raw)) throw new Error('provider-invalid');
  const observations = raw.map((item: unknown): DetailObservation => {
    const observation = parsePriceObservation(item);
    if (!isRecord(item) || typeof item.asin !== 'string' || !/^[A-Z0-9]{10}$/.test(item.asin) || !observation) {
      throw new Error('provider-invalid');
    }
    return { asin: item.asin, ...observation };
  });
  if (typeof payload.error === 'string' && payload.error) throw new PriceVerificationError(
    payload.error, observations, typeof payload.providerStatus === 'number' ? payload.providerStatus : undefined,
  );
  return observations;
}

export async function availableProducts(
  items: LiveItem[],
  observations: DetailObservation[],
  verify: ((asins: string[]) => Promise<DetailObservation[]>) | null,
  isCurrent: () => boolean,
  onProgress?: (items: LiveItem[]) => void,
): Promise<LiveItem[]> {
  const saved = new Map<string, DetailObservation>();
  const accept = (observation: DetailObservation) => {
    const age = Date.now() - Date.parse(observation.checkedAt);
    if (age >= 0 && age < 3_600_000 &&
      (observation.price === null || (Number.isFinite(observation.price) && observation.price > 0))) {
      saved.set(observation.asin, observation);
    }
  };
  observations.forEach(accept);
  const available = () => items.flatMap((item) => {
    const observation = item.asin ? saved.get(item.asin) : undefined;
    if (observation) return observation.price !== null ? [{ ...item, price: observation.price }] : [];
    return [];
  });
  if (isCurrent()) onProgress?.(available());
  const asins = [...new Set(items.map((item) => item.asin)
    .filter((asin): asin is string => typeof asin === 'string' && /^[A-Z0-9]{10}$/.test(asin)))];
  const missing = asins.filter((asin) => !saved.has(asin));
  if (verify) {
    for (let i = 0; i < missing.length; i += 3) {
      if (!isCurrent()) return [];
      const batch = missing.slice(i, i + 3);
      let verified: DetailObservation[];
      try {
        verified = await verify(batch);
      } catch (error) {
        if (error instanceof PriceVerificationError) {
          error.observations.filter((observation) => batch.includes(observation.asin)).forEach(accept);
          if (isCurrent()) onProgress?.(available());
        }
        throw error;
      }
      verified.filter((observation) => batch.includes(observation.asin)).forEach(accept);
      if (isCurrent()) onProgress?.(available());
      if (batch.some((asin) => !saved.has(asin))) throw new Error('provider-invalid');
    }
  }
  return available();
}
