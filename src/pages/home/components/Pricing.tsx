import { useTranslation } from 'react-i18next';

const PLANS = ['starter', 'pro', 'agency', 'ent'] as const;

export default function Pricing() {
  const { t } = useTranslation();
  const plans = PLANS.map((id) => ({
    id,
    name: t(`home.plan.${id}.name`),
    price: t(`home.plan.${id}.price`),
    period: id === 'ent' ? '' : t('home.pricing.perMonth'),
    featured: id === 'pro',
    features: [1, 2, 3].map((n) => t(`home.plan.${id}.f${n}`)),
    cta: t(`home.plan.${id}.cta`),
  }));
  return (
    <section className="panel" data-side="bottom" id="pricing">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Glowing amber horizon over a dark landscape, MarketHunter AI pricing plans"
        src="https://readdy.ai/api/search-image?query=Dark%20cinematic%20mountain%20ridge%20at%20blue%20hour%20with%20a%20thin%20glowing%20amber%20horizon%20line%2C%20subject%20in%20the%20upper%20half%20of%20the%20frame%2C%20the%20lower%20third%20empty%20deep%20shadow%2C%20cool%20slate%20haze%2C%20minimal%20wide%20landscape&width=2400&height=1350&seq=mh-panel-pricing&orientation=landscape"
      />
      <div className="panel-veil" />
      <div className="panel-copy panel-copy--wide" data-parallax="-0.08">
        <p className="stamp" data-reveal>{t('home.pricing.stamp')}</p>
        <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.pricing.title') }} />
        <div className="cards">
          {plans.map((p) => (
            <article key={p.id} className={`card${p.featured ? ' is-featured' : ''}`} data-reveal>
              <p className="stamp">{p.name}{p.featured ? ` · ${t('home.pricing.popular')}` : ''}</p>
              <div className="price">{p.price} <small>{p.period}</small></div>
              <ul>{p.features.map((f) => <li key={f}><i className="ri-check-line" />{f}</li>)}</ul>
              <a href="#contact" className={`btn${p.featured ? '' : ' btn-ghost'}`}>{p.cta} <i className="ri-arrow-right-line" /></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}