import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { RestoreRecord } from '@/pages/suppliers/restoreLog';

/** Le temps de maintien avant que la croix n'apparaisse. */
const ARM_MS = 240;
/** Le temps de maintien complet, celui qui retire vraiment la ligne. */
const HOLD_MS = 860;

type Props = {
  records: RestoreRecord[];
  /** Retire la ligne tenue : le carnet et ses pastilles ne bougent pas. */
  onRemove: (at: number) => void;
  format: (date: Date) => string;
};

/** L'HISTORIQUE DES TROIS DERNIÈRES RESTAURATIONS — le fichier relu, son
 *  instant et ce qu'il a reposé. La ligne tenue s'assombrit, un mince anneau
 *  se remplit, et la croix n'apparaît qu'à ce moment-là : un appui long la
 *  retire, un clic sur la croix aussi, et le clavier garde son accès par la
 *  tabulation. */
export default function RestoreHistory({ records, onRemove, format }: Props) {
  const { t } = useTranslation();
  /* La ligne tenue, dès l'appui : c'est elle que l'anneau et le grisé suivent. */
  const [holdingAt, setHoldingAt] = useState<number | null>(null);
  /* La ligne dont la croix est réellement sortie, pendant l'appui. */
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const heldAt = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  /* Quitter la page en pleine pression n'emporte pas la ligne. */
  useEffect(() => clearTimers, [clearTimers]);

  const cancel = () => {
    clearTimers();
    heldAt.current = null;
    setHoldingAt(null);
    setArmedAt(null);
  };

  const startPress = (at: number) => {
    clearTimers();
    heldAt.current = at;
    setHoldingAt(at);
    armTimer.current = window.setTimeout(() => setArmedAt(at), ARM_MS);
    holdTimer.current = window.setTimeout(() => {
      clearTimers();
      heldAt.current = null;
      setHoldingAt(null);
      setArmedAt(null);
      onRemove(at);
    }, HOLD_MS);
  };

  /* L'anneau se remplit sur la durée exacte du maintien : il touche la fin
     au moment même où la ligne part. */
  const ringStyle = { '--sup-hold-ms': `${HOLD_MS}ms` } as CSSProperties;

  return (
    <div className="sup-restore-log" title={t('home.suppliers.restoreHoldHint')}>
      <span className="sup-restore-log-lab">
        <i className="ri-history-line" aria-hidden="true" />
        {t('home.suppliers.restoreHistoryTitle')}
      </span>
      <ul className="sup-restore-log-list">
        {records.map((record) => (
          <li
            key={`${record.file}-${record.at}`}
            className={`sup-restore-note${holdingAt === record.at ? ' is-holding' : ''}${
              armedAt === record.at ? ' is-armed' : ''
            }`}
            title={t('home.suppliers.restoreHoldHint')}
            style={ringStyle}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target as HTMLElement | null;
              if (target !== null && target.closest('.sup-restore-drop') !== null) return;
              startPress(record.at);
            }}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(event) => {
              if (heldAt.current === record.at) event.preventDefault();
            }}
          >
            <span className="sup-restore-file">{record.file}</span>
            <span className="sup-restore-sep" aria-hidden="true">
              ·
            </span>
            <span>{format(new Date(record.at))}</span>
            <span className="sup-restore-sep" aria-hidden="true">
              ·
            </span>
            <b className="sup-restore-count">
              {t('home.suppliers.restoreHistoryCount', { count: record.count })}
            </b>
            {record.views > 0 && (
              <b className="sup-restore-views">
                {t('home.suppliers.restoreHistoryViews', { count: record.views })}
              </b>
            )}
            <span
              className={`sup-restore-ring${holdingAt === record.at ? ' is-on' : ''}`}
              aria-hidden="true"
            />
            <button
              type="button"
              className="sup-restore-drop"
              onClick={() => onRemove(record.at)}
              title={t('home.suppliers.restoreLineRemoveHint', { file: record.file })}
              aria-label={t('home.suppliers.restoreLineRemoveAria', { file: record.file })}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}