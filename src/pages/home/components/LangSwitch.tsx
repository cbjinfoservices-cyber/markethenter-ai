import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, saveLang } from '@/i18n/lang';

export default function LangSwitch() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const choose = (lang: string) => {
    if (lang === current) return;
    saveLang(lang);
    i18n.changeLanguage(lang);
  };
  return (
    <div className="lang-switch" role="group" aria-label="Language / Langue">
      {SUPPORTED_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={l === current ? 'is-active' : ''}
          aria-pressed={l === current}
          onClick={() => choose(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}