import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBackToTopShortcut } from '@/pages/home/useBackToTopShortcut';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import useAuth from '@/hooks/useAuth';
import { GOOD_FLOOR_MAX, GOOD_FLOOR_MIN } from '@/pages/home/calcVerdict';
import useModulePreviews from '@/pages/modules/useModulePreviews';
/* La même préférence clair/sombre que le calculateur, le tableau de bord et le
   sourcing : les quatre pages de travail se lisent de la même façon. */
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
/* La page Modules reprend le même plateau studio que l'accueil : elle honore
   donc le même curseur de voile, lu dans les mêmes préférences. */
import { readVeil, veilCssValue } from '@/pages/home/veilPref';
/* Le réglage « lecture confort » posé sur l'accueil vaut aussi ici. */
import '@/pages/home/comfort.css';
import { readComfort } from '@/pages/home/comfortPref';
import AccountMenu from '@/pages/home/components/AccountMenu';
import PageBurger from '@/pages/home/components/PageBurger';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import { MODULES, type ModuleKind } from '@/pages/modules/catalog';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import SupplierDuePill from '@/pages/suppliers/components/SupplierDuePill';
import '@/pages/home/film.css';
import '@/pages/dashboard/dash.css';
import '@/pages/modules/modules.css';

/** The four steps a seller actually walks through, all in the same tool. */
const PATH = [
  { index: '1', titleKey: 'path1t', descKey: 'path1d', to: '/sourcing' },
  { index: '2', titleKey: 'path2t', descKey: 'path2d', to: '/calculateur#calculator' },
  { index: '3', titleKey: 'path3t', descKey: 'path3d', to: '/dashboard' },
];

