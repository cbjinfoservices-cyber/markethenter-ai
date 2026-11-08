import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import LangSwitch from './LangSwitch';
import useAuth from '@/hooks/useAuth';
import { VERDICT_ICONS } from '@/pages/home/calcVerdict';
import type { VerdictLevel } from '@/pages/home/calcVerdict';
import { useRelanceCount } from '@/pages/dashboard/relanceBadge';
import { useContactGapCount } from '@/pages/dashboard/contactsGap';
import { useSupplierDueCount } from '@/pages/suppliers/supplierDue';
import '@/pages/suppliers/duePill.css';
import {
  useImportedTodayCount,
  useImportedTraceCount,
  useImportedWeekCount,
} from '@/pages/sourcing/importedContacts';
import { useUnnamedImports } from '@/pages/sourcing/unnamedImports';
import '@/pages/home/burger.css';

export type BurgerLink = {
  key: string;
  label: string;
  to: string;
  icon: string;
  current?: boolean;
  onSelect?: () => void;
};

/** Reminder of the scenario being worked on, shown under the links. */
export type BurgerNote = {
  label: string;
  name: string;
  value: string;
  /** Traffic light of that scenario, read the same way as the calculator. */
  verdict?: { tone: VerdictLevel; label: string };
  /** One more figure under the value — the break-even price, say. */
  meta?: { label: string; value: string };
  cta: string;
  to: string;
};

type Props = {
  items: BurgerLink[];
  /** Rendered above the links — the supplier alert, on the dashboard. */
  lead?: ReactNode;
  /** Scenario reminder card, at the top of the panel. Read when it opens. */
  note?: () => BurgerNote | null;
  /** Extra action when the reminder is followed (same page, so: scroll). */
  onNoteSelect?: () => void;
  /** Count shown on the burger button itself, so it survives a tight bar. */
  badge?: number;
  badgeLabel?: string;
  /** Scenarios sitting on red, counted apart from the supplier alert. */
  risky?: number;
  riskyLabel?: string;
  /** Turn the risky count into a filter: the pill itself opens this list. */
  riskyTo?: string;
  /**
   * A risky scenario is currently loaded in this workspace: the pill grows a
   * cross, so it reads as "active filter" and offers the way back.
   */
  riskyClosing?: boolean;
  /** What the cross means on this page (defaults to the way back to the list). */
  riskyClosingLabel?: string;
  /** Fired when the pill is followed (hand the numbers back, say). */
  riskyAction?: () => void;
  /**
   * The field memory is off: the bar says so with a pill, but on a reduced
   * header that pill shrinks to its icon — so the panel repeats it in full.
   */
  traceless?: boolean;
  /** Following the reminder brings the memory switch back into view. */
  onTraceless?: () => void;
};

/**
 * Same burger as the home bar, reused on the calculator and the dashboard so
 * the navigation behaves the same way everywhere: links until 1160px, then
 * this panel. The panel is portalled to the body because the headers blur
 * their background, which would otherwise anchor a fixed panel to them.
 */
