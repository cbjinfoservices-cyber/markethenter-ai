export type NavigationItem = {
  key: string;
  labelKey: string;
  to: string;
  icon: string;
};

const PUBLIC_NAVIGATION: NavigationItem[] = [
  { key: 'modules', labelKey: 'home.nav.modules', to: '/#modules', icon: 'ri-apps-2-line' },
  { key: 'pricing', labelKey: 'home.nav.pricing', to: '/tarifs', icon: 'ri-price-tag-3-line' },
  { key: 'faq', labelKey: 'home.nav.faq', to: '/#faq', icon: 'ri-question-line' },
];

const WORKSPACE_NAVIGATION: NavigationItem[] = [
  { key: 'dash', labelKey: 'home.dash.nav', to: '/dashboard', icon: 'ri-dashboard-3-line' },
  { key: 'src', labelKey: 'home.sourcing.nav', to: '/sourcing', icon: 'ri-radar-line' },
  { key: 'calc', labelKey: 'home.calcPage.navCalc', to: '/calculateur#calculator', icon: 'ri-calculator-line' },
  { key: 'sup', labelKey: 'home.suppliers.nav', to: '/fournisseurs', icon: 'ri-store-2-line' },
];

export function navigationFor(signedIn: boolean): NavigationItem[] {
  return signedIn ? WORKSPACE_NAVIGATION : PUBLIC_NAVIGATION;
}
