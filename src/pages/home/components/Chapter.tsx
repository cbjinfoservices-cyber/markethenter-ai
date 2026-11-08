import { useTranslation } from 'react-i18next';

export default function Chapter() {
  const { t } = useTranslation();
  const h = (key: string) => ({ __html: t(key) });
  return (
    <section
      className="chapter"
      data-video={`${import.meta.env.BASE_URL}videos/home-scrub.mp4`}
      style={{ ['--beat-count' as string]: 5 }}
    >
      <div className="stage">
        <img
          className="plate"
          src="https://v3b.fal.media/files/b/0ab0bfa6/RvhxhAqLtJYnWbp9zJF-E_mddMSTQA.jpg"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          alt="A glass analytics panel on a dark surface showing a trend line at +175%, an amber margin bar and an AI score gauge at 92."
        />
        <div className="veil" aria-hidden="true" />
        <div className="veil veil-light" aria-hidden="true" />
        <div className="beat" data-from="0" data-to=".2857" data-pos="left" data-depth="soft" data-tone="dark" data-motion="track" id="overview">
          <p className="stamp">{t('home.beat1.stamp')}</p>
          <h1 data-split="lines" data-html={t('home.beat1.title')} dangerouslySetInnerHTML={h('home.beat1.title')} />
          <p className="sub">{t('home.beat1.sub')}</p>
          <a className="btn cta" href="#contact">{t('home.beat1.cta')} <i className="ri-arrow-right-line" /></a>
        </div>
        <div className="beat" data-from=".2857" data-to=".5" data-pos="left" data-depth="soft" data-tone="dark" data-motion="rise" id="detection">
          <p className="stamp">{t('home.beat2.stamp')}</p>
          <h2 data-split="lines" data-html={t('home.beat2.title')} dangerouslySetInnerHTML={h('home.beat2.title')} />
          <p className="sub">{t('home.beat2.sub')}</p>
          <ul className="points">
            <li>{t('home.beat2.p1')}</li>
            <li>{t('home.beat2.p2')}</li>
            <li>{t('home.beat2.p3')}</li>
          </ul>
        </div>
        <div className="beat" data-from=".5" data-to=".7143" data-pos="left" data-depth="soft" data-tone="light" data-motion="drift" id="margin">
          <p className="stamp">{t('home.beat3.stamp')}</p>
          <h2 data-split="lines" data-html={t('home.beat3.title')} dangerouslySetInnerHTML={h('home.beat3.title')} />
          <p className="sub">{t('home.beat3.sub')}</p>
          <ul className="chips" data-side="right">
            <li>{t('home.beat3.c1')}</li>
            <li>{t('home.beat3.c2')}</li>
            <li>{t('home.beat3.c3')}</li>
          </ul>
        </div>
        <div className="beat" data-from=".7143" data-to=".8571" data-pos="left" data-depth="soft" data-tone="dark" data-motion="zoom" id="score">
          <p className="stamp">{t('home.beat4.stamp')}</p>
          <h2 data-split="lines" data-html={t('home.beat4.title')} dangerouslySetInnerHTML={h('home.beat4.title')} />
          <p className="sub">{t('home.beat4.sub')}</p>
        </div>
        <div className="beat" data-from=".8571" data-to="1" data-pos="left" data-depth="soft" data-tone="dark" data-motion="rise" id="opportunity">
          <p className="stamp">{t('home.beat5.stamp')}</p>
          <h2 data-split="lines" data-html={t('home.beat5.title')} dangerouslySetInnerHTML={h('home.beat5.title')} />
          <p className="sub">{t('home.beat5.sub')}</p>
          <a className="btn cta" href="#pricing">{t('home.beat5.cta')} <i className="ri-arrow-right-line" /></a>
        </div>
        <div className="scroll-cue" aria-hidden="true"><span className="mouse" />{t('home.chapter.cue')}</div>
      </div>
    </section>
  );
}