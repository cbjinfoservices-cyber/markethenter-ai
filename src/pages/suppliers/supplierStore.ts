import { loadScenarios } from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';
import {
  SECOND_SUFFIX,
  loadSupplierEmails,
  loadSupplierNames,
} from '@/pages/home/priceHistory';

export type SupplierLogistics = {
  packaging: string;
  unitsPerPackage: number | null;
  packagingPerUnit: number | null;
  shippingMethod: string;
  shippingPerUnit: number | null;
  incoterm: string;
  customsPercent: number | null;
};

export function emptySupplierLogistics(): SupplierLogistics {
  return {
    packaging: '', unitsPerPackage: null, packagingPerUnit: null,
    shippingMethod: '', shippingPerUnit: null, incoterm: '', customsPercent: null,
  };
}

/** Une fiche fournisseur : ce qu'on sait d'un contact, sans passer par le
 *  calculateur. Les scénarios d'achat restent la source des chiffres ; ici on
 *  garde le contact, le délai, la quantité minimum et l'état de la relance. */
export type Supplier = {
  id: string;
  name: string;
  country: string;
  email: string;
  /** Délai annoncé entre la commande et la réception, en jours (0 = inconnu). */
  leadDays: number;
  /** Quantité minimum de commande (0 = inconnue). */
  moq: number;
  /** Prix unitaire indicatif du dernier devis (0 = inconnu). */
  unitPrice: number;
  logistics?: SupplierLogistics;
  /** Les fiches d'achat auxquelles ce fournisseur est rattaché. */
  scenarioIds: number[];
  /** Horodatage du dernier échange, null s'il n'a jamais été contacté. */
  lastContact: number | null;
  /** Une relance est due : la fiche remonte en tête de liste. */
  followUp: boolean;
  note: string;
  createdAt: number;
};

const STORAGE_KEY = 'mh:suppliers';
/* Lu aussi par la pastille d'en-tête des autres pages, qui ne doit pas
   réveiller le carnet ni le réensemencer pour compter trois relances. */
export const SUPPLIERS_STORAGE_KEY = STORAGE_KEY;
export const SUPPLIERS_EVENT = 'mh:suppliers:changed';

const MAX_SUPPLIERS = 80;
const slice = (value: string, max: number) => value.trim().slice(0, max);

const toNumber = (value: unknown, max = 999999): number => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(max, Math.round(number * 100) / 100);
};

function optionalNumber(value: unknown, max: number, integer = false): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) return null;
  return integer ? parsed : Math.round(parsed * 100) / 100;
}

export function readSupplierLogistics(raw: unknown): SupplierLogistics {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySupplierLogistics();
  const entry = raw as Record<string, unknown>;
  return {
    packaging: typeof entry.packaging === 'string' ? slice(entry.packaging, 120) : '',
    unitsPerPackage: optionalNumber(entry.unitsPerPackage, 1000000, true) || null,
    packagingPerUnit: optionalNumber(entry.packagingPerUnit, 100000),
    shippingMethod: typeof entry.shippingMethod === 'string' ? slice(entry.shippingMethod, 80) : '',
    shippingPerUnit: optionalNumber(entry.shippingPerUnit, 100000),
    incoterm: typeof entry.incoterm === 'string' ? slice(entry.incoterm, 32) : '',
    customsPercent: optionalNumber(entry.customsPercent, 100),
  };
}

