import { useTranslation } from 'react-i18next';

export default function Platform() {
  const { t } = useTranslation();
  const modules = [1, 2, 3, 4].map((i) => ({
    idx: `0${i}`,
    title: t(`home.platform.m${i}t`),
    text: t(`home.platform.m${i}d`),
  }));
  return (
    <section className="panel" data-side="right" id="modules">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Dark studio with a glowing glass data dashboard showing MarketHunter AI product research modules"
        src="https://readdy.ai/api/search-image?query=Cinematic%20dark%20slate%20studio%20with%20a%20small%20glowing%20glass%20data%20tablet%20standing%20on%20a%20matte%20black%20desk%2C%20main%20subject%20in%20the%20left%20third%20of%20the%20frame%2C%20the%20right%20half%20calm%20empty%20dark%20haze%2C%20amber%20highlights%2C%20moody%20volumetric%20light%2C%20wide%20shot&width=2400&height=1350&seq=mh-panel-modules&orientation=landscape"
      />
      <div className="panel-veil" />
      <div className="panel-copy panel-copy--list" data-parallax="-0.08">
        <p className="stamp" data-reveal>{t('home.platform.stamp')}</p>
        <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.platform.title') }} />
        <ul className="rule-list">
          {modules.map((m) => (
            <li key={m.idx} data-reveal><span className="idx">{m.idx}</span><h3>{m.title}</h3><p>{m.text}</p></li>
          ))}
        </ul>
        <div className="pull" data-reveal><p>{t('home.platform.pull')}</p></div>
      </div>
    </section>
  );
}