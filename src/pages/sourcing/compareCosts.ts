import { num } from '@/pages/home/calcModel';
import type { CompareItem } from '@/pages/sourcing/compareItem';

type Translate = (key: string) => string;

export type CostKey =
  | 'supplier'
  | 'shipping'
  | 'packaging'
  | 'customs'
  | 'amazon'
  | 'fba'
  | 'ppc'
  | 'returns'
  | 'vat';

export type CostLine = {
  key: CostKey;
  label: string;
  amount: number;
  /** Share of the sale price, in percent. Zero when there is no price yet. */
  share: number;
};

/**
 * Every cost already paid inside the sale price, in euros, plus its share of
 * the price. This is the block the supplier reads: it shows where the price
 * they quote gets diluted once freight, customs, commission, FBA, PPC and
 * returns are taken out.
 */
export function costLinesOf(item: CompareItem, t: Translate): CostLine[] {
  const values = item.values;
  if (!values) return [];
  const price = item.metrics.price;
  const supplier = num(values.supplier);
  const shipping = num(values.shipping);
  const packaging = num(values.packaging);
  const customs = num(values.customs);
  const amazon = num(values.amazon);
  const returns = num(values.returns);
  const share = (amount: number): number => (price > 0 ? (amount / price) * 100 : 0);

  const rows: { key: CostKey; amount: number }[] = [
    { key: 'supplier', amount: supplier },
    { key: 'shipping', amount: shipping },
    { key: 'packaging', amount: packaging },
    { key: 'customs', amount: (supplier + shipping) * (customs / 100) },
    { key: 'amazon', amount: price * (amazon / 100) },
    { key: 'fba', amount: num(values.fba) },
    { key: 'ppc', amount: num(values.ppc) },
    { key: 'returns', amount: price * (returns / 100) },
    { key: 'vat', amount: item.metrics.vatAmount },
  ];

  return rows.map((row) => ({
    key: row.key,
    label: t(`home.calc.${row.key}`),
    amount: row.amount,
    share: share(row.amount),
  }));
}

/** One cost of the list, zero when the item carries no calculator inputs. */
export function costAmountOf(lines: CostLine[], key: CostKey): number {
  return lines.find((line) => line.key === key)?.amount ?? 0;
}

/** Same, as a share of the sale price. */
export function costShareOf(lines: CostLine[], key: CostKey): number {
  return lines.find((line) => line.key === key)?.share ?? 0;
}