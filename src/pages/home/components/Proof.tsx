import { useTranslation } from 'react-i18next';

export default function Proof() {
  const { t } = useTranslation();
  const stats = [
    { value: '11', label: t('home.proof.s1') },
    { value: '4', label: t('home.proof.s2') },
    { value: '180 d', label: t('home.proof.s3') },
    { value: '0–100', label: t('home.proof.s4') },
  ];
  return (
    <section className="panel" data-side="left" id="proof">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Night container port with amber lights, omnichannel marketplace data by MarketHunter AI"
        src="https://readdy.ai/api/search-image?query=Aerial%20night%20view%20of%20a%20container%20port%20with%20amber%20lights%20and%20cool%20blue%20haze%2C%20cinematic%20dark%20grade%2C%20main%20subject%20in%20the%20right%20third%20of%20the%20frame%2C%20the%20left%20half%20calm%20dark%20water%20and%20empty%20sky%2C%20wide%20quiet%20composition&width=2400&height=1350&seq=mh-panel-proof&orientation=landscape"
      />
      <div className="panel-veil" />
      <span className="panel-accent" aria-hidden="true" data-parallax="0.55" style={{ right: '8vw', top: '18%' }}>11</span>
      <div className="panel-copy" data-parallax="-0.08">
        <p className="stamp" data-reveal>{t('home.proof.stamp')}</p>
        <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.proof.title') }} />
        <p className="sub" data-reveal>{t('home.proof.sub')}</p>
        <div className="stats" data-reveal>
          {stats.map((s) => (<div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>))}
        </div>
      </div>
    </section>
  );
}