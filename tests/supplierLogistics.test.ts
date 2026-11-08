import { describe, expect, it } from 'vitest';
import { buildCarnetJson, parseCarnetJson } from '@/pages/suppliers/carnetJson';
import { buildSuppliersCsv } from '@/pages/suppliers/supplierCsv';
import { createSupplier, emptySupplierLogistics, readSupplier } from '@/pages/suppliers/supplierStore';

const logistics = {
  packaging: 'Carton; renforcé',
  unitsPerPackage: 24,
  packagingPerUnit: 0,
  shippingMethod: 'Maritime',
  shippingPerUnit: 1.25,
  incoterm: 'FOB Shenzhen',
  customsPercent: 4.5,
};

describe('supplier logistics', () => {
  it('keeps existing supplier records compatible', () => {
    const old = { ...createSupplier(), name: 'Fournisseur' };
    expect(readSupplier(old)?.logistics).toEqual(emptySupplierLogistics());
  });

  it('preserves logistics and zero-valued costs when restoring a backup', () => {
    const supplier = { ...createSupplier(), name: 'Fournisseur', logistics };
    const backup = buildCarnetJson({
      suppliers: [supplier], views: [],
      settings: { lead: 0, leadRef: 0, sort: 'name', filter: 'all', order: 'saved', orderPin: 'top', lastView: '' },
    });
    expect(parseCarnetJson(backup)?.suppliers[0].logistics).toEqual(logistics);
  });

  it('rejects invalid quantities and costs in imported records', () => {
    const supplier = readSupplier({
      ...createSupplier(), name: 'Fournisseur',
      logistics: { unitsPerPackage: -1, shippingPerUnit: -2, packagingPerUnit: 'bad', customsPercent: 101 },
    });
    expect(supplier?.logistics).toEqual(emptySupplierLogistics());
  });

  it('includes the details and explicit zero amounts in the CSV', () => {
    const supplier = { ...createSupplier(), name: 'Fournisseur', logistics };
    const csv = buildSuppliersCsv([supplier], 'fr-FR', (key) => key, {}, new Intl.DateTimeFormat('fr-FR'));
    expect(csv).toContain('"Carton; renforcé";24;0;Maritime;1,25;FOB Shenzhen;4,5');
    expect(csv).toContain('home.suppliers.shippingPerUnit');
  });
});
