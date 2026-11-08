import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EXPORT_EVENT, clearLastExport, loadLastExport } from '@/pages/home/exportLog';
import type { LastExport } from '@/pages/home/exportLog';

type Props = { locale: string };

/** Rappel discret du dernier fichier téléchargé : son nom et l'heure. */
export default function LastExportNote({ locale }: Props) {
  const { t } = useTranslation();
  const [last, setLast] = useState<LastExport | null>(() => loadLastExport());

  useEffect(() => {
    const sync = () => setLast(loadLastExport());
    window.addEventListener(EXPORT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EXPORT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const stamp = useMemo(() => {
    if (!last) return '';
    const when = new Date(last.at);
    const day = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
    }).format(when);
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(when);
    return t('home.calc.lastExportWhen', { date: day, time });
  }, [last, locale, t]);

  if (!last) return null;

  return (
    <p className="calc-last-export" title={t('home.calc.lastExportHint')}>
      <i className="ri-download-cloud-2-line" aria-hidden="true" />
      <span className="calc-last-export-lab">{t('home.calc.lastExportLab')}</span>
      <b className="calc-last-export-name">{last.name}</b>
      <span className="calc-last-export-when">{stamp}</span>
      {/* Repartir d'une ligne propre : le rappel disparaît jusqu'au prochain
          téléchargement. */}
      <button
        type="button"
        className="calc-last-export-x"
        onClick={clearLastExport}
        title={t('home.calc.lastExportClearHint')}
        aria-label={t('home.calc.lastExportClear')}
      >
        <i className="ri-close-line" aria-hidden="true" />
      </button>
    </p>
  );
}