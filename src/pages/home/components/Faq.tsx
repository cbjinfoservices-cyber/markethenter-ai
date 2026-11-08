import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function Faq() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(0);
  const items = [1, 2, 3, 4, 5, 6].map((i) => ({ q: t(`home.faq.q${i}`), a: t(`home.faq.a${i}`) }));
  return (
    <section className="panel" data-side="left" id="faq">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Soft amber light behind frosted glass, MarketHunter AI FAQ"
        src="https://readdy.ai/api/search-image?query=Minimal%20dark%20studio%20scene%20with%20a%20frosted%20glass%20panel%20catching%20a%20soft%20amber%20light%20from%20the%20side%2C%20subtle%20dust%20particles%20in%20the%20air%2C%20main%20subject%20in%20the%20right%20third%20of%20the%20frame%2C%20the%20left%20half%20calm%20empty%20deep%20charcoal%20haze%2C%20cinematic%20wide%20shot&width=2400&height=1350&seq=mh-panel-faq&orientation=landscape"
      />
      <div className="panel-veil" />
      <div className="panel-copy panel-copy--faq" data-parallax="-0.08">
        <p className="stamp" data-reveal>{t('home.faq.stamp')}</p>
        <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.faq.title') }} />
        <div className="faq-list">
          {items.map((item, i) => (
            <div key={item.q} className={`faq-item${open === i ? ' is-open' : ''}`} data-reveal>
              <button type="button" className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{item.q}</span>
                <i className={open === i ? 'ri-subtract-line' : 'ri-add-line'} />
              </button>
              <div className="faq-a">
                <div><p>{item.a}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}