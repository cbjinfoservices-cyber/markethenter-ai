import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AccountMenu from '@/pages/home/components/AccountMenu';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import './account.css';

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { items } = useSiteNavigation();
  return (
    <div className="account-page">
      <header className="account-header">
        <Link to="/">MarketHunter AI</Link>
        <nav aria-label={t('account.navigation')}>
          <SiteNavigationLinks items={items} />
        </nav>
        <AccountMenu />
      </header>
      <main className="account-main">{children}</main>
    </div>
  );
}
