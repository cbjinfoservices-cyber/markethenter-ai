import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Supplier } from '@/pages/suppliers/supplierStore';

type ScenarioOption = { id: number; name: string };

type Props = {
  supplier: Supplier;
  scenarios: ScenarioOption[];
  onCancel: () => void;
  onSave: (supplier: Supplier) => void;
};

const emailLooksReal = (value: string): boolean =>
  value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/** La fiche s'ouvre dans une boîte : on remplit le contact et les conditions,
 *  on coche les scénarios que ce fournisseur sert, et on referme. */
export default function SupplierDialog({ supplier, scenarios, onCancel, onSave }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(supplier.name);
  const [country, setCountry] = useState(supplier.country);
  const [email, setEmail] = useState(supplier.email);
  const [leadDays, setLeadDays] = useState(supplier.leadDays > 0 ? String(supplier.leadDays) : '');
  const [moq, setMoq] = useState(supplier.moq > 0 ? String(supplier.moq) : '');
  const [unitPrice, setUnitPrice] = useState(
    supplier.unitPrice > 0 ? String(supplier.unitPrice) : '',
  );
  const [note, setNote] = useState(supplier.note);
  const [linked, setLinked] = useState<number[]>(supplier.scenarioIds);
  const [error, setError] = useState<string | null>(null);

  const panel = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const countryId = useId();
  const emailId = useId();
  const leadId = useId();
  const moqId = useId();
  const priceId = useId();
  const noteId = useId();
  const titleId = useId();

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggleLinked = (id: number) => {
    setLinked((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const submit = () => {
    const cleanName = name.trim();
    if (cleanName === '') {
      setError(t('home.suppliers.errorName'));
      return;
    }
    if (!emailLooksReal(email.trim().toLowerCase())) {
      setError(t('home.suppliers.errorEmail'));
      return;
    }
    const number = (value: string) => {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
    };
    onSave({
      ...supplier,
      name: cleanName.slice(0, 48),
      country: country.trim().slice(0, 32),
      email: email.trim().toLowerCase().slice(0, 80),
      leadDays: number(leadDays),
      moq: number(moq),
      unitPrice: number(unitPrice),
      note: note.trim().slice(0, 240),
      scenarioIds: linked,
    });
  };

  return (
    <div
      className="sup-dialog-wrap"
      role="presentation"
      onMouseDown={(event) => {
        if (!panel.current?.contains(event.target as Node)) onCancel();
      }}
    >
      <div className="sup-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <div className="sup-dialog-head">
          <h2 id={titleId}>
            <i className="ri-store-2-line" aria-hidden="true" />
            {supplier.name === '' ? t('home.suppliers.addTitle') : t('home.suppliers.editTitle')}
          </h2>
          <button
            type="button"
            className="sup-x"
            onClick={onCancel}
            aria-label={t('home.palette.close')}
          >
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>

        <form
          className="sup-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="sup-field">
            <label htmlFor={nameId}>{t('home.suppliers.fieldName')}</label>
            <input
              id={nameId}
              ref={firstField}
              className="sup-input"
              type="text"
              value={name}
              maxLength={48}
              placeholder={t('home.suppliers.fieldNamePh')}
              onChange={(event) => setName(event.target.value)}
              autoComplete="organization"
            />
          </div>

          <div className="sup-field">
            <label htmlFor={countryId}>{t('home.suppliers.fieldCountry')}</label>
            <input
              id={countryId}
              className="sup-input"
              type="text"
              value={country}
              maxLength={32}
              placeholder={t('home.suppliers.fieldCountryPh')}
              onChange={(event) => setCountry(event.target.value)}
              autoComplete="country-name"
            />
          </div>

          <div className="sup-field is-wide">
            <label htmlFor={emailId}>{t('home.suppliers.fieldEmail')}</label>
            <input
              id={emailId}
              className="sup-input"
              type="email"
              value={email}
              maxLength={80}
              placeholder="contact@fournisseur.com"
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="sup-field">
            <label htmlFor={leadId}>{t('home.suppliers.fieldLead')}</label>
            <input
              id={leadId}
              className="sup-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              value={leadDays}
              placeholder="35"
              onChange={(event) => setLeadDays(event.target.value)}
            />
          </div>

          <div className="sup-field">
            <label htmlFor={moqId}>{t('home.suppliers.fieldMoq')}</label>
            <input
              id={moqId}
              className="sup-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={moq}
              placeholder="500"
              onChange={(event) => setMoq(event.target.value)}
            />
          </div>

          <div className="sup-field">
            <label htmlFor={priceId}>{t('home.suppliers.fieldPrice')}</label>
            <input
              id={priceId}
              className="sup-input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={unitPrice}
              placeholder="4.50"
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          </div>

          <div className="sup-field is-wide">
            <span className="sup-field-lab">{t('home.suppliers.fieldLinked')}</span>
            {scenarios.length === 0 ? (
              <p className="sup-field-note">{t('home.suppliers.noScenario')}</p>
            ) : (
              <ul className="sup-picks">
                {scenarios.map((scenario) => (
                  <li key={scenario.id}>
                    <button
                      type="button"
                      className={`sup-pick${linked.includes(scenario.id) ? ' is-on' : ''}`}
                      onClick={() => toggleLinked(scenario.id)}
                      aria-pressed={linked.includes(scenario.id)}
                    >
                      <i
                        className={linked.includes(scenario.id) ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}
                        aria-hidden="true"
                      />
                      {scenario.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sup-field is-wide">
            <label htmlFor={noteId}>{t('home.suppliers.fieldNote')}</label>
            <textarea
              id={noteId}
              className="sup-input sup-textarea"
              value={note}
              maxLength={240}
              rows={2}
              placeholder={t('home.suppliers.fieldNotePh')}
              onChange={(event) => setNote(event.target.value)}
            />
            <span className="sup-char-count">{note.length}/240</span>
          </div>

          {error !== null && (
            <p className="sup-form-error" role="alert">
              <i className="ri-error-warning-line" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="sup-form-actions">
            <button type="button" className="btn sup-btn-ghost" onClick={onCancel}>
              {t('home.suppliers.cancel')}
            </button>
            <button type="submit" className="btn">
              <i className="ri-save-3-line" aria-hidden="true" />
              {t('home.suppliers.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}