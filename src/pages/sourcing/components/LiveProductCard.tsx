import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { canCalculateProduct } from '../productMargin';
import type { SourcingProduct, SourcingRow } from '../productMargin';

type Props = {
  product: SourcingProduct;
  row?: SourcingRow;
  locale: string;
  onCompare: () => void;
  comparing: boolean;
  compareFull: boolean;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  onVerify: () => void;
  verificationEnabled: boolean;
  loading: boolean;
};

export default function LiveProductCard({ product, row, locale, onCompare, comparing, compareFull, onSave, saved, saving, onVerify, verificationEnabled, loading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [inputError, setInputError] = useState(false);
  const valid = Boolean(row) && canCalculateProduct(product);
  const status = valid ? 'concordant' : product.priceVerification === 'concordant' ? 'pending' : product.priceVerification ?? 'pending';
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: product.originalCurrency ?? 'EUR' });
  const detail = product.detailPrice;
  const hasDetail = detail !== null && detail !== undefined && Number.isFinite(detail) && detail > 0;
  const openManual = (price: number) => navigate(`/calculateur?manual=1&price=${encodeURIComponent(String(price * (product.exchangeRate ?? 1)))}#calculator`);
  const start = () => {
    if (valid && hasDetail) { openManual(detail); return; }
    setPriceInput(hasDetail ? String(detail) : '');
    setInputError(false);
    setConfirming(true);
  };
  return (
    <article className={`src-listing-card is-${status}`}>
      <div className="src-listing-media">
        {product.image ? <img src={product.image} alt={product.name} loading="lazy" /> :
          <i className="ri-image-line" aria-hidden="true" />}
        <span className="src-listing-rank">#{product.rank > 0 ? product.rank : '—'} · Amazon {product.market}</span>
      </div>
      <div className="src-listing-body">
        <span className="src-verification-badge">{t(`home.sourcing.verification.badge.${status}`)}</span>
        <h3 title={product.name}>{product.name}</h3>
        <p className="src-listing-reviews">
          <i className="ri-star-fill" aria-hidden="true" /> {product.rating > 0 ? product.rating.toFixed(1) : '—'}
          {' · '}{product.reviewCountKnown === false ? '—' : t('home.sourcing.reviews', { n: product.reviews })}
        </p>
        <div className="src-listing-price">
          <span>{t('home.sourcing.listing.mainPrice')}</span>
          <strong>{hasDetail ? money.format(detail) : '—'}</strong>
        </div>
        {!hasDetail && <p className="src-listing-status">{t('home.sourcing.listing.notLoaded')}</p>}
        <p className="src-listing-status">{t(`home.sourcing.verification.${status}`)}</p>
        {valid && row && (
          <p className="src-listing-simulation">
            {t('home.sourcing.listing.simulatedNet', {
              net: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(row.metrics.net),
            })}
          </p>
        )}
        <details className="src-listing-details">
          <summary>{t('home.sourcing.listing.details')}</summary>
          <dl>
            <div><dt>ASIN</dt><dd>{product.id.slice(3)}</dd></div>
            <div><dt>{t('home.sourcing.verification.listPrice')}</dt><dd>{money.format(product.originalPrice ?? product.price)}</dd></div>
            <div><dt>{t('home.sourcing.verification.detailPrice')}</dt><dd>{hasDetail ? money.format(detail) : '—'}</dd></div>
          </dl>
          {product.priceCheckedAt && <time dateTime={product.priceCheckedAt}>{new Intl.DateTimeFormat(locale, {
            dateStyle: 'short', timeStyle: 'short',
          }).format(new Date(product.priceCheckedAt))}</time>}
        </details>
        <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">{t('home.sourcing.sourceLink')}</a>
        <div className="src-listing-actions">
          {verificationEnabled && <button type="button" className="btn" disabled={loading} onClick={onVerify}>
            {t('home.sourcing.listing.fetchPrice')}
          </button>}
          <button type="button" className="btn" onClick={start}>{t('home.sourcing.listing.calculator')}</button>
          <button type="button" className="src-listing-compare" disabled={!valid || (compareFull && !comparing)} onClick={onCompare}>
            {t(comparing ? 'home.sourcing.listing.removeCompare' : 'home.sourcing.listing.compare')}
          </button>
          <button type="button" className="src-listing-compare" disabled={!valid || saved || saving} onClick={onSave}>
            {t(saved ? 'home.sourcing.listing.saved' : 'home.sourcing.listing.save')}
          </button>
        </div>
        {confirming && (
          <form className="src-listing-confirm" onSubmit={(event) => {
            event.preventDefault();
            const price = Number(priceInput.replace(',', '.'));
            if (!priceInput.trim() || !Number.isFinite(price) || price <= 0) { setInputError(true); return; }
            openManual(price);
          }}>
            <p>{t('home.sourcing.listing.confirmHelp')}</p>
            <label>
              {t('home.sourcing.listing.confirmPrice', { currency: product.originalCurrency ?? 'EUR' })}
              <input type="text" inputMode="decimal" value={priceInput} aria-invalid={inputError}
                onChange={(event) => { setPriceInput(event.target.value); setInputError(false); }} required />
            </label>
            {inputError && <p role="alert">{t('home.sourcing.listing.invalidPrice')}</p>}
            <button type="submit" className="btn">{t('home.sourcing.listing.confirm')}</button>
            <button type="button" onClick={() => setConfirming(false)}>{t('home.sourcing.listing.cancel')}</button>
          </form>
        )}
      </div>
    </article>
  );
}
