import { useTranslation } from 'react-i18next';

export default function Manifesto() {
  const { t } = useTranslation();
  const html = t('home.manifesto');
  return (
    <section className="panel manifesto" id="belief">
      <span className="rings" aria-hidden="true" data-parallax="0.55" />
      <p className="manifesto-text" data-words data-html={html} dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}