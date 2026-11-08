import { useCallback, useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isSupabaseReady, supabase } from '@/lib/supabase';
import { SOURCING_PRODUCTS } from '@/mocks/sourcing';
import { estimateCosts } from '@/pages/sourcing/productMargin';
import type { SourcingCategory, SourcingProduct } from '@/pages/sourcing/productMargin';
import { availableProducts } from './availableProducts';
import type { LiveItem, DetailObservation } from './availableProducts';
import { loadCategories } from './categoryCatalog';
import { isSuspectPrice, loadManualPrices, saveManualPrice } from './manualPrices';

export type SourcingSource = 'demo' | 'live';

/** A listing whose price is non conforming, waiting for a manual price. */
export type PendingListing = {
  asin: string;
  title: string;
  image?: string;
  sourceUrl?: string;
  listedPrice: number;
  category: SourcingCategory;
};

const DEMO: SourcingProduct[] = SOURCING_PRODUCTS as SourcingProduct[];
const AMAZON_PRODUCT_URL = /^https:\/\/www\.amazon\.(?:fr|de|es|it|co\.uk|com)\/dp\/[A-Z0-9]{10}$/;

const sourceUrlOf = (link: unknown): string | undefined =>
  typeof link === 'string' && AMAZON_PRODUCT_URL.test(link) ? link : undefined;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

/** Live listings carry no supplier quote: costs are flagged as estimates. */
function toProduct(item: LiveItem, index: number, category: SourcingCategory): SourcingProduct | null {
  const name = typeof item.title === 'string' ? item.title.trim() : '';
  const price = typeof item.price === 'number' ? item.price : NaN;
  if (name === '' || !Number.isFinite(price) || price <= 0) return null;
  const costs = estimateCosts(price);
  return {
    id: item.asin || `${slugify(name)}-${index}`,
    name,
    category,
    retailer: 'amazon',
    image: typeof item.image === 'string' ? item.image : '',
    sourceUrl: sourceUrlOf(item.link),
    price,
    rating: typeof item.rating === 'number' ? item.rating : 0,
    reviews: typeof item.reviews === 'number' ? item.reviews : 0,
    rank: typeof item.rank === 'number' && item.rank > 0 ? item.rank : index + 1,
    trend: 0,
    ...costs,
    estimated: true,
  };
}

/** Manual prices replace the listed price; non conforming ones without a manual price wait for review. */
function splitListings(items: LiveItem[], category: SourcingCategory, manual: Record<string, number>) {
  const products: SourcingProduct[] = [];
  const pending: PendingListing[] = [];
  items.forEach((item, index) => {
    const listed = typeof item.price === 'number' ? item.price : NaN;
    const manualPrice = item.asin ? manual[item.asin] : undefined;
    if (manualPrice === undefined && isSuspectPrice(listed)) {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (item.asin && title !== '' && Number.isFinite(listed) && listed > 0) {
        pending.push({
          asin: item.asin,
          title,
          image: typeof item.image === 'string' ? item.image : undefined,
          sourceUrl: sourceUrlOf(item.link),
          listedPrice: listed,
          category,
        });
      }
      return;
    }
    const product = toProduct({ ...item, price: manualPrice ?? listed }, index, category);
    if (product) products.push(product);
  });
  return { products, pending };
}

/**
 * Read the shared cache; only the server scheduler requests paid provider data.
 */
export default function useSourcingCatalog() {
  const [products, setProducts] = useState<SourcingProduct[]>(isSupabaseReady ? [] : DEMO);
  const [source, setSource] = useState<SourcingSource>(isSupabaseReady ? 'live' : 'demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCategory, setFailedCategory] = useState<SourcingCategory | null>(null);
  const [missingCategories, setMissingCategories] = useState<SourcingCategory[]>([]);
  const [pending, setPending] = useState<PendingListing[]>([]);
  const requestId = useRef(0);
  const activeReads = useRef(0);
  const pendingByAsin = useRef(new Map<string, PendingListing>());

  const refresh = useCallback(async (category: SourcingCategory | 'all') => {
    const currentRequest = ++requestId.current;
    if (!isSupabaseReady) {
      setError('no-backend');
      return;
    }
    activeReads.current++;
    setLoading(true);
    setError(null);
    setFailedCategory(null);
    setMissingCategories([]);
    if (category === 'all') pendingByAsin.current.clear();
    let activeCategory: SourcingCategory | null = null;
    try {
      const result = await loadCategories(
        category,
        async (currentCategory, progress) => {
          activeCategory = currentCategory;
          const { data, error: invokeError } = await supabase.functions.invoke('sourcing-bestsellers', {
            body: { category: currentCategory, action: 'read-cache' },
          });
          if (invokeError) throw invokeError;
          const payload = data as {
            products?: LiveItem[]; observations?: DetailObservation[]; error?: string; cacheMiss?: boolean;
          } | null;
          if (payload?.cacheMiss) return { products: [], cacheMiss: true };
          if (payload?.error) throw new Error(payload.error);
          if (!Array.isArray(payload?.products)) throw new Error('provider-invalid');
          const manual = loadManualPrices();
          const record = (items: LiveItem[]) => {
            const split = splitListings(items, currentCategory, manual);
            for (const [asin, entry] of pendingByAsin.current) {
              if (entry.category === currentCategory) pendingByAsin.current.delete(asin);
            }
            split.pending.forEach((entry) => pendingByAsin.current.set(entry.asin, entry));
            if (currentRequest === requestId.current) {
              setPending([...pendingByAsin.current.values()]);
            }
            return split.products;
          };
          const available = await availableProducts(
            payload.products.slice(0, 24),
            Array.isArray(payload.observations) ? payload.observations : [],
            null,
            () => currentRequest === requestId.current,
            (items) => progress(record(items).slice(0, 24)),
          );
          const products = record(available).slice(0, 24);
          return { products, cacheMiss: false };
        },
        () => currentRequest === requestId.current,
        (available) => {
          setProducts(available);
          setSource('live');
        },
      );
      if (currentRequest !== requestId.current) return;
      setMissingCategories(result.missing);
      if (result.loaded === 0) {
        setProducts([]);
        return;
      }
      if (result.products.length === 0) {
        setError('prices-not-verified');
        return;
      }
    } catch (loadError) {
      let code = '';
      if (loadError instanceof FunctionsHttpError) {
        try {
          const body: unknown = await loadError.context.json();
          if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
            code = body.error;
          }
        } catch {
          code = loadError.context.status === 404 ? 'function-not-deployed' : 'failed';
        }
        if (!code) code = loadError.context.status === 404 ? 'function-not-deployed' : 'failed';
      }
      if (currentRequest === requestId.current) {
        setFailedCategory(activeCategory);
        const candidate = code || (loadError instanceof Error ? loadError.message : 'function-unreachable');
        setError(candidate);
      }
    } finally {
      activeReads.current--;
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requests = requestId;
    void refresh('all');
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && activeReads.current === 0) void refresh('all');
    }, 60_000);
    return () => {
      requests.current++;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const setManualPrice = useCallback((asin: string, price: number) => {
    saveManualPrice(asin, price);
    void refresh('all');
  }, [refresh]);

  return { products, source, loading, error, failedCategory, missingCategories, pending, setManualPrice, refresh };
}
