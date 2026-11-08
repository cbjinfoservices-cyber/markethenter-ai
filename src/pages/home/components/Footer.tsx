import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <p className="foot-line" data-reveal dangerouslySetInnerHTML={{ __html: t('home.footer.line') }} />
      <div className="foot-grid">
        <div data-reveal>
          <h4>MarketHunter AI</h4>
          {/* The same duo of ways out as the two working pages, under the logo. */}
          <div className="foot-links foot-links-head">
            <Link to="/calculateur">{t('home.nav.calculator')}</Link>
            <Link to="/dashboard">{t('home.dash.nav')}</Link>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, maxWidth: '36ch', margin: 0 }}>{t('home.footer.desc')}</p>
          <div className="socials">
            <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i className="ri-linkedin-fill" /></a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i className="ri-youtube-fill" /></a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X"><i className="ri-twitter-x-line" /></a>
          </div>
        </div>
        <div data-reveal>
          <h4>{t('home.footer.product')}</h4>
          <Link to="/calculateur">{t('home.nav.calculator')}</Link>
          <Link to="/dashboard">{t('home.dash.nav')}</Link>
          <a href="#modules">{t('home.footer.modules')}</a>
          <Link to="/modules">{t('home.modulesPage.footerLink')}</Link>
          <a href="#proof">{t('home.footer.markets')}</a>
          <a href="#pricing">{t('home.footer.pricing')}</a>
          <a href="#contact">{t('home.footer.extension')}</a>
        </div>
        <div data-reveal>
          <h4>{t('home.footer.company')}</h4>
          <a href="#belief">{t('home.footer.belief')}</a>
          <a href="#contact">{t('home.footer.contact')}</a>
          <a href="#contact">{t('home.footer.api')}</a>
        </div>
        <div data-reveal>
          <h4>{t('home.footer.legal')}</h4>
          <a href="#faq">{t('home.footer.privacy')}</a>
          <a href="#faq">{t('home.footer.cookies')}</a>
          <a href="#contact">{t('home.footer.terms')}</a>
        </div>
      </div>
      <div className="legal"><span>{t('home.footer.rights')}</span><span>{t('home.footer.disclaimer')}</span></div>
    </footer>
  );
}