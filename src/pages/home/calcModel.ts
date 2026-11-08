export type FieldKey =
  | 'supplier'
  | 'shipping'
  | 'packaging'
  | 'customs'
  | 'amazon'
  | 'fba'
  | 'ppc'
  | 'returns'
  | 'price'
  | 'units'
  | 'vat';

export type Values = Record<FieldKey, string>;

export type Scenario = {
  id: number;
  name: string;
  values: Values;
};

export const FIELDS: { key: FieldKey; unit: string; step: number; max?: number }[] = [
  { key: 'supplier', unit: '€', step: 0.05 },
  { key: 'shipping', unit: '€', step: 0.05 },
  { key: 'packaging', unit: '€', step: 0.05 },
  { key: 'customs', unit: '%', step: 0.5, max: 40 },
  { key: 'amazon', unit: '%', step: 0.5, max: 45 },
  { key: 'fba', unit: '€', step: 0.05 },
  { key: 'ppc', unit: '€', step: 0.05 },
  { key: 'returns', unit: '%', step: 0.5, max: 40 },
  { key: 'vat', unit: '%', step: 0.5, max: 30 },
  { key: 'price', unit: '€', step: 0.5 },
  { key: 'units', unit: '/m', step: 10 },
];

export const FIELD_KEYS: FieldKey[] = FIELDS.map((f) => f.key);

/** Order used by links shared before the VAT field existed. */
const LEGACY_FIELD_KEYS: FieldKey[] = [
  'supplier',
  'shipping',
  'packaging',
  'customs',
  'amazon',
  'fba',
  'ppc',
  'returns',
  'price',
  'units',
];

export const INITIAL: Values = {
  supplier: '4.50',
  shipping: '1.20',
  packaging: '0.35',
  customs: '5',
  amazon: '15',
  fba: '3.60',
  ppc: '1.40',
  returns: '6',
  price: '19.99',
  units: '300',
  vat: '20',
};

export const num = (value: string): number => {
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const blankCalculation = (): Values =>
  Object.fromEntries(FIELD_KEYS.map((key) => [key, ''])) as Values;

/** Strict parse: blank, partial numbers and non-finite values yield NaN. */
const strictNumber = (value: string): number => {
  const text = String(value).trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
};

/**
 * Fields a manual calculation must fill in before it is presented. Blank fields
 * are never read as zero, and the price must be strictly positive.
 */
export function incompleteCalculationFields(values: Values): FieldKey[] {
  return FIELDS.filter(({ key, max }) => {
    const n = strictNumber(values[key]);
    if (!Number.isFinite(n) || n < 0) return true;
    if (max !== undefined && n > max) return true;
    return key === 'price' && n === 0;
  }).map((f) => f.key);
}

/** Builds a blank calculation with only the manually confirmed price filled in. */
export function manualCalculation(search: string): { values: Values; invalidPrice: boolean } {
  const raw = new URLSearchParams(search).get('price') ?? '';
  const price = strictNumber(raw);
  if (!Number.isFinite(price) || price <= 0) {
    return { values: blankCalculation(), invalidPrice: true };
  }
  return { values: { ...blankCalculation(), price: String(price) }, invalidPrice: false };
}


export type Metrics = {
  price: number;
  landed: number;
  totalCost: number;
  net: number;
  netMargin: number;
  grossMargin: number;
  roi: number;
  monthly: number;
  costPct: number;
  profitPct: number;
  priceHT: number;
  vatAmount: number;
  netHT: number;
  netMarginHT: number;
  roiHT: number;
};

export function compute(raw: Values): Metrics {
  const v = {
    supplier: num(raw.supplier),
    shipping: num(raw.shipping),
    packaging: num(raw.packaging),
    customs: num(raw.customs),
    amazon: num(raw.amazon),
    fba: num(raw.fba),
    ppc: num(raw.ppc),
    returns: num(raw.returns),
    price: num(raw.price),
    units: num(raw.units),
    vat: num(raw.vat),
  };

  const landed = v.supplier + v.shipping + v.packaging + (v.supplier + v.shipping) * (v.customs / 100);
  const amazonFee = v.price * (v.amazon / 100);
  const returnCost = v.price * (v.returns / 100);
  const operatingCosts = landed + amazonFee + v.fba + v.ppc + returnCost;

  const vatRate = Math.min(100, Math.max(0, v.vat)) / 100;
  const priceHT = v.price / (1 + vatRate);
  const vatAmount = v.price - priceHT;
  const net = priceHT - operatingCosts;
  const totalCost = operatingCosts + vatAmount;
  const costPct = v.price > 0 ? Math.min(100, Math.max(0, (totalCost / v.price) * 100)) : 0;

  return {
    price: v.price,
    landed,
    totalCost,
    net,
    netMargin: v.price > 0 ? (net / v.price) * 100 : 0,
    grossMargin: v.price > 0 ? ((v.price - landed) / v.price) * 100 : 0,
    roi: landed > 0 ? (net / landed) * 100 : 0,
    monthly: net * v.units,
    costPct,
    profitPct: Math.max(0, 100 - costPct),
    priceHT,
    vatAmount,
    netHT: net,
    netMarginHT: priceHT > 0 ? (net / priceHT) * 100 : 0,
    roiHT: landed > 0 ? (net / landed) * 100 : 0,
  };
}

export function encodeValues(raw: Values): string {
  return FIELD_KEYS.map((key) => String(num(raw[key]))).join(',');
}

export function decodeValues(value: string): Values | null {
  const parts = value.split(',');
  const keys =
    parts.length === FIELD_KEYS.length
      ? FIELD_KEYS
      : parts.length === LEGACY_FIELD_KEYS.length
        ? LEGACY_FIELD_KEYS
        : null;
  if (!keys) return null;
  const out: Values = { ...INITIAL };
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i].trim();
    const parsed = Number(part);
    if (part === '' || !Number.isFinite(parsed) || parsed < 0) return null;
    out[keys[i]] = String(parsed);
  }
  return out;
}

