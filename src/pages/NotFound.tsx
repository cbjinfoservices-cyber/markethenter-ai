import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { readSkin } from "./home/pageSkin";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="dash-page" data-dash-skin={readSkin()}>
      <main className="site-empty">
        <Link to="/" className="nav-logo"><span className="dot" />MarketHunter AI</Link>
        <p className="stamp">404</p>
        <h1>{t('home.notFound.title')}</h1>
        <p>{t('home.notFound.description')}</p>
        <Link to="/" className="btn">
          <i className="ri-home-4-line" aria-hidden="true" />
          {t('home.calcPage.navHome')}
        </Link>
      </main>
    </div>
  );
}