export default function Modules() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  /* Green floor set right here: the three live previews follow it live. */
  const [goodFloor, setGoodFloor] = useGoodFloor();
  const { user } = useAuth();
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  const [veil] = useState<number>(() => readVeil());
  const [comfort] = useState<boolean>(() => readComfort());

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  /* The live modules read their own numbers; the others keep the sample strip. */
  const previews = useModulePreviews(locale, goodFloor);
  const floorLabel = `${new Intl.NumberFormat(locale).format(goodFloor)} %`;

  /* Each live strip opens its module already filtered on what it shows. */
  const previewTargetOf = (index: string): string | null => {
    if (index === '02') return '/calculateur#calculator';
    if (index === '04') return '/sourcing?sort=margin&min=median';
    if (index === '03') {
      const strip = previews['03'];
      const someRed = Boolean(strip) && strip.bar !== undefined && strip.bar < 100 && strip.big !== '—';
      return someRed ? '/dashboard?filter=risky' : '/dashboard';
    }
    return null;
  };

  useBackToTopShortcut();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const { items: burgerItems, signedIn } = useSiteNavigation();

  const tagOf = (kind: ModuleKind): string =>
    t(
      kind === 'live'
        ? 'home.modulesPage.liveTag'
        : kind === 'pro'
          ? 'home.modulesPage.proTag'
          : 'home.modulesPage.soonTag',
    );

  return (
    <div
      className="dash-page"
      data-dash-skin={skin}
      data-comfort={comfort ? 'on' : 'off'}
      style={{ '--veil-base': veilCssValue(veil) } as CSSProperties}
    >
      <header className="dash-nav">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="dash-nav-links" aria-label={t('home.modulesPage.navLabel')}>
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

      <main className="dash mod">
        <section className="dash-hero mod-hero">
          <img
            className="panel-bg mod-hero-photo"
            src="https://readdy.ai/api/search-image?query=Cinematic%20dark%20slate%20studio%20with%20a%20small%20glowing%20glass%20data%20tablet%20standing%20on%20a%20matte%20black%20desk%2C%20main%20subject%20in%20the%20left%20third%20of%20the%20frame%2C%20the%20right%20half%20calm%20empty%20dark%20haze%2C%20amber%20highlights%2C%20moody%20volumetric%20light%2C%20wide%20shot&width=2400&height=1350&seq=mh-panel-modules&orientation=landscape"
            alt=""
            aria-hidden="true"
          />
          <div className="panel-veil mod-hero-veil" aria-hidden="true" />
          <div className="dash-hero-copy">
            <p className="stamp">{t('home.modulesPage.stamp')}</p>
            <h1 dangerouslySetInnerHTML={{ __html: t('home.modulesPage.title') }} />
            <p className="dash-sub">{t('home.modulesPage.intro')}</p>
            <div className="dash-hero-actions">
              <Link to="/sourcing" className="btn">
                <i className="ri-radar-line" aria-hidden="true" />
                {t('home.modulesPage.heroCta')}
              </Link>
              <Link to="/calculateur#calculator" className="btn mod-btn-ghost">
                <i className="ri-calculator-line" aria-hidden="true" />
                {t('home.calcPage.navCalc')}
              </Link>
            </div>
            <ul className="mod-chips">
              <li>
                <i className="ri-global-line" aria-hidden="true" />
                {t('home.modulesPage.chip1')}
              </li>
              <li>
                <i className="ri-download-2-line" aria-hidden="true" />
                {t('home.modulesPage.chip2')}
              </li>
              <li>
                <i className="ri-time-line" aria-hidden="true" />
                {t('home.modulesPage.chip3')}
              </li>
            </ul>

            <div className="mod-floor">
              <div className="mod-floor-head">
                <i className="ri-leaf-line" aria-hidden="true" />
                <span>{t('home.modulesPage.floorLab')}</span>
                <b className="mod-floor-value">{floorLabel}</b>
              </div>
              <input
                className="mod-floor-range"
                type="range"
                min={GOOD_FLOOR_MIN}
                max={GOOD_FLOOR_MAX}
                step={1}
                value={goodFloor}
                onChange={(event) => setGoodFloor(Number(event.target.value))}
                aria-label={t('home.modulesPage.floorLab')}
                aria-valuetext={floorLabel}
              />
              <p className="mod-floor-hint">
                <i className="ri-flashlight-line" aria-hidden="true" />
                {t('home.modulesPage.floorHint')}
              </p>
              <p className="mod-floor-sync">
                <i className={user ? 'ri-cloud-line' : 'ri-cloud-off-line'} aria-hidden="true" />
                {user
                  ? t('home.modulesPage.floorSyncOn')
                  : t('home.modulesPage.floorSyncOff')}
              </p>
            </div>
          </div>

          <div className="dash-readout mod-readout">
            <span className="dash-readout-lab">{t('home.modulesPage.readLab')}</span>
            <b className="mod-readout-value">{t('home.modulesPage.readValue')}</b>
            <span className="dash-readout-name">{t('home.modulesPage.readUnit')}</span>
            <div className="dash-readout-grid">
              <div>
                <span>{t('home.modulesPage.read1l')}</span>
                <b>{t('home.modulesPage.read1v')}</b>
              </div>
              <div>
                <span>{t('home.modulesPage.read2l')}</span>
                <b>{t('home.modulesPage.read2v')}</b>
              </div>
              <div>
                <span>{t('home.modulesPage.read3l')}</span>
                <b>{t('home.modulesPage.read3v')}</b>
              </div>
            </div>
            <span className="dash-readout-note">{t('home.modulesPage.readNote')}</span>
          </div>
        </section>

        <section className="dash-section" id="modules-grid">
          <div className="dash-section-head">
            <h2>{t('home.modulesPage.gridTitle')}</h2>
            <p>{t('home.modulesPage.gridIntro')}</p>
          </div>

          <div className="mod-grid">
            {MODULES.map((module) => {
              const preview = previews[module.index];
              const previewTo = preview ? previewTargetOf(module.index) : null;
              const title = t(`home.modulesPage.${module.titleKey}`);

              const previewBody = preview ? (
                <>
                  <span className="mod-preview-lab">
                    {preview.lab}
                    {preview.live && (
                      <em className="mod-preview-live">{t('home.modulesPage.pvLive')}</em>
                    )}
                  </span>
                  <b className="mod-preview-big">{preview.big}</b>
                  {preview.bar !== undefined && (
                    <div className="mod-preview-bar" aria-hidden="true">
                      <span style={{ width: `${preview.bar}%` }} />
                    </div>
                  )}
                  <div className="mod-preview-rows">
                    <div>
                      <span>{preview.l1}</span>
                      <b>{preview.v1}</b>
                    </div>
                    <div>
                      <span>{preview.l2}</span>
                      <b>{preview.v2}</b>
                    </div>
                  </div>
                </>
              ) : null;

              const body = (
                <>
                  <div className="mod-card-top">
                    <span className="mod-icon" aria-hidden="true">
                      <i className={module.icon} />
                    </span>
                    <span className="mod-idx">{module.index}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{t(`home.modulesPage.${module.descKey}`)}</p>
                  {preview &&
                    (previewTo ? (
                      <Link
                        to={previewTo}
                        className={`mod-preview is-clickable${preview.live ? ' is-live' : ''}`}
                        title={t('home.modulesPage.pvOpenHint')}
                        aria-label={t('home.modulesPage.pvOpen', { name: title })}
                      >
                        {previewBody}
                        <span className="mod-preview-go" aria-hidden="true">
                          <i className="ri-arrow-right-up-line" />
                        </span>
                      </Link>
                    ) : (
                      <div className={`mod-preview${preview.live ? ' is-live' : ''}`}>
                        {previewBody}
                      </div>
                    ))}
                  <div className="mod-card-foot">
                    <span className={`mod-tag is-${module.kind}`}>
                      <i
                        className={
                          module.kind === 'live'
                            ? 'ri-checkbox-circle-line'
                            : module.kind === 'pro'
                              ? 'ri-vip-crown-line'
                              : 'ri-hammer-line'
                        }
                        aria-hidden="true"
                      />
                      {tagOf(module.kind)}
                    </span>
                    {module.to && (
                      <span className="mod-open">
                        {t('home.modulesPage.open')}
                        <i className="ri-arrow-right-line" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </>
              );

              return module.to ? (
                <article key={module.index} className="mod-card is-link">
                  <Link
                    to={module.to}
                    className="mod-card-hit"
                    aria-label={`${title} — ${t('home.modulesPage.open')}`}
                  />
                  {body}
                </article>
              ) : (
                <article key={module.index} className="mod-card">
                  {body}
                </article>
              );
            })}
          </div>
        </section>

        <section className="dash-section">
          <div className="dash-section-head">
            <h2>{t('home.modulesPage.pathTitle')}</h2>
            <p>{t('home.modulesPage.pathIntro')}</p>
          </div>

          <div className="mod-path">
            {PATH.map((step) => (
              <Link key={step.index} to={step.to} className="mod-step">
                <span className="mod-step-idx">{step.index}</span>
                <div>
                  <h3>{t(`home.modulesPage.${step.titleKey}`)}</h3>
                  <p>{t(`home.modulesPage.${step.descKey}`)}</p>
                </div>
                <i className="ri-arrow-right-up-line mod-step-go" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mod-cta">
          <div>
            <h2>{t('home.modulesPage.ctaTitle')}</h2>
            <p>{t('home.modulesPage.ctaText')}</p>
          </div>
          <div className="mod-cta-actions">
            <Link to="/calculateur#calculator" className="btn">
              <i className="ri-calculator-line" aria-hidden="true" />
              {t('home.modulesPage.ctaPrimary')}
            </Link>
            <Link to="/sourcing" className="btn mod-btn-ghost">
              <i className="ri-radar-line" aria-hidden="true" />
              {t('home.modulesPage.ctaSecondary')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="dash-foot">
        <span>{t('home.footer.rights')}</span>
        <span className="foot-links">
          <Link to="/calculateur#calculator">{t('home.calcPage.navCalc')}</Link>
          <Link to="/dashboard">{t('home.dash.nav')}</Link>
          <Link to="/">{t('home.calcPage.back')}</Link>
        </span>
      </footer>
    </div>
  );
}