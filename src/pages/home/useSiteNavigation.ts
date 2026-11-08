import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import { navigationFor } from './navigation';
import type { BurgerLink } from './components/PageBurger';

export default function useSiteNavigation(onDashboardSelect?: () => void) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pathname, hash } = useLocation();
  const items: BurgerLink[] = navigationFor(Boolean(user)).map((item) => {
    const [path, fragment] = item.to.split('#');
    return {
      key: item.key,
      label: t(item.labelKey),
      to: item.to,
      icon: item.icon,
      current: path === pathname && (path !== '/' || hash === `#${fragment}`),
      onSelect: item.key === 'dash' ? onDashboardSelect : undefined,
    };
  });
  return { items, signedIn: Boolean(user) };
}