export default function PageBurger({
  items,
  lead,
  note,
  onNoteSelect,
  badge = 0,
  badgeLabel,
  risky = 0,
  riskyLabel,
  riskyTo,
  riskyClosing = false,
  riskyClosingLabel,
  riskyAction,
  traceless = false,
  onTraceless,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const shown = user && Number.isFinite(badge) && badge > 0 ? badge : 0;
  const riskyShown = user && Number.isFinite(risky) && risky > 0 ? risky : 0;
  const reminder = open && note ? note() : null;
  /* Fournisseurs qui attendent encore leur e-mail : le panneau les compte et
     mène directement au tableau de bord déjà filtré. */
  const followUp = useRelanceCount();
  /* Les relances du carnet fournisseurs : leur pastille s'efface de l'en-tête
     sous 480 px, donc le menu reprend le compteur là où la barre se tait. */
  const dueBook = useSupplierDueCount();
  /* Fiches dont le contact reste à compléter — sans adresse, ou jamais écrites.
     Le panneau les compte et mène au comparatif, où la feuille les rappelle. */
  const contactGaps = useContactGapCount();
  /* Les fiches dont l'adresse vient du fichier de travail : la pastille ouvre
     le tableau de bord déjà filtré sur ces cartes. */
  const importedTraces = useImportedTraceCount();
  /* Les réimports du jour, comptés à côté du total : on voit d'un coup d'œil
     si le fichier vient de tourner ou si le badge vient d'hier. */
  const importedToday = useImportedTodayCount();
  /* Et la cadence de la semaine, à côté : le jour seul ne dit pas si le
     fichier tourne tous les matins ou une fois par semaine. */
  const importedWeek = useImportedWeekCount();
  /* Les fiches importées qui n'ont toujours pas de fournisseur nommé : une
     seule, la pastille ouvre sa fiche avec le champ du nom sous les yeux ;
     plusieurs, elle mène à la liste filtrée du tableau de bord, où chacune
     se traite dans l'ordre. */
  const unnamed = useUnnamedImports();
  const unnamedMany = unnamed.count > 1;
  const unnamedTo =
    unnamed.firstId === null
      ? null
      : unnamedMany
        ? '/dashboard?filter=unnamed'
        : `/calculateur?history=s${unnamed.firstId}&baptise=1#calculator`;
  const unnamedHint = t(
    unnamedMany ? 'home.burger.unnamedHintMany' : 'home.burger.unnamedHint',
    { count: unnamed.count },
  );
  const unnamedAria = t(
    unnamedMany ? 'home.burger.unnamedAriaMany' : 'home.burger.unnamedAria',
    { count: unnamed.count },
  );
  /* Une fiche qui attend son nom depuis plus de dix jours : la pastille passe
     au rouge pour que l'oubli se voie sans ouvrir le tableau de bord. */
  const unnamedCold =
    unnamed.oldestDays !== null && unnamed.oldestDays >= 10 ? unnamed.oldestDays : null;
  const coldHint =
    unnamedCold === null
      ? ''
      : t('home.burger.unnamedColdHint', { count: unnamedCold });
  /* Vingt jours et plus : l'oubli est franchement ancien. Le rouge ne suffit
     plus, le contour de la pastille se met à clignoter. */
  const unnamedStale =
    unnamed.oldestDays !== null && unnamed.oldestDays >= 20 ? unnamed.oldestDays : null;
  const staleHint =
    unnamedStale === null
      ? ''
      : t('home.burger.unnamedStaleHint', { count: unnamedStale });
  const unnamedHints = [coldHint, staleHint].filter(Boolean).join(' — ');
  const unnamedLabel = [unnamedAria, coldHint, staleHint].filter(Boolean).join(' — ');
  /* The supplier count stays on the button; the risky count becomes its own
     link, so it is read out loud with its own label. */
  const buttonLabel = [t('home.nav.menu'), shown > 0 ? badgeLabel : '']
    .filter(Boolean)
    .join(' — ');
  const riskyText = riskyLabel || t('home.burger.riskyMany', { count: riskyShown });
  /* With a risky scenario open here, the pill says where it leads back to. */
  const riskyCloseText = riskyClosingLabel || t('home.burger.riskyBack');
  const riskyAria = riskyClosing ? `${riskyText} — ${riskyCloseText}` : riskyText;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus({ preventScroll: true });
    };
    const onDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (panel.current?.contains(node) || btn.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>('a, button');
    first?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <span className="burger-wrap">
        <button
          type="button"
          ref={btn}
          className={['burger', shown > 0 ? 'has-alert' : ''].filter(Boolean).join(' ')}
          aria-label={buttonLabel}
          aria-expanded={open}
          aria-controls="page-burger-panel"
          onClick={() => setOpen((prev) => !prev)}
        >
          <i className={open ? 'ri-close-line' : 'ri-menu-line'} aria-hidden="true" />
          {shown > 0 && (
            <span className="burger-badge" aria-hidden="true">
              {shown}
            </span>
          )}
        </button>
        {riskyShown > 0 &&
          (riskyTo ? (
            <Link
              to={riskyTo}
              className={[
                'burger-badge',
                'is-risk',
                'is-filter',
                riskyClosing ? 'is-closing' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={riskyAria}
              title={riskyClosing ? riskyCloseText : t('home.burger.riskyOpen')}
              onClick={() => {
                setOpen(false);
                riskyAction?.();
              }}
            >
              {riskyClosing && <i className="ri-close-line" aria-hidden="true" />}
              {riskyShown}
            </Link>
          ) : (
            <span className="burger-badge is-risk" aria-hidden="true">
              {riskyShown}
            </span>
          ))}
        {/* Les fiches à compléter, comptées sur le bouton lui-même : on les repère
            sans ouvrir le menu. Un clic mène au comparatif. */}
        {user && contactGaps > 0 && (
          <Link
            to="/sourcing"
            className="burger-badge is-contacts is-filter"
            aria-label={t('home.burger.contactsAria', { count: contactGaps })}
            title={t('home.burger.contactsHint', { count: contactGaps })}
            onClick={() => setOpen(false)}
          >
            {contactGaps}
          </Link>
        )}
        {/* Les adresses ramenées par le fichier : un clic ouvre le tableau de
            bord déjà filtré sur ces fiches. */}
        {user && importedTraces > 0 && (
          <Link
            to="/dashboard?filter=imported"
            className="burger-badge is-imported is-filter"
            aria-label={t('home.burger.importedAria', { count: importedTraces })}
            title={t('home.burger.importedHint', { count: importedTraces })}
            onClick={() => setOpen(false)}
          >
            {importedTraces}
          </Link>
        )}
        {/* Les réimports du jour, en petit à côté de la pastille des adresses
            importées : même lien, même filtre, un compteur plus fin. */}
        {user && importedTraces > 0 && importedToday > 0 && (
          <Link
            to="/dashboard?filter=imported"
            className="burger-badge is-imported-today is-filter"
            aria-label={t('home.burger.importedTodayAria', { count: importedToday })}
            title={t('home.burger.importedTodayHint', { count: importedToday })}
            onClick={() => setOpen(false)}
          >
            {importedToday}
          </Link>
        )}
        {/* La semaine, juste à côté du jour : même lien, même filtre, une
            lecture sur la durée plutôt que sur les dernières heures. */}
        {user && importedTraces > 0 && importedWeek > 0 && (
          <Link
            to="/dashboard?filter=imported"
            className="burger-badge is-imported-week is-filter"
            aria-label={t('home.burger.importedWeekAria', { count: importedWeek })}
            title={t('home.burger.importedWeekHint', { count: importedWeek })}
            onClick={() => setOpen(false)}
          >
            {importedWeek}
          </Link>
        )}
        {/* Une fiche importée sans nom de fournisseur : la pastille ouvre
            directement son champ de nom, plutôt que de le chercher à la main. */}
        {user && unnamed.count > 0 && unnamedTo !== null && (
          <Link
            to={unnamedTo}
            className={`burger-badge is-unnamed is-filter${unnamedCold !== null ? ' is-cold' : ''}${
              unnamedStale !== null ? ' is-stale' : ''
            }`}
            aria-label={unnamedLabel}
            title={unnamedHints === '' ? unnamedHint : `${unnamedHint} — ${unnamedHints}`}
            onClick={() => setOpen(false)}
          >
            {unnamed.count}
          </Link>
        )}
      </span>
      {open &&
        createPortal(
          <div className="nav-mobile" id="page-burger-panel" ref={panel}>
            {user && <>
            {lead}
            {traceless && (
              <div className="nav-mobile-traceless">
                <span className="nav-mobile-traceless-ico" aria-hidden="true">
                  <i className="ri-eye-off-line" />
                </span>
                <p className="nav-mobile-traceless-copy">
                  <b>{t('home.calcPage.traceless')}</b>
                  <em>{t('home.burger.tracelessHint')}</em>
                </p>
                <button
                  type="button"
                  className="nav-mobile-traceless-go"
                  aria-label={t('home.burger.tracelessCta')}
                  title={t('home.burger.tracelessCta')}
                  onClick={() => {
                    setOpen(false);
                    onTraceless?.();
                  }}
                >
                  <i className="ri-arrow-right-line" aria-hidden="true" />
                </button>
              </div>
            )}
            {reminder && (
              <div className="nav-mobile-note">
                <p className="nav-mobile-note-label">{reminder.label}</p>
                <p className="nav-mobile-note-text">
                  <b>{reminder.name}</b>
                  <span>{reminder.value}</span>
                </p>
                {reminder.meta && (
                  <p className="nav-mobile-note-meta">
                    <span>{reminder.meta.label}</span>
                    <b>{reminder.meta.value}</b>
                  </p>
                )}
                {reminder.verdict && (
                  <span className={`nav-mobile-note-verdict is-${reminder.verdict.tone}`}>
                    <i className={VERDICT_ICONS[reminder.verdict.tone]} aria-hidden="true" />
                    {reminder.verdict.label}
                  </span>
                )}
                <Link
                  to={reminder.to}
                  className="nav-mobile-note-cta"
                  onClick={() => {
                    setOpen(false);
                    onNoteSelect?.();
                  }}
                >
                  {reminder.cta}
                  <i className="ri-arrow-right-line" aria-hidden="true" />
                </Link>
              </div>
            )}
            {dueBook > 0 && (
              <Link
                to="/fournisseurs?filter=due"
                className="nav-mobile-due"
                title={t('home.burger.dueHint', { count: dueBook })}
                aria-label={t('home.burger.dueAria', { count: dueBook })}
                onClick={() => setOpen(false)}
              >
                <i className="ri-alarm-warning-line" aria-hidden="true" />
                <span className="nav-mobile-due-lab">{t('home.burger.dueOpen')}</span>
                <span className="nav-mobile-due-count" aria-hidden="true">
                  {dueBook}
                </span>
              </Link>
            )}
            {followUp > 0 && (
              <Link
                to="/dashboard?filter=relance"
                className="nav-mobile-relance"
                title={t('home.burger.relanceHint', { count: followUp })}
                aria-label={t('home.burger.relanceAria', { count: followUp })}
                onClick={() => setOpen(false)}
              >
                <i className="ri-mail-send-line" aria-hidden="true" />
                <span className="nav-mobile-relance-lab">
                  {t('home.burger.relanceOpen')}
                </span>
                <span className="nav-mobile-relance-count" aria-hidden="true">
                  {followUp}
                </span>
              </Link>
            )}
            {contactGaps > 0 && (
              <Link
                to="/sourcing"
                className="nav-mobile-contacts"
                title={t('home.burger.contactsHint', { count: contactGaps })}
                aria-label={t('home.burger.contactsAria', { count: contactGaps })}
                onClick={() => setOpen(false)}
              >
                <i className="ri-contacts-book-2-line" aria-hidden="true" />
                <span className="nav-mobile-relance-lab">
                  {t('home.burger.contactsOpen')}
                </span>
                <span className="nav-mobile-contacts-count" aria-hidden="true">
                  {contactGaps}
                </span>
              </Link>
            )}
            {importedTraces > 0 && (
              <Link
                to="/dashboard?filter=imported"
                className="nav-mobile-contacts nav-mobile-imported"
                title={t('home.burger.importedHint', { count: importedTraces })}
                aria-label={t('home.burger.importedAria', { count: importedTraces })}
                onClick={() => setOpen(false)}
              >
                <i className="ri-upload-2-line" aria-hidden="true" />
                <span className="nav-mobile-relance-lab">
                  {t('home.burger.importedOpen')}
                </span>
                {importedToday > 0 && (
                  <span
                    className="nav-mobile-imported-today"
                    title={t('home.burger.importedTodayHint', { count: importedToday })}
                  >
                    <i className="ri-time-line" aria-hidden="true" />
                    {t('home.burger.importedTodayTag', { count: importedToday })}
                  </span>
                )}
                {importedWeek > 0 && (
                  <span
                    className="nav-mobile-imported-week"
                    title={t('home.burger.importedWeekHint', { count: importedWeek })}
                  >
                    <i className="ri-calendar-2-line" aria-hidden="true" />
                    {t('home.burger.importedWeekTag', { count: importedWeek })}
                  </span>
                )}
                <span className="nav-mobile-contacts-count" aria-hidden="true">
                  {importedTraces}
                </span>
              </Link>
            )}
            {/* Les fiches importées qui attendent leur nom : la ligne du
                panneau dit combien, et ouvre la première à baptiser. */}
            {unnamed.count > 0 && unnamedTo !== null && (
              <Link
                to={unnamedTo}
                className="nav-mobile-contacts nav-mobile-unnamed"
                title={unnamedHint}
                aria-label={unnamedAria}
                onClick={() => setOpen(false)}
              >
                <i className="ri-price-tag-3-line" aria-hidden="true" />
                <span className="nav-mobile-relance-lab">
                  {t('home.burger.unnamedOpen')}
                </span>
                <span className="nav-mobile-contacts-count" aria-hidden="true">
                  {unnamed.count}
                </span>
              </Link>
            )}
            {/* Les trois premières fiches, nommées une par une : on ouvre
                directement celle qui nous intéresse, champ du nom prêt. */}
            {unnamed.count > 1 && unnamed.head.length > 0 && (
              <ul
                className="nav-mobile-unnamed-list"
                aria-label={t('home.burger.unnamedItemsLab')}
              >
                {unnamed.head.map((sheet) => {
                  const label = sheet.name !== '' ? sheet.name : `S${sheet.id}`;
                  const baseAria = t('home.burger.unnamedItemAria', { name: label });
                  /* L'âge se lit d'un coup d'œil à côté du nom : la fiche qui
                     attend depuis dix jours ne se confond pas avec celle de ce
                     matin, sans ouvrir le tableau de bord. */
                  const age = sheet.days;
                  const ageLabel =
                    age === null
                      ? ''
                      : age <= 0
                        ? t('home.burger.unnamedItemAgeToday')
                        : t('home.burger.unnamedItemAge', { count: age });
                  return (
                    <li key={sheet.id}>
                      <Link
                        to={`/calculateur?history=s${sheet.id}&baptise=1#calculator`}
                        className="nav-mobile-unnamed-item"
                        title={t('home.burger.unnamedItemHint')}
                        aria-label={
                          ageLabel === '' ? baseAria : `${baseAria} — ${ageLabel}`
                        }
                        onClick={() => setOpen(false)}
                      >
                        <i className="ri-edit-line" aria-hidden="true" />
                        <span className="nav-mobile-unnamed-name">{label}</span>
                        {ageLabel !== '' && (
                          <span
                            className={`nav-mobile-unnamed-age${
                              age !== null && age >= 10
                                ? ' is-cold'
                                : age !== null && age >= 3
                                  ? ' is-aging'
                                  : ''
                            }`}
                            title={t('home.burger.unnamedItemAgeHint', {
                              count: age ?? 0,
                            })}
                          >
                            {ageLabel}
                          </span>
                        )}
                        <i className="ri-arrow-right-line" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            </>}
            {items.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={['nav-mobile-pro', item.current ? 'is-current' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
              >
                <i className={item.icon} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <div className="nav-mobile-lang">
              <p className="nav-mobile-lab">{t('home.account.lang')}</p>
              <LangSwitch />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}