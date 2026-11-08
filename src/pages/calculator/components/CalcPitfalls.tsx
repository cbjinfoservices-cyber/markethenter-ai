import { useTranslation } from 'react-i18next';

type Pitfall = { key: string; icon: string };

const PITFALLS: Pitfall[] = [
  { key: 'pit1', icon: 'ri-ship-line' },
  { key: 'pit2', icon: 'ri-percent-line' },
  { key: 'pit3', icon: 'ri-arrow-go-back-line' },
  { key: 'pit4', icon: 'ri-megaphone-line' },
  { key: 'pit5', icon: 'ri-receipt-line' },
  { key: 'pit6', icon: 'ri-speed-up-line' },
];

/** The six cost mistakes that quietly turn a green product red. */
export default function CalcPitfalls() {
  const { t } = useTranslation();

  return (
    <section className="calc-pits" aria-labelledby="calc-pits-title">
      <div className="calc-pits-inner">
        <div className="calc-pits-head" data-reveal>
          <p className="stamp">{t('home.calcPage.pitStamp')}</p>
          <h2 id="calc-pits-title">{t('home.calcPage.pitTitle')}</h2>
          <p>{t('home.calcPage.pitIntro')}</p>
        </div>

        <div className="calc-pits-grid">
          {PITFALLS.map((item, index) => (
            <article className="calc-pit" key={item.key} data-reveal>
              <div className="calc-pit-top">
                <span className="calc-pit-ico" aria-hidden="true">
                  <i className={item.icon} />
                </span>
                <span className="calc-pit-num">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3>{t(`home.calcPage.${item.key}t`)}</h3>
              <p>{t(`home.calcPage.${item.key}d`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}