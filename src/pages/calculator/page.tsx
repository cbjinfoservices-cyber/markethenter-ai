import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '@/pages/home/film.css';
import './calculator.css';
/* Le plancher de contraste du thème clair, partagé par les pages de travail. */
import '@/pages/home/workContrast.css';
/* Le réglage « lecture confort » posé sur l'accueil vaut aussi ici. */
import '@/pages/home/comfort.css';
import { readComfort } from '@/pages/home/comfortPref';
import Calculator from '@/pages/home/components/Calculator';
import AccountMenu from '@/pages/home/components/AccountMenu';
import AlertPill from '@/pages/home/components/AlertPill';
import SupplierDuePill from '@/pages/suppliers/components/SupplierDuePill';
import BackToTop from '@/pages/home/components/BackToTop';
import PageBurger from '@/pages/home/components/PageBurger';
import useSiteNavigation from '@/pages/home/useSiteNavigation';
import SiteNavigationLinks from '@/pages/home/components/SiteNavigationLinks';
import VerdictLegend from '@/pages/calculator/components/VerdictLegend';
import CalcPitfalls from '@/pages/calculator/components/CalcPitfalls';
import CalcNextSteps from '@/pages/calculator/components/CalcNextSteps';
import { useCalculatorLanding } from '@/pages/calculator/useCalculatorLanding';
import { useSupplierAlerts } from '@/pages/home/supplierAlerts';
import { rememberProEntry } from '@/pages/home/proMenuMemory';
import { markCalculatorHandoff } from '@/pages/home/calcHandoff';
import {
  compute,
  loadInputs,
  loadScenarios,
  loadTarget,
  makeFormatters,
  num,
  readPendingCalculation,
  thresholdFor,
} from '@/pages/home/calcModel';
import { VERDICT_SHORT_KEYS, verdictLevelOf } from '@/pages/home/calcVerdict';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { initReveal } from '@/pages/home/scrub';
/* One light/dark preference shared with the dashboard: long typing sessions on a
   dark screen are hard on the eyes. */
import { persistSkin, readSkin } from '@/pages/home/pageSkin';
import type { PageSkin } from '@/pages/home/pageSkin';
import { useMemoryEnabled } from '@/pages/home/useMemoryEnabled';

const READS = [
  { icon: 'ri-money-euro-circle-line', title: 'read1t', desc: 'read1d' },
  { icon: 'ri-price-tag-3-line', title: 'read2t', desc: 'read2d' },
  { icon: 'ri-calendar-check-line', title: 'read3t', desc: 'read3d' },
];

