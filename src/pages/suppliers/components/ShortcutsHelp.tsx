import { useTranslation } from 'react-i18next';

/** LE RÉCAPITULATIF DES RACCOURCIS — toutes les touches du carnet au même
 *  endroit, ouvert par Alt + H, « ? » ou le bouton « Raccourcis ». */

type KeyRow = {
  /** Les touches à afficher, groupe par groupe : « Alt » puis « B ». */
  keys: string[];
  labelKey: string;
};

type KeyGroup = {
  titleKey: string;
  icon: string;
  rows: KeyRow[];
};

const GROUPS: KeyGroup[] = [
  {
    titleKey: 'home.suppliers.shortcutsGroupRecords',
    icon: 'ri-store-2-line',
    rows: [
      { keys: ['Alt', 'N'], labelKey: 'home.suppliers.shortcutsNewRecord' },
      { keys: ['Alt', 'Suppr'], labelKey: 'home.suppliers.shortcutsRemoveRecord' },
    ],
  },
  {
    titleKey: 'home.suppliers.shortcutsGroupBackup',
    icon: 'ri-archive-2-line',
    rows: [{ keys: ['Alt', 'B'], labelKey: 'home.suppliers.shortcutsBackup' }],
  },
  {
    titleKey: 'home.suppliers.shortcutsGroupViews',
    icon: 'ri-bookmark-3-line',
    rows: [
      { keys: ['Alt', '←'], labelKey: 'home.suppliers.shortcutsPrev' },
      { keys: ['Alt', '→'], labelKey: 'home.suppliers.shortcutsNext' },
      { keys: ['Alt', '1', '…', '8'], labelKey: 'home.suppliers.shortcutsSeat' },
    ],
  },
  {
    titleKey: 'home.suppliers.shortcutsGroupPinned',
    icon: 'ri-pushpin-line',
    rows: [
      { keys: ['Alt', 'Maj', '←'], labelKey: 'home.suppliers.shortcutsPinUp' },
      { keys: ['Alt', 'Maj', '→'], labelKey: 'home.suppliers.shortcutsPinDown' },
    ],
  },
  {
    titleKey: 'home.suppliers.shortcutsGroupHelp',
    icon: 'ri-question-line',
    rows: [
      { keys: ['Alt', 'H'], labelKey: 'home.suppliers.shortcutsHelp' },
      { keys: ['?'], labelKey: 'home.suppliers.shortcutsHelp' },
      { keys: ['Esc'], labelKey: 'home.suppliers.shortcutsEscape' },
    ],
  },
];

type Props = {
  onClose: () => void;
};

export default function ShortcutsHelp({ onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="sup-help-wrap" role="presentation" onClick={onClose}>
      <div
        className="sup-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sup-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sup-help-head">
          <h2 id="sup-help-title">
            <i className="ri-keyboard-line" aria-hidden="true" />
            {t('home.suppliers.shortcutsTitle')}
          </h2>
          <button
            type="button"
            className="sup-help-x"
            onClick={onClose}
            title={t('home.suppliers.shortcutsClose')}
            aria-label={t('home.suppliers.shortcutsClose')}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>
        <p className="sup-help-intro">{t('home.suppliers.shortcutsIntro')}</p>
        <div className="sup-help-grid">
          {GROUPS.map((group) => (
            <section key={group.titleKey} className="sup-help-group">
              <h3>
                <i className={group.icon} aria-hidden="true" />
                {t(group.titleKey)}
              </h3>
              <ul>
                {group.rows.map((row) => (
                  <li key={`${row.keys.join('-')}-${row.labelKey}`}>
                    <span className="sup-help-keys">
                      {row.keys.map((key) =>
                        key === '…' ? (
                          <span key={`sep-${key}`} className="sup-help-ell">{key}</span>
                        ) : (
                          <kbd key={`k-${key}`}>{key}</kbd>
                        ),
                      )}
                    </span>
                    <span className="sup-help-label">{t(row.labelKey)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="sup-help-foot">
          <i className="ri-information-line" aria-hidden="true" />
          {t('home.suppliers.shortcutsFoot')}
        </p>
        <p className="sup-help-foot">
          <i className="ri-history-line" aria-hidden="true" />
          {t('home.suppliers.shortcutsFootHold')}
        </p>
      </div>
    </div>
  );
}