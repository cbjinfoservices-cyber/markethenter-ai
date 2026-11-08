import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeFormatters } from '@/pages/home/calcModel';
import type { PendingListing } from '@/pages/sourcing/useSourcingCatalog';

type Props = {
  entry: PendingListing;
  locale: string;
  onSave: (price: number) => void;
};

export default function PriceReviewCard({ entry, locale, onSave }: Props) {
  const { t } = useTranslation();
  const { eur } = useMemo(() => makeFormatters(locale), [locale]);
  const [value, setValue] = useState('');
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  return (
    <article className="src-card is-bad src-review">
      <div className="src-media">
        <img className="src-media-img" src={entry.image} alt={entry.title} title={entry.title} />
      </div>
      <div className="src-body">
        <h3 title={entry.title}>{entry.title}</h3>
        <p className="src-review-received">
          {t('home.sourcing.priceReceived', { value: eur(entry.listedPrice) })}
        </p>
        <form
          className="src-review-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onSave(parsed);
          }}
        >
          <label>
            <span>{t('home.sourcing.priceManualLabel')}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={value}
              placeholder="—"
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!valid}>
            {t('home.sourcing.priceManualSave')}
          </button>
        </form>
        {entry.sourceUrl && (
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t('home.sourcing.amazonLink')}
          </a>
        )}
      </div>
    </article>
  );
}
