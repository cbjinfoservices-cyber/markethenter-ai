import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { MODULES, type ModuleKind } from '@/pages/modules/catalog';
import { PLANS } from '@/pages/tarifs/plans';
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
import AccountMenu from '@/pages/home/components/AccountMenu';
import PageBurger from '@/pages/home/components/PageBurger';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import SupplierDuePill from '@/pages/suppliers/components/SupplierDuePill';
import '@/pages/dashboard/dash.css';
import '@/pages/modules/modules.css';
import './tarifs.css';

export default function Tarifs() {
  const { t } = useTranslation();
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  const { items: burgerItems, signedIn } = useSiteNavigation();

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  const tagOf = (kind: ModuleKind): string =>
    t(
      kind === 'live'
        ? 'home.modulesPage.liveTag'
        : kind === 'pro'
          ? 'home.modulesPage.proTag'
          : 'home.modulesPage.soonTag',
    );

  return (
    <div className="dash-page" data-dash-skin={skin}>
      <header className="dash-nav">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="dash-nav-links" aria-label={t('home.nav.pricing')}>
          <SiteNavigationLinks items={burgerItems} />
        </nav>
        <div className="nav-right">
          {signedIn && <SupplierDuePill />}
          <button
            type="button"
            className={`dash-skin${skin === 'light' ? ' is-on' : ''}`}
            onClick={() => setSkin((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-pressed={skin === 'light'}
            title={t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}
          >
            <i
              className={skin === 'light' ? 'ri-moon-clear-line' : 'ri-sun-line'}
              aria-hidden="true"
            />
            <span>{t(skin === 'light' ? 'home.calcPage.skinDark' : 'home.calcPage.skinLight')}</span>
          </button>
          <AccountMenu />
          <PageBurger items={burgerItems} />
        </div>
      </header>

      <main className="dash tarifs">
        <section className="dash-hero tarifs-hero">
          <div className="dash-hero-copy">
            <p className="stamp">{t('home.tarifs.stamp')}</p>
            <h1 dangerouslySetInnerHTML={{ __html: t('home.tarifs.title') }} />
            <p className="dash-sub">{t('home.tarifs.intro')}</p>
          </div>
        </section>

        <section className="dash-section" aria-label={t('home.tarifs.stamp')}>
          <div className="tarifs-grid">
            {PLANS.map((plan) => {
              const included = MODULES.filter((module) => plan.modules.includes(module.index));
              return (
                <article
                  key={plan.id}
                  className={`tarifs-card${plan.featured ? ' is-featured' : ''}`}
                >
                  <header className="tarifs-card-head">
                    <p className="stamp">
                      {t(`home.plan.${plan.id}.name`)}
                      {plan.featured ? ` · ${t('home.pricing.popular')}` : ''}
                    </p>
                    <div className="tarifs-price">
                      {t(`home.plan.${plan.id}.price`)}
                      {plan.id !== 'ent' && <small> {t('home.pricing.perMonth')}</small>}
                    </div>
                    <p className="tarifs-count">
                      {t('home.tarifs.count', { count: included.length, total: MODULES.length })}
                    </p>
                  </header>

                  <h2 className="tarifs-list-title">{t('home.tarifs.includes')}</h2>
                  <ul className="tarifs-modules">
                    {included.map((module) => (
                      <li key={module.index} className={`tarifs-module is-${module.kind}`}>
                        <span className="mod-icon" aria-hidden="true">
                          <i className={module.icon} />
                        </span>
                        <span className="tarifs-module-name">
                          {t(`home.modulesPage.${module.titleKey}`)}
                        </span>
                        {plan.limited?.includes(module.index) ? (
                          <span className="mod-tag is-limited">{t('home.tarifs.limited')}</span>
                        ) : (
                          <span className={`mod-tag is-${module.kind}`}>{tagOf(module.kind)}</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {plan.id === 'ent' && (
                    <p className="tarifs-note">
                      <i className="ri-customer-service-2-line" aria-hidden="true" />
                      {t('home.tarifs.entNote')}
                    </p>
                  )}

                  <Link
                    to="/#contact"
                    className={`btn${plan.featured ? '' : ' btn-ghost'} tarifs-cta`}
                  >
                    {t(`home.plan.${plan.id}.cta`)}
                    <i className="ri-arrow-right-line" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
