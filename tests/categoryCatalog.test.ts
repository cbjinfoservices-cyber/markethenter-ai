import { describe, expect, it, vi } from 'vitest';
import { loadCategories, mergeCategoryProducts, selectedCategories } from '@/pages/sourcing/categoryCatalog';
import { arrangeGrid } from '@/pages/sourcing/arrangeGrid';
import { CATEGORIES, rowFor } from '@/pages/sourcing/productMargin';
import type { SourcingProduct } from '@/pages/sourcing/productMargin';
import { SOURCING_PRODUCTS } from '@/mocks/sourcing';

const product = (id: string, category: SourcingProduct['category']): SourcingProduct => ({
  ...SOURCING_PRODUCTS[0], id, category,
});

describe('multi-category sourcing', () => {
  it('loads all seven distinct categories and keeps every category in the results', async () => {
    const calls: string[] = [];
    const result = await loadCategories('all', async (category, progress) => {
      calls.push(category);
      const products = [product(`asin-${category}`, category)];
      progress(products);
      return { products, cacheMiss: false };
    }, () => true, () => {});
    expect(calls).toEqual(CATEGORIES);
    expect(result.products.map((item) => item.category)).toEqual(CATEGORIES);
    expect(result.products).toHaveLength(7);
    expect(result.missing).toEqual([]);
  });

  it('tracks cache misses and does not invent products for them', async () => {
    const result = await loadCategories('all', async (category) => category === 'sport'
      ? { products: [product('sport', category)], cacheMiss: false }
      : { products: [], cacheMiss: true }, () => true, () => {});
    expect(result.products.map((item) => item.id)).toEqual(['sport']);
    expect(result.missing).toEqual(CATEGORIES.filter((category) => category !== 'sport'));
  });

  it('only loads the requested category for a specific selection', async () => {
    const load = vi.fn(async (_category: SourcingProduct['category']) => ({ products: [], cacheMiss: false }));
    await loadCategories('bureau', load, () => true, () => {});
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe('bureau');
    expect(selectedCategories('bureau')).toEqual(['bureau']);
  });

  it('deduplicates a product while retaining all category filters', () => {
    const products = mergeCategoryProducts([
      [product('same-asin', 'maison')],
      [product('same-asin', 'sport')],
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].categories).toEqual(['maison', 'sport']);
    const rows = [rowFor(products[0], 5, 20)];
    expect(arrangeGrid(rows, {
      category: 'sport', verdict: 'all', sort: 'margin', sort2: 'none',
      flip: false, minMargin: -50, locale: 'fr-FR',
    })).toHaveLength(1);
  });

  it('keeps already published results and stops after a category failure', async () => {
    const progress = vi.fn();
    const load = vi.fn(async (category: SourcingProduct['category'], publish: (products: SourcingProduct[]) => void) => {
      if (category === 'bureau') throw new Error('provider-http');
      const products = [product('first', category)];
      publish(products);
      return { products, cacheMiss: false };
    });
    await expect(loadCategories('all', load, () => true, progress)).rejects.toThrow('provider-http');
    expect(load).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'first', category: 'maison' })]);
  });

  it('does not request another category when cancelled', async () => {
    let active = true;
    const load = vi.fn(async () => {
      active = false;
      return { products: [], cacheMiss: false };
    });
    await loadCategories('all', load, () => active, () => {});
    expect(load).toHaveBeenCalledTimes(1);
  });
});
