import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { markCalculatorHandoff } from '@/pages/home/calcHandoff';

type Next = {
  key: string;
  to: string;
  icon: string;
  handoff?: boolean;
};

const NEXT: Next[] = [
  { key: 'next1', to: '/sourcing', icon: 'ri-radar-line' },
  { key: 'next2', to: '/dashboard', icon: 'ri-dashboard-3-line', handoff: true },
  { key: 'next3', to: '/#modules', icon: 'ri-apps-2-line' },
];

/** Where the numbers go once the calculator has answered. */
export default function CalcNextSteps() {
  const { t } = useTranslation();

  return (
    <section className="calc-next" aria-labelledby="calc-next-title">
      <div className="calc-next-inner">
        <div className="calc-next-head" data-reveal>
          <p className="stamp">{t('home.calcPage.nextStamp')}</p>
          <h2 id="calc-next-title">{t('home.calcPage.nextTitle')}</h2>
          <p>{t('home.calcPage.nextIntro')}</p>
        </div>

        <div className="calc-next-grid">
          {NEXT.map((item) => (
            <Link
              className="calc-next-card"
              key={item.key}
              to={item.to}
              data-reveal
              onClick={item.handoff ? () => markCalculatorHandoff() : undefined}
            >
              <span className="calc-next-ico" aria-hidden="true">
                <i className={item.icon} />
              </span>
              <span className="calc-next-copy">
                <b>{t(`home.calcPage.${item.key}t`)}</b>
                <em>{t(`home.calcPage.${item.key}d`)}</em>
              </span>
              <i className="ri-arrow-right-line calc-next-go" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}