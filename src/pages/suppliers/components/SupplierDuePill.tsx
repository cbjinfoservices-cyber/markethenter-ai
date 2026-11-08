import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSupplierDueCount } from '@/pages/suppliers/supplierDue';
import '@/pages/suppliers/duePill.css';

/**
 * Le compteur des relances du carnet, dans l'en-tête des autres pages.
 *
 * Il ouvre le carnet déjà filtré sur les fiches à relancer, comme la pastille
 * des fournisseurs au-dessus du seuil ouvre le calculateur sur leur historique.
 */
export default function SupplierDuePill() {
  const { t } = useTranslation();
  const count = useSupplierDueCount();

  if (count <= 0) return null;

  const label = t(
    count > 1 ? 'home.suppliers.duePillMany' : 'home.suppliers.duePillOne',
    { count },
  );

  return (
    <Link
      to="/fournisseurs?filter=due"
      className="nav-due"
      title={t('home.suppliers.duePillHint')}
      aria-label={label}
    >
      <i className="ri-alarm-warning-line" aria-hidden="true" />
      <b>{count}</b>
      <span className="nav-due-lab">{t('home.suppliers.duePillLab')}</span>
    </Link>
  );
}