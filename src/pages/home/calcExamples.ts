import type { Values } from '@/pages/home/calcModel';

export type CalcExample = {
  id: string;
  nameKey: string;
  tagKey: string;
  icon: string;
  values: Values;
};

/**
 * Three ready-made products: one healthy margin, one thin margin and one
 * loss-making one, so a first visit can see the whole traffic-light range
 * without typing a single number.
 */
export const CALC_EXAMPLES: CalcExample[] = [
  {
    id: 'bottle',
    nameKey: 'home.calc.exBottle',
    tagKey: 'home.calc.exBottleTag',
    icon: 'ri-cup-line',
    values: {
      supplier: '4.20',
      shipping: '1.10',
      packaging: '0.35',
      customs: '5',
      amazon: '15',
      fba: '3.40',
      ppc: '1.20',
      returns: '5',
      vat: '20',
      price: '24.90',
      units: '320',
    },
  },
  {
    id: 'lamp',
    nameKey: 'home.calc.exLamp',
    tagKey: 'home.calc.exLampTag',
    icon: 'ri-lightbulb-flash-line',
    values: {
      supplier: '9.50',
      shipping: '2.40',
      packaging: '0.60',
      customs: '5',
      amazon: '15',
      fba: '4.80',
      ppc: '2.60',
      returns: '8',
      vat: '20',
      price: '29.90',
      units: '160',
    },
  },
  {
    id: 'bench',
    nameKey: 'home.calc.exBench',
    tagKey: 'home.calc.exBenchTag',
    icon: 'ri-run-line',
    values: {
      supplier: '38.00',
      shipping: '9.50',
      packaging: '1.20',
      customs: '5',
      amazon: '15',
      fba: '9.20',
      ppc: '4.50',
      returns: '9',
      vat: '20',
      price: '79.90',
      units: '45',
    },
  },
];