export default function CalculatorPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  /* Same target as the calculator itself, so the reminder's traffic light
     matches the one shown in the tool. */
  const [goodFloor] = useGoodFloor();
  const { hash } = useLocation();
  const [skin, setSkin] = useState<PageSkin>(() => readSkin());
  /* Lu une fois au montage : le réglage se change depuis l'accueil et suit
     jusqu'ici, sans avoir à le refaire page par page. */
  const [comfort] = useState<boolean>(() => readComfort());
  /* A session with no trace has to be visible from the bar, not only from the
     switch buried in the form. */
  const [memOn] = useMemoryEnabled();

  useEffect(() => {
    persistSkin(skin);
  }, [skin]);

  /* Same supplier alerts as the dashboard, so the count never depends on the
     page you happen to be looking at. */
  const alerts = useSupplierAlerts(t);
  const alertCount = alerts.length;
  const alertMonths = alerts.reduce((sum, alert) => sum + alert.monthsOver, 0);

  /* Scenarios currently on red, counted with the same floor as the tool itself. */
  const riskyCount = useMemo(() => {
    let count = 0;
    loadScenarios().forEach((scenario) => {
      const metrics = compute(scenario.values);
      if (verdictLevelOf(metrics.net, metrics.netMargin, goodFloor) === 'bad') count += 1;
    });
    return count;
  }, [goodFloor]);
  const riskyLabel =
    riskyCount > 0
      ? t(riskyCount > 1 ? 'home.burger.riskyMany' : 'home.burger.riskyOne', { count: riskyCount })
      : undefined;

  /* A scenario that came in on red: the counter grows a cross and turns into
     the way back to the filtered list. Read once the tool has its numbers. */
  const loadedRisky = useMemo(() => {
    const pending = readPendingCalculation();
    const values = pending ? pending.values : loadInputs();
    if (!values) return false;
    const metrics = compute(values);
    return verdictLevelOf(metrics.net, metrics.netMargin, goodFloor) === 'bad';
  }, [goodFloor]);

  /* Numbers handed over by the dashboard, or an explicit #calculator link:
     the reader came for the tool, not for the cover. */
  const landing = useMemo(
    () => hash === '#calculator' || readPendingCalculation() !== null,
    [hash],
  );

  useCalculatorLanding(landing);

  const { items: burgerItems, signedIn } = useSiteNavigation(markCalculatorHandoff);

  /* The scenario left on screen: the numbers handed over by the dashboard,
     or this browser's last input. Read when the burger opens, so it is never
     stale. */
  const resumeNote = () => {
    const pending = readPendingCalculation();
    const values = pending ? pending.values : loadInputs();
    if (!values) return null;
    const metrics = compute(values);
    /* Same target as the tool: the reminder shows the same three lines as the
       dashboard card — net, verdict and the minimum sale price. */
    const threshold = thresholdFor(values, num(loadTarget()));
    const saved = pending && pending.id ? loadScenarios().find((item) => item.id === pending.id) : undefined;
    const name = (saved?.name || '').trim() || t('home.burger.draftName');
    const level = verdictLevelOf(metrics.net, metrics.netMargin, goodFloor);
    return {
      label: t('home.burger.scenarioLab'),
      name,
      value: t('home.burger.netPerUnit', { value: eur(metrics.net) }),
      meta: {
        label: t('home.dash.minPrice'),
        value: threshold.feasible ? eur(threshold.minPrice) : '—',
      },
      verdict: { tone: level, label: t(VERDICT_SHORT_KEYS[level]) },
      cta: t('home.burger.resumeScenario'),
      to: '/calculateur#calculator',
    };
  };

  /* The reminder is a short cut, not a button that silently re-enables it:
     clicking it brings the switch back into view. */
  const backToMemorySwitch = () => {
    const switchEl = document.getElementById('calc-mem-switch');
    if (!switchEl) return;
    const header = document.querySelector<HTMLElement>('.calc-top');
    const offset = (header?.offsetHeight ?? 62) + 18;
    const top = switchEl.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'smooth' });
    switchEl.classList.add('is-focus');
    window.setTimeout(() => switchEl.classList.remove('is-focus'), 2400);
  };

  /* Already on the calculator: following the reminder scrolls back to the tool. */
  const backToTool = () => {
    const panel = document.getElementById('calculator');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* Coming for the tool: the workspace menu now points at the calculator. */
  useEffect(() => {
    if (landing) rememberProEntry('calculator');
  }, [landing]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!landing) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    initReveal();
    const timer = window.setTimeout(() => initReveal(), 120);
    return () => window.clearTimeout(timer);
  }, [landing]);

  return (
    <div className="calc-page" data-calc-skin={skin} data-comfort={comfort ? 'on' : 'off'}>
      <header className="calc-top">
        <Link to="/" className="nav-logo">
          <span className="dot" />
          MarketHunter AI
        </Link>
        <nav className="calc-top-links" aria-label={t('home.calcPage.navLabel')}>
          <SiteNavigationLinks items={burgerItems} />
        </nav>
        <div className="calc-top-right">
          {signedIn && !memOn && (
            <button
              type="button"
              className="calc-traceless"
              onClick={backToMemorySwitch}
              title={t('home.calcPage.tracelessHint')}
            >
              <i className="ri-eye-off-line" aria-hidden="true" />
              <span>{t('home.calcPage.traceless')}</span>
            </button>
          )}
          {signedIn && <SupplierDuePill />}
          <button
            type="button"
            className={`calc-skin${skin === 'light' ? ' is-on' : ''}`}
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
          <PageBurger
            items={burgerItems}
            note={resumeNote}
            onNoteSelect={backToTool}
            traceless={!memOn}
            onTraceless={backToMemorySwitch}
            lead={alertCount > 0 ? <AlertPill locale={locale} /> : null}
            badge={alertCount}
            badgeLabel={
              alertCount > 0
                ? t('home.alerts.badge', { count: alertCount, months: alertMonths })
                : undefined
            }
            risky={riskyCount}
            riskyLabel={riskyLabel}
            riskyTo="/dashboard?filter=risky"
            riskyClosing={loadedRisky}
            riskyAction={() => markCalculatorHandoff()}
          />
        </div>
      </header>

      <main>
        <section className="calc-hero">
          <div className="calc-hero-inner" data-reveal>
            <div className="calc-hero-copy">
              <p className="stamp">{t('home.calcPage.stamp')}</p>
              <h1 dangerouslySetInnerHTML={{ __html: t('home.calcPage.title') }} />
              <p className="calc-hero-sub">{t('home.calcPage.intro')}</p>
            </div>
            <ul className="calc-hero-chips">
              <li>
                <i className="ri-lock-unlock-line" aria-hidden="true" />
                {t('home.calcPage.chip1')}
              </li>
              <li>
                <i className="ri-save-line" aria-hidden="true" />
                {t('home.calcPage.chip2')}
              </li>
              <li>
                <i className="ri-stack-line" aria-hidden="true" />
                {t('home.calcPage.chip3')}
              </li>
            </ul>
          </div>
        </section>

        <Calculator bare />

        <section className="calc-read" aria-labelledby="calc-read-title">
          <div className="calc-read-head" data-reveal>
            <p className="stamp">{t('home.calcPage.readStamp')}</p>
            <h2 id="calc-read-title">{t('home.calcPage.readTitle')}</h2>
            <p>{t('home.calcPage.readIntro')}</p>
          </div>
          <div className="calc-read-grid">
            {READS.map((item) => (
              <article className="calc-read-card" key={item.title} data-reveal>
                <i className={item.icon} aria-hidden="true" />
                <h3>{t(`home.calcPage.${item.title}`)}</h3>
                <p>{t(`home.calcPage.${item.desc}`)}</p>
              </article>
            ))}
          </div>
          <VerdictLegend />
        </section>

        <CalcPitfalls />

        <CalcNextSteps />
      </main>

      <footer className="calc-foot">
        <span>{t('home.footer.rights')}</span>
        <span className="calc-foot-note">{t('home.calcPage.footNote')}</span>
        <span className="foot-links">
          <Link to="/dashboard" onClick={() => markCalculatorHandoff()}>
            {t('home.dash.nav')}
          </Link>
          <Link to="/">{t('home.calcPage.back')}</Link>
        </span>
      </footer>

      <BackToTop remember={false} />
    </div>
  );
}