export const STORAGE_KEY = 'mh:calc:scenarios';
export const INPUTS_KEY = 'mh:calc:inputs';
export const TARGET_KEY = 'mh:calc:target';
const PENDING_KEY = 'mh:calc:pending';

export type PendingLoad = { id: number | null; values: Values; name: string };

/** Queues a scenario's numbers so the calculator opens on them. */
export function queueCalculation(values: Values, id: number | null = null, name = ''): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id, values, name: name.trim() }));
  } catch {
    /* storage blocked — the link still opens the calculator */
  }
}

/** Reads the queued numbers without consuming them (safe on double render). */
export function readPendingCalculation(): PendingLoad | null {
  try {
    const stored = window.sessionStorage.getItem(PENDING_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as { id?: unknown; values?: unknown; name?: unknown };
    if (!source.values || typeof source.values !== 'object') return null;
    const raw = source.values as Record<string, unknown>;
    const values: Values = { ...INITIAL };
    let found = false;
    FIELD_KEYS.forEach((key) => {
      const value = raw[key];
      if (typeof value === 'string' && value !== '') {
        values[key] = value;
        found = true;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        values[key] = String(value);
        found = true;
      }
    });
    if (!found) return null;
    const id = Number(source.id);
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    return { id: Number.isFinite(id) && id > 0 ? id : null, values, name };
  } catch {
    return null;
  }
}

export function clearPendingCalculation(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type Threshold = {
  feasible: boolean;
  minPrice: number;
  minPriceHT: number;
  breakEvenPrice: number;
  headroom: number;
};

/**
 * Share of the TTC price kept once sales VAT, the Amazon commission and returns
 * are paid: net = price × share − landed − fba − ppc.
 */
export function afterVatShare(raw: Values): number {
  const vat = Math.min(100, Math.max(0, num(raw.vat))) / 100;
  const amazon = Math.min(100, Math.max(0, num(raw.amazon))) / 100;
  const returns = Math.min(100, Math.max(0, num(raw.returns))) / 100;
  return 1 / (1 + vat) - amazon - returns;
}

/**
 * Selling price needed to leave exactly `targetNet` after every cost.
 * Net = price / (1 + VAT) − landed − fba − ppc − price × (commission + returns)
 * so price = (targetNet + landed + fba + ppc) / share, with share = afterVatShare.
 */
export function thresholdFor(raw: Values, targetNet: number): Threshold {
  const supplier = num(raw.supplier);
  const shipping = num(raw.shipping);
  const packaging = num(raw.packaging);
  const customs = num(raw.customs);
  const fba = num(raw.fba);
  const ppc = num(raw.ppc);
  const vat = Math.min(100, Math.max(0, num(raw.vat))) / 100;
  const price = num(raw.price);

  const landed = supplier + shipping + packaging + (supplier + shipping) * (customs / 100);
  const fixed = landed + fba + ppc;
  const share = afterVatShare(raw);
  const feasible = share > 0.0001;

  const safeTarget = Number.isFinite(targetNet) ? Math.max(0, targetNet) : 0;
  const minPrice = feasible ? (safeTarget + fixed) / share : NaN;
  const breakEvenPrice = feasible ? fixed / share : NaN;

  return {
    feasible,
    minPrice,
    minPriceHT: feasible ? minPrice / (1 + vat) : NaN,
    breakEvenPrice,
    headroom: feasible ? price - minPrice : NaN,
  };
}

/**
 * Sale price at which the net margin reaches exactly `floorPct` %.
 * Margin = net / price = share − fixed / price, so the price that lands on the
 * floor is fixed / (share − floor). Null when no price can reach it.
 */
export function priceForMargin(raw: Values, floorPct: number): number | null {
  const supplier = num(raw.supplier);
  const shipping = num(raw.shipping);
  const packaging = num(raw.packaging);
  const customs = num(raw.customs);
  const fba = num(raw.fba);
  const ppc = num(raw.ppc);
  const floor = Math.min(95, Math.max(0, floorPct)) / 100;

  const landed = supplier + shipping + packaging + (supplier + shipping) * (customs / 100);
  const fixed = landed + fba + ppc;
  const room = afterVatShare(raw) - floor;
  if (room <= 0.0001) return null;

  const price = fixed / room;
  return Number.isFinite(price) && price > 0 ? price : null;
}


/** Which ending the supplier floor is rounded to: ,90, ,99 or ,00. */
export type PsychoRule = '90' | '99' | '00';

export const PSYCHO_RULE_VALUES: PsychoRule[] = ['90', '99', '00'];
export const DEFAULT_PSYCHO_RULE: PsychoRule = '90';

/** Guards a stored or uploaded value before it is trusted as a rule. */
export function isPsychoRule(value: unknown): value is PsychoRule {
  return value === '90' || value === '99' || value === '00';
}

/**
 * Rounded-up price: the smallest amount at or above `value` that ends on the
 * chosen rule (17,42 € → 17,90 € in ,90 · 17,99 € in ,99 · 18,00 € in ,00).
 * It never goes below the computed floor, so the rounded floor still holds the
 * margin.
 */
export function roundUpToRule(value: number, rule: PsychoRule = '90'): number {
  if (!Number.isFinite(value) || value <= 0) return NaN;
  const cents = Math.ceil(value * 100 - 1e-6);
  const ending = rule === '99' ? 99 : rule === '00' ? 0 : 90;
  let rounded = Math.floor(cents / 100) * 100 + ending;
  if (rounded < cents) rounded += 100;
  return rounded / 100;
}

/** The supplier floor, rounded to the chosen psychological rule. */
export function psychoFloorPrice(value: number, rule: PsychoRule = '90'): number {
  return roundUpToRule(value, rule);
}

/**
 * Highest purchase price that still holds the green floor at `price`.
 * Everything else stays as typed: only the supplier line moves.
 * Null when the fees already eat the whole budget.
 */
export function maxSupplierFor(raw: Values, price: number, floorPct: number): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const shipping = num(raw.shipping);
  const packaging = num(raw.packaging);
  const customs = Math.min(100, Math.max(0, num(raw.customs))) / 100;
  const fba = num(raw.fba);
  const ppc = num(raw.ppc);
  const floor = Math.min(95, Math.max(0, floorPct)) / 100;

  /* Money left for the landed cost once the green margin and the fees are paid. */
  const landedBudget = price * (afterVatShare(raw) - floor) - fba - ppc;
  const supplier = (landedBudget - packaging) / (1 + customs) - shipping;
  if (!Number.isFinite(supplier) || supplier <= 0) return null;
  /* Rounded down to the next 0,10 €: the asked price never overshoots. */
  return Math.floor(supplier * 10 + 1e-6) / 10;
}

export function loadTarget(): string {
  try {
    const stored = window.localStorage.getItem(TARGET_KEY);
    return stored && stored.trim() !== '' ? stored : '5';
  } catch {
    return '5';
  }
}

export function persistTarget(value: string): void {
  try {
    window.localStorage.setItem(TARGET_KEY, value);
  } catch {
    /* storage blocked — target stays for this session only */
  }
}

export function loadScenarios(): Scenario[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const out: Scenario[] = [];
    parsed.slice(0, 3).forEach((item, index) => {
      const entry = item as { id?: unknown; name?: unknown; values?: unknown };
      if (!entry || typeof entry.values !== 'object' || entry.values === null) return;
      const values: Values = { ...INITIAL };
      const source = entry.values as Record<string, unknown>;
      FIELD_KEYS.forEach((key) => {
        const v = source[key];
        values[key] = typeof v === 'string' && v !== '' ? v : INITIAL[key];
      });
      const id = Number(entry.id);
      out.push({
        id: Number.isFinite(id) && id > 0 ? id : index + 1,
        name: typeof entry.name === 'string' ? entry.name : '',
        values,
      });
    });
    return out;
  } catch {
    return [];
  }
}

