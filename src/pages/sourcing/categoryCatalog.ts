import { CATEGORIES } from './productMargin';
import type { SourcingCategory, SourcingProduct } from './productMargin';

export type CatalogSelection = SourcingCategory | 'all';
export type CategoryResult = { products: SourcingProduct[]; cacheMiss: boolean };

export function selectedCategories(selection: CatalogSelection): SourcingCategory[] {
  return selection === 'all' ? [...CATEGORIES] : [selection];
}

export function mergeCategoryProducts(groups: SourcingProduct[][]): SourcingProduct[] {
  const merged = new Map<string, SourcingProduct>();
  for (const product of groups.flat()) {
    const previous = merged.get(product.id);
    if (!previous) {
      merged.set(product.id, { ...product, categories: product.categories ?? [product.category] });
    } else {
      const categories = new Set([...(previous.categories ?? [previous.category]), ...(product.categories ?? [product.category])]);
      merged.set(product.id, { ...previous, categories: [...categories] });
    }
  }
  return [...merged.values()];
}

export async function loadCategories(
  selection: CatalogSelection,
  load: (category: SourcingCategory, progress: (products: SourcingProduct[]) => void) => Promise<CategoryResult>,
  isCurrent: () => boolean,
  onProgress: (products: SourcingProduct[]) => void,
): Promise<{ products: SourcingProduct[]; missing: SourcingCategory[]; loaded: number }> {
  const groups: SourcingProduct[][] = [];
  const missing: SourcingCategory[] = [];
  let loaded = 0;
  for (const category of selectedCategories(selection)) {
    if (!isCurrent()) break;
    const result = await load(category, (products) => {
      if (isCurrent()) onProgress(mergeCategoryProducts([...groups, products]));
    });
    if (!isCurrent()) break;
    if (result.cacheMiss) missing.push(category);
    else {
      loaded++;
      groups.push(result.products);
    }
    if (!result.cacheMiss) onProgress(mergeCategoryProducts(groups));
  }
  return { products: mergeCategoryProducts(groups), missing, loaded };
}
