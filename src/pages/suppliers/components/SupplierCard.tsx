import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Supplier } from '@/pages/suppliers/supplierStore';
import { daysSinceContact, isComplete } from '@/pages/suppliers/supplierStore';
import type { SupplierDraft } from '@/pages/suppliers/supplierDraft';

type Props = {
  supplier: Supplier;
  locale: string;
  scenarioNames: Record<number, string>;
  /** Le message type du sourcing, prêt à partir — ou null s'il manque de quoi l'écrire. */
  draft: SupplierDraft | null;
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
  onContacted: (supplier: Supplier) => void;
  /** Le message part : l'échange se date tout seul, sans second clic. */
  onWritten: (supplier: Supplier) => void;
  onFollowUp: (supplier: Supplier, value: boolean) => void;
  /** La fiche visée par Alt + Suppr : celle qu'on a au clavier. */
  isSelected?: boolean;
  /** La fiche a reçu le focus ou le clic : elle devient la sélection. */
  onSelect?: (supplier: Supplier) => void;
  /** Le seuil de référence : au-delà, la fiche porte sa pastille « + 45 j »,
   *  même quand le filtre de délai est retiré. */
  leadFloor: number;
};

/** Une fiche fournisseur : le contact, les conditions, les scénarios qu'elle
 *  sert, et l'état de la relance — tout visible sans ouvrir de formulaire. */