export function persistScenarios(scenarios: Scenario[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    /* storage blocked — scenarios stay for this session only */
  }
}

export function loadInputs(): Values | null {
  try {
    const stored = window.localStorage.getItem(INPUTS_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as Record<string, unknown>;
    const values: Values = { ...INITIAL };
    let found = false;
    FIELD_KEYS.forEach((key) => {
      const v = source[key];
      if (typeof v === 'string' && v !== '') {
        values[key] = v;
        found = true;
      }
    });
    return found ? values : null;
  } catch {
    return null;
  }
}

export function persistInputs(values: Values): void {
  try {
    window.localStorage.setItem(INPUTS_KEY, JSON.stringify(values));
  } catch {
    /* storage blocked — inputs stay for this session only */
  }
}

export function encodePlans(scenarios: Scenario[]): string {
  if (scenarios.length === 0) return '';
  const payload = scenarios.map((s) => ({
    n: s.name,
    v: FIELD_KEYS.map((key) => num(s.values[key])),
  }));
  try {
    return window.btoa(encodeURIComponent(JSON.stringify(payload))).replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodePlans(encoded: string): Scenario[] | null {
  if (!encoded) return null;
  try {
    const pad = encoded.length % 4 === 0 ? '' : '='.repeat(4 - (encoded.length % 4));
    const parsed: unknown = JSON.parse(decodeURIComponent(window.atob(encoded + pad)));
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 3) return null;
    const out: Scenario[] = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i] as { n?: unknown; v?: unknown };
      if (!item || !Array.isArray(item.v)) return null;
      const keys =
        item.v.length === FIELD_KEYS.length
          ? FIELD_KEYS
          : item.v.length === LEGACY_FIELD_KEYS.length
            ? LEGACY_FIELD_KEYS
            : null;
      if (!keys) return null;
      const values: Values = { ...INITIAL };
      for (let j = 0; j < item.v.length; j += 1) {
        const value = Number(item.v[j]);
        if (!Number.isFinite(value) || value < 0) return null;
        values[keys[j]] = String(value);
      }
      out.push({ id: i + 1, name: typeof item.n === 'string' ? item.n : '', values });
    }
    return out;
  } catch {
    return null;
  }
}

export function makeFormatters(locale: string) {
  return {
    eur: (value: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value),
    pct: (value: number) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`,
  };
}