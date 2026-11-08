export type ModuleKind = 'live' | 'pro' | 'soon';

export type ModuleInfo = {
  index: string;
  icon: string;
  titleKey: string;
  descKey: string;
  kind: ModuleKind;
  to?: string;
};

export const MODULES: ModuleInfo[] = [
  { index: '01', icon: 'ri-search-line', titleKey: 'm1t', descKey: 'm1d', kind: 'pro' },
  { index: '02', icon: 'ri-calculator-line', titleKey: 'm2t', descKey: 'm2d', kind: 'live', to: '/calculateur#calculator' },
  { index: '03', icon: 'ri-dashboard-3-line', titleKey: 'm3t', descKey: 'm3d', kind: 'live', to: '/dashboard' },
  { index: '04', icon: 'ri-radar-line', titleKey: 'm4t', descKey: 'm4d', kind: 'live', to: '/sourcing' },
  { index: '05', icon: 'ri-eye-line', titleKey: 'm5t', descKey: 'm5d', kind: 'pro' },
  { index: '06', icon: 'ri-magic-line', titleKey: 'm6t', descKey: 'm6d', kind: 'pro' },
  { index: '07', icon: 'ri-alarm-warning-line', titleKey: 'm7t', descKey: 'm7d', kind: 'pro' },
  { index: '08', icon: 'ri-store-2-line', titleKey: 'm8t', descKey: 'm8d', kind: 'pro' },
  { index: '09', icon: 'ri-line-chart-line', titleKey: 'm9t', descKey: 'm9d', kind: 'pro' },
  { index: '10', icon: 'ri-puzzle-2-line', titleKey: 'm10t', descKey: 'm10d', kind: 'soon' },
];