export default function SupplierCard({
  supplier,
  locale,
  scenarioNames,
  draft,
  onEdit,
  onDelete,
  onContacted,
  onWritten,
  onFollowUp,
  leadFloor,
  isSelected = false,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  /* Copie de l'adresse : le retour se lit sur le bouton, deux secondes. */
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle');

  const { eur, dayNumber, dateFmt, ago } = useMemo(() => {
    const money = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    });
    const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    return {
      eur: (value: number) => money.format(value),
      dayNumber: (value: number) => numbers.format(value),
      dateFmt: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
      ago: (value: number) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-value, 'day'),
    };
  }, [locale]);

  const since = daysSinceContact(supplier);
  const complete = isComplete(supplier);
  const hasEmail = supplier.email.trim() !== '';
  /* La fiche dépasse-t-elle le seuil de délai de référence ? */
  const isSlow = leadFloor > 0 && supplier.leadDays > leadFloor;

  const copyAddress = async () => {
    const address = supplier.email.trim();
    if (address === '') return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(address);
      setCopyState('done');
    } catch {
      setCopyState('fail');
    }
    window.setTimeout(() => setCopyState('idle'), 2400);
  };
  const initials = supplier.name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const attached = supplier.scenarioIds
    .map((id) => ({ id, name: scenarioNames[id] }))
    .filter((entry): entry is { id: number; name: string } => typeof entry.name === 'string');

  return (
    <article
      className={`sup-card${supplier.followUp ? ' is-due' : ''}${
        isSelected ? ' is-selected' : ''
      }`}
      data-sup-id={supplier.id}
      onFocusCapture={() => onSelect?.(supplier)}
      onPointerDown={() => onSelect?.(supplier)}
    >
      <div className="sup-head">
        <span className="sup-ava" aria-hidden="true">
          {initials === '' ? <i className="ri-store-2-line" /> : initials}
        </span>
        <div className="sup-id">
          <h3>{supplier.name}</h3>
          <p className="sup-country">
            <i className="ri-map-pin-2-line" aria-hidden="true" />
            {supplier.country === '' ? t('home.suppliers.unknown') : supplier.country}
          </p>
        </div>
        <div className="sup-flags">
          {isSlow && (
            <span
              className="sup-flag is-slow"
              title={t('home.suppliers.leadBadgeHint', { value: leadFloor })}
            >
              <i className="ri-hourglass-line" aria-hidden="true" />
              {t('home.suppliers.leadBadge', { value: leadFloor })}
            </span>
          )}
          {supplier.followUp && (
            <span className="sup-flag is-due">
              <i className="ri-mail-send-line" aria-hidden="true" />
              {t('home.suppliers.followUpTag')}
            </span>
          )}
          {!complete && (
            <span className="sup-flag is-todo">
              <i className="ri-error-warning-line" aria-hidden="true" />
              {t('home.suppliers.todoTag')}
            </span>
          )}
        </div>
      </div>

      <div className="sup-contact">
        {hasEmail ? (
          <a className="sup-mail" href={`mailto:${supplier.email}`}>
            <i className="ri-mail-line" aria-hidden="true" />
            <span>{supplier.email}</span>
          </a>
        ) : (
          <p className="sup-mail is-empty">
            <i className="ri-mail-forbid-line" aria-hidden="true" />
            {t('home.suppliers.noEmail')}
          </p>
        )}
        <button
          type="button"
          className={`sup-copy${copyState === 'done' ? ' is-done' : ''}${
            copyState === 'fail' ? ' is-fail' : ''
          }`}
          onClick={copyAddress}
          disabled={!hasEmail}
          title={
            hasEmail ? t('home.suppliers.copyAddrHint') : t('home.suppliers.copyAddrNoEmail')
          }
          aria-label={t('home.suppliers.copyAddrAria', { name: supplier.name })}
        >
          <i
            className={
              copyState === 'done'
                ? 'ri-check-line'
                : copyState === 'fail'
                  ? 'ri-error-warning-line'
                  : 'ri-file-copy-line'
            }
            aria-hidden="true"
          />
          <span aria-live="polite">
            {t(
              copyState === 'done'
                ? 'home.suppliers.copyAddrDone'
                : copyState === 'fail'
                  ? 'home.suppliers.copyAddrFail'
                  : 'home.suppliers.copyAddr',
            )}
          </span>
        </button>
      </div>

      <div className="sup-stats">
        <div>
          <span>{t('home.suppliers.lead')}</span>
          <b>
            {supplier.leadDays > 0
              ? t('home.suppliers.daysValue', { value: dayNumber(supplier.leadDays) })
              : '—'}
          </b>
        </div>
        <div>
          <span>{t('home.suppliers.moq')}</span>
          <b>{supplier.moq > 0 ? dayNumber(supplier.moq) : '—'}</b>
        </div>
        <div>
          <span>{t('home.suppliers.unitPrice')}</span>
          <b>{supplier.unitPrice > 0 ? eur(supplier.unitPrice) : '—'}</b>
        </div>
      </div>

      <div className="sup-linked">
        <span className="sup-linked-lab">
          <i className="ri-link" aria-hidden="true" />
          {t('home.suppliers.linked')}
        </span>
        {attached.length === 0 ? (
          <span className="sup-linked-none">{t('home.suppliers.linkedNone')}</span>
        ) : (
          <ul className="sup-chips">
            {attached.map((entry) => (
              <li key={entry.id}>{entry.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="sup-foot">
        <p className="sup-last">
          <i className={supplier.lastContact === null ? 'ri-time-line' : 'ri-checkbox-circle-line'} aria-hidden="true" />
          {since === null
            ? t('home.suppliers.neverContacted')
            : t('home.suppliers.lastContact', {
                date: dateFmt.format(new Date(supplier.lastContact ?? Date.now())),
                ago: ago(since),
              })}
        </p>

        {confirming ? (
          <div className="sup-confirm" role="group" aria-label={t('home.suppliers.deleteAsk')}>
            <span>{t('home.suppliers.deleteAsk')}</span>
            <button
              type="button"
              className="sup-mini is-danger"
              onClick={() => {
                setConfirming(false);
                onDelete(supplier);
              }}
            >
              {t('home.suppliers.deleteYes')}
            </button>
            <button type="button" className="sup-mini" onClick={() => setConfirming(false)}>
              {t('home.suppliers.deleteNo')}
            </button>
          </div>
        ) : (
          <div className="sup-actions">
            {draft ? (
              <a
                className="sup-write"
                href={draft.href}
                title={t('home.suppliers.writeDatedHint', { sheet: draft.sheet })}
                aria-label={t('home.suppliers.writeAria', { name: supplier.name })}
                onClick={() => onWritten(supplier)}
              >
                <i className="ri-quill-pen-line" aria-hidden="true" />
                {t('home.suppliers.write')}
              </a>
            ) : (
              <button
                type="button"
                className="sup-write is-off"
                disabled
                title={t(
                  supplier.email.trim() === ''
                    ? 'home.suppliers.writeNoEmail'
                    : 'home.suppliers.writeNoSheet',
                )}
              >
                <i className="ri-quill-pen-line" aria-hidden="true" />
                {t('home.suppliers.write')}
              </button>
            )}
            <button
              type="button"
              className="sup-icon-btn"
              onClick={() => onContacted(supplier)}
              title={t('home.suppliers.markSentHint')}
              aria-label={t('home.suppliers.markSentAria', { name: supplier.name })}
            >
              <i className="ri-send-plane-line" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`sup-icon-btn${supplier.followUp ? ' is-on' : ''}`}
              onClick={() => onFollowUp(supplier, !supplier.followUp)}
              title={t(supplier.followUp ? 'home.suppliers.followUpOffHint' : 'home.suppliers.followUpOnHint')}
              aria-pressed={supplier.followUp}
              aria-label={t('home.suppliers.followUpAria', { name: supplier.name })}
            >
              <i className={supplier.followUp ? 'ri-alarm-warning-fill' : 'ri-alarm-warning-line'} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sup-icon-btn"
              onClick={() => onEdit(supplier)}
              title={t('home.suppliers.edit')}
              aria-label={t('home.suppliers.editAria', { name: supplier.name })}
            >
              <i className="ri-pencil-line" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sup-icon-btn is-danger"
              onClick={() => setConfirming(true)}
              title={t('home.suppliers.delete')}
              aria-label={t('home.suppliers.deleteAria', { name: supplier.name })}
            >
              <i className="ri-delete-bin-6-line" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {supplier.note !== '' && <p className="sup-note">{supplier.note}</p>}
    </article>
  );
}