function makeId(): string {
  return `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Relit une fiche, d'où qu'elle vienne : du stockage local ou d'une
 *  sauvegarde complète relue à la main. */
export function readSupplier(raw: unknown): Supplier | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const name = typeof entry.name === 'string' ? slice(entry.name, 48) : '';
  if (name === '') return null;
  const scenarioIds = Array.isArray(entry.scenarioIds)
    ? entry.scenarioIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const lastContact = Number(entry.lastContact);
  return {
    id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : makeId(),
    name,
    country: typeof entry.country === 'string' ? slice(entry.country, 32) : '',
    email: typeof entry.email === 'string' ? slice(entry.email, 80).toLowerCase() : '',
    leadDays: toNumber(entry.leadDays, 400),
    moq: toNumber(entry.moq, 1000000),
    unitPrice: toNumber(entry.unitPrice, 100000),
    logistics: readSupplierLogistics(entry.logistics),
    scenarioIds: Array.from(new Set(scenarioIds)).slice(0, 12),
    lastContact: Number.isFinite(lastContact) && lastContact > 0 ? lastContact : null,
    followUp: entry.followUp === true,
    note: typeof entry.note === 'string' ? entry.note.slice(0, 240) : '',
    createdAt: Number.isFinite(Number(entry.createdAt))
      ? Number(entry.createdAt)
      : Date.now(),
  };
}

function scenarioLabel(scenario: Scenario, index: number): string {
  const typed = scenario.name.trim();
  return typed !== '' ? typed : `Scenario ${String.fromCharCode(65 + index)}`;
}

/** Les fournisseurs déjà nommés dans les scénarios du calculateur : de quoi
 *  ouvrir une liste qui parle du vrai travail du vendeur, pas d'un vide. */
export function suppliersFromScenarios(): Supplier[] {
  const scenarios = loadScenarios();
  if (scenarios.length === 0) return [];
  const names = loadSupplierNames();
  const emails = loadSupplierEmails();
  const out: Supplier[] = [];
  const seen = new Set<string>();

  scenarios.forEach((scenario, index) => {
    const baseKey = `s${scenario.id}`;
    const label = scenarioLabel(scenario, index);
    const slots: { key: string; side: string }[] = [
      { key: baseKey, side: 'A' },
      { key: `${baseKey}${SECOND_SUFFIX}`, side: 'B' },
    ];

    slots.forEach((slot) => {
      const typed = (names[slot.key] ?? '').trim();
      const email = (emails[slot.key] ?? '').trim();
      if (typed === '' && email === '') return;
      const name = typed !== '' ? typed : `${label} · ${slot.side}`;
      const signature = `${name.toLowerCase()}|${email}`;
      if (seen.has(signature)) {
        const existing = out.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (existing && !existing.scenarioIds.includes(scenario.id)) {
          existing.scenarioIds = [...existing.scenarioIds, scenario.id];
        }
        return;
      }
      seen.add(signature);
      out.push({
        id: `seed-s${scenario.id}${slot.side === 'B' ? 'b' : ''}`,
        name,
        country: '',
        email,
        leadDays: 0,
        moq: 0,
        unitPrice: 0,
        scenarioIds: [scenario.id],
        lastContact: null,
        followUp: false,
        note: '',
        createdAt: Date.now(),
      });
    });
  });

  return out.slice(0, MAX_SUPPLIERS);
}

export function loadSuppliers(): Supplier[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      /* Première visite : on reprend les noms déjà saisis dans les scénarios,
         au lieu d'ouvrir sur une page vide. */
      const seeds = suppliersFromScenarios();
      if (seeds.length > 0) persistSuppliers(seeds);
      return seeds;
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const out: Supplier[] = [];
    parsed.forEach((entry) => {
      const supplier = readSupplier(entry);
      if (supplier) out.push(supplier);
    });
    return out.slice(0, MAX_SUPPLIERS);
  } catch {
    return [];
  }
}

export function persistSuppliers(list: Supplier[]): Supplier[] {
  const clean = list.slice(0, MAX_SUPPLIERS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new Event(SUPPLIERS_EVENT));
  } catch {
    /* stockage bloqué : la liste reste valable pour cette visite */
  }
  return clean;
}

/** Ajoute ou remplace une fiche, en gardant la liste triée par nom. */
export function saveSupplier(supplier: Supplier): Supplier[] {
  const list = loadSuppliers();
  const index = list.findIndex((item) => item.id === supplier.id);
  const next = index >= 0
    ? list.map((item) => (item.id === supplier.id ? supplier : item))
    : [...list, supplier];
  return persistSuppliers(next);
}

export function removeSupplier(id: string): Supplier[] {
  return persistSuppliers(loadSuppliers().filter((item) => item.id !== id));
}

export function createSupplier(): Supplier {
  return {
    id: makeId(),
    name: '',
    country: '',
    email: '',
    leadDays: 0,
    moq: 0,
    unitPrice: 0,
    scenarioIds: [],
    lastContact: null,
    followUp: false,
    note: '',
    createdAt: Date.now(),
  };
}

/** Un échange vient d'avoir lieu : la date se pose et la relance retombe. */
export function markContacted(id: string, at = Date.now()): Supplier[] {
  return persistSuppliers(
    loadSuppliers().map((item) =>
      item.id === id ? { ...item, lastContact: at, followUp: false } : item,
    ),
  );
}

/** Une relance est due, ou n'est plus due. */
export function setFollowUp(id: string, value: boolean): Supplier[] {
  return persistSuppliers(
    loadSuppliers().map((item) => (item.id === id ? { ...item, followUp: value } : item)),
  );
}

export function attachScenario(id: string, scenarioId: number, value: boolean): Supplier[] {
  return persistSuppliers(
    loadSuppliers().map((item) => {
      if (item.id !== id) return item;
      const already = item.scenarioIds.includes(scenarioId);
      if (value === already) return item;
      return {
        ...item,
        scenarioIds: value
          ? [...item.scenarioIds, scenarioId]
          : item.scenarioIds.filter((entry) => entry !== scenarioId),
      };
    }),
  );
}

/** La fiche est complète quand on peut vraiment la contacter et la chiffrer. */
export function isComplete(supplier: Supplier): boolean {
  return (
    supplier.name.trim() !== '' &&
    supplier.country.trim() !== '' &&
    supplier.email.trim() !== '' &&
    supplier.leadDays > 0 &&
    supplier.moq > 0
  );
}

/** Jours écoulés depuis le dernier échange, null si aucun. */
export function daysSinceContact(supplier: Supplier, now = Date.now()): number | null {
  if (supplier.lastContact === null) return null;
  const days = Math.floor((now - supplier.lastContact) / 86400000);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}