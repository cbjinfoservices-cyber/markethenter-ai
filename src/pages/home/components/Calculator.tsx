import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import { fetchWorkspace, saveWorkspace } from '@/pages/home/cloudStore';
import {
  buildDefaultHistory,
  cleanEmail,
  loadSupplierEmails,
  loadSupplierNames,
  persistSupplierEmails,
  persistSupplierNames,
} from '@/pages/home/priceHistory';
import { notifyAlerts } from '@/pages/home/supplierAlerts';
import {
  FIELDS,
  INITIAL,
  clearPendingCalculation,
  compute,
  decodePlans,
  decodeValues,
  encodePlans,
  encodeValues,
  loadInputs,
  loadScenarios,
  loadTarget,
  makeFormatters,
  num,
  persistInputs,
  persistScenarios,
  persistTarget,
  readPendingCalculation,
  thresholdFor,
} from '@/pages/home/calcModel';
import type { FieldKey, Scenario, Values } from '@/pages/home/calcModel';
import {
  buildScenariosCsv,
  csvFilename,
  downloadCsv,
  parseScenariosCsv,
} from '@/pages/home/calcExport';
import { recordExport } from '@/pages/home/exportLog';
import ScenarioStrip from './ScenarioStrip';
import FromDashboardBanner from './FromDashboardBanner';
import type { ImportResult } from './ScenarioStrip';
import PrintSummary from './PrintSummary';
import CalcResults from './CalcResults';
import type { PrintMode } from './PrintSummary';
import Verdict from './Verdict';
import ExamplePicker from './ExamplePicker';
import { VERDICT_KEYS, clampGoodFloor, verdictLevelOf } from '@/pages/home/calcVerdict';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import {
  isRoundTrip,
  loadFieldMemory,
  persistFieldMemory,
  rememberValue,
  wipeFieldMemory,
} from '@/pages/home/fieldMemory';
import type { FieldMemory } from '@/pages/home/fieldMemory';
import { useMemoryEnabled } from '@/pages/home/useMemoryEnabled';
import { noteBaptisedSheet } from '@/pages/home/baptiseLog';

const MAX_SCENARIOS = 3;

type FieldGroupId = 'buy' | 'sell';
type FieldDef = (typeof FIELDS)[number];

/* The form reads in two blocks: what the unit costs you, then what you sell it
   for. Collapsing a block keeps its subtotal on screen, so nothing is lost. */
const FIELD_GROUPS: { id: FieldGroupId; keys: FieldKey[] }[] = [
  { id: 'buy', keys: ['supplier', 'shipping', 'packaging', 'customs', 'fba', 'ppc'] },
  { id: 'sell', keys: ['amazon', 'returns', 'vat', 'price', 'units'] },
];

const GROUPS_KEY = 'mh:calc:groups';

function readGroups(): Record<FieldGroupId, boolean> {
  try {
    const stored = window.localStorage.getItem(GROUPS_KEY);
    if (!stored) return { buy: true, sell: true };
    const parsed = JSON.parse(stored) as Partial<Record<FieldGroupId, boolean>>;
    return { buy: parsed.buy !== false, sell: parsed.sell !== false };
  } catch {
    return { buy: true, sell: true };
  }
}

type Prefill = 'calc' | 'plans' | null;
type ShareKind = 'single' | 'plans';
type ShareState = { status: 'idle' | 'done' | 'fail'; url: string };

const IDLE: ShareState = { status: 'idle', url: '' };

type SharedIn = {
  prefill: Prefill;
  values: Values | null;
  scenarios: Scenario[];
  recap: boolean;
  floor: number | null;
};

type CloudState = 'idle' | 'loading' | 'saving' | 'synced' | 'error';

function readSharedState(): SharedIn {
  try {
    const params = new URLSearchParams(window.location.search);
    const plans = params.get('plans');
    const recap = params.get('recap') === '1';
    const rawFloor = params.get('floor');
    const floor = rawFloor && Number.isFinite(Number(rawFloor))
      ? clampGoodFloor(Number(rawFloor))
      : null;
    if (plans) {
      const decoded = decodePlans(plans);
      if (decoded && decoded.length > 0) {
        return { prefill: 'plans', values: decoded[0].values, scenarios: decoded, recap, floor };
      }
    }
    const calc = params.get('calc');
    if (calc) {
      const values = decodeValues(calc);
      if (values) return { prefill: 'calc', values, scenarios: [], recap: false, floor };
    }
  } catch {
    /* ignore malformed links */
  }
  return { prefill: null, values: null, scenarios: [], recap: false, floor: null };
}

function shareUrlOf(query: string): string {
  return `${window.location.origin}${window.location.pathname}?${query}`;
}

type CalculatorProps = { bare?: boolean };

export default function Calculator({ bare = false }: CalculatorProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);

  const shared = useRef<SharedIn>(readSharedState());
  const pending = useMemo(() => readPendingCalculation(), []);
  /* A supplier clicked in the header alert list opens on its own curve. */
  const historyFocus = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('history');
    } catch {
      return null;
    }
  }, []);
  /* Arrivée pour baptiser une fiche : le champ du nom prend le focus tout
     seul, sans avoir à viser la case à la souris. */
  const namingFocus = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('baptise') === '1';
    } catch {
      return false;
    }
  }, []);
  const historyLanded = useRef(false);
  const [raw, setRaw] = useState<Values>(
    () => pending?.values ?? shared.current.values ?? loadInputs() ?? INITIAL,
  );
  const [fromDashboard, setFromDashboard] = useState<boolean>(Boolean(pending));
  const [prefill, setPrefill] = useState<Prefill>(shared.current.prefill);
  const [scenarios, setScenarios] = useState<Scenario[]>(() =>
    shared.current.scenarios.length > 0 ? shared.current.scenarios : loadScenarios(),
  );
  const [share, setShare] = useState<{ single: ShareState; plans: ShareState }>({
    single: IDLE,
    plans: IDLE,
  });
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'done' | 'fail'>('idle');
  const [importResult, setImportResult] = useState<ImportResult>(null);
  const [target, setTarget] = useState<string>(() => loadTarget());
  const [activeId, setActiveId] = useState<number | null>(() => {
    if (pending?.id != null && scenarios.some((s) => s.id === pending.id)) return pending.id;
    return shared.current.scenarios.length > 0 ? shared.current.scenarios[0].id : null;
  });
  const nextId = useRef(scenarios.reduce((max, s) => Math.max(max, s.id), 0) + 1);
  const timers = useRef<{
    single?: number;
    plans?: number;
    csv?: number;
    importCsv?: number;
    example?: number;
  }>({});

  const [exampleNote, setExampleNote] = useState('');
  const [liveResults, setLiveResults] = useState('');
  /* Which of the two field blocks is folded open. */
  const [groups, setGroups] = useState<Record<FieldGroupId, boolean>>(() => readGroups());
  /* The net profit and the margin before the last keystroke, shown next to the
     new ones: a move in euros and a move in points are two different stories. */
  const [ghost, setGhost] = useState<{
    key: FieldKey;
    before: number;
    beforeMargin: number;
  } | null>(null);
  /* The last five values committed on each field, so a back-and-forth on a
     number is visible — and reusable in one click. */
  const [fieldMem, setFieldMem] = useState<FieldMemory>(() => loadFieldMemory());
  const [memKey, setMemKey] = useState<FieldKey | null>(null);
  /* Remembering is a choice: some sessions must leave absolutely no trace.
     The switch lives outside the tool so the page bar can carry the reminder. */
  const [memOn, setMemOn] = useMemoryEnabled();
  /* Green floor: 15 % by default, adjustable to 20 or 25 %, kept per browser. */
  const [goodFloor, setGoodFloor] = useGoodFloor();

  const { user } = useAuth();
  const [histories, setHistories] = useState<Record<string, number[]>>({});
  const [supplierNames, setSupplierNames] = useState<Record<string, string>>(() =>
    loadSupplierNames(),
  );
  /* The address that fills the recipient of the supplier e-mail. */
  const [supplierEmails, setSupplierEmails] = useState<Record<string, string>>(() =>
    loadSupplierEmails(),
  );
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [cloud, setCloud] = useState<CloudState>('idle');
  const hydrated = useRef<string | null>(null);
  const latest = useRef({ raw, target, scenarios, histories, supplierNames, supplierEmails });
  latest.current = { raw, target, scenarios, histories, supplierNames, supplierEmails };

  const handleHistoryChange = useCallback((key: string, series: number[]) => {
    setHistories((prev) => {
      const existing = prev[key];
      if (
        existing &&
        existing.length === series.length &&
        existing.every((value, index) => value === series[index])
      ) {
        return prev;
      }
      return { ...prev, [key]: series };
    });
  }, []);

  const handleSupplierName = useCallback((key: string, name: string) => {
    /* Un nom tapé ici est un baptême : le compteur du jour le retient, une
       seule fois par fiche, sans attendre de quitter la page. */
    if (name.trim() !== '') {
      const id = Number(key.replace(/^s/, '').split(':')[0]);
      if (Number.isFinite(id)) noteBaptisedSheet(id);
    }
    setSupplierNames((prev) => (prev[key] === name ? prev : { ...prev, [key]: name }));
  }, []);

  const handleSupplierEmail = useCallback((key: string, value: string) => {
    const email = cleanEmail(value);
    setSupplierEmails((prev) => {
      if ((prev[key] ?? '') === email) return prev;
      const next = { ...prev };
      if (email === '') delete next[key];
      else next[key] = email;
      return next;
    });
  }, []);

  useEffect(() => {
    persistSupplierNames(supplierNames);
  }, [supplierNames]);

  useEffect(() => {
    persistSupplierEmails(supplierEmails);
  }, [supplierEmails]);

  useEffect(() => {
    if (!shared.current.prefill) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById('calculator')?.scrollIntoView({ block: 'start' });
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  /* Numbers handed over by the dashboard: bring the tool into view.
     On the dedicated calculator page the landing scroll owns this. */
  useEffect(() => {
    if (!fromDashboard || bare) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById('calculator')?.scrollIntoView({ block: 'start' });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [fromDashboard]);

  /* Land on the supplier's 12-month history, not on top of the form. */
  useEffect(() => {
    if (!historyFocus || historyLanded.current) return undefined;
    historyLanded.current = true;

    const targetId = Number(historyFocus.replace(/^s/, '').split(':')[0]);
    if (Number.isFinite(targetId)) setActiveId(targetId);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer = 0;
    let focusTimer = 0;

    const place = (tries: number) => {
      const element =
        document.getElementById(`history-${historyFocus}`) ??
        document.getElementById('history-draft');
      if (!element) {
        if (tries < 24) timer = window.setTimeout(() => place(tries + 1), 120);
        return;
      }
      const header = document.querySelector<HTMLElement>('.calc-top, .nav');
      const offset = (header?.offsetHeight ?? 64) + 18;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), left: 0, behavior: reduce ? 'auto' : 'smooth' });
      element.classList.add('is-focus');
      window.setTimeout(() => element.classList.remove('is-focus'), 2600);
      /* Le curseur se pose dans le champ du nom une fois la descente finie,
         sans faire sauter le défilement au passage. */
      if (namingFocus) {
        focusTimer = window.setTimeout(
          () => {
            const field = element.querySelector<HTMLInputElement>('input.ph-name');
            field?.focus({ preventScroll: true });
          },
          reduce ? 120 : 620,
        );
      }
    };

    timer = window.setTimeout(() => place(0), 520);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(focusTimer);
    };
  }, [historyFocus, namingFocus]);

  /* Numbers handed over by the dashboard: consumed once, then forgotten. */
  useEffect(() => {
    clearPendingCalculation();
  }, []);

  useEffect(() => {
    persistScenarios(scenarios);
  }, [scenarios]);

  useEffect(() => {
    if (memOn) persistFieldMemory(fieldMem);
    else wipeFieldMemory();
  }, [fieldMem, memOn]);

  useEffect(() => {
    persistInputs(raw);
  }, [raw]);

  useEffect(() => {
    persistTarget(target);
  }, [target]);

  /* Remember which block is folded, so a long session keeps the short form. */
  useEffect(() => {
    try {
      window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch {
      /* storage blocked — the blocks simply reopen next visit */
    }
  }, [groups]);

  /* Keep the header warning in sync with what is on screen. */
  useEffect(() => {
    notifyAlerts();
  }, [scenarios, histories, target, supplierNames]);

  /* Account sync: pull the seller's saved workspace once they sign in. */
  useEffect(() => {
    if (!user) {
      hydrated.current = null;
      setCloud('idle');
      return undefined;
    }
    let cancelled = false;
    setCloud('loading');

    const run = async (account: User) => {
      try {
        const remote = await fetchWorkspace(account.id);
        if (cancelled) return;
        const hasData = remote.inputs !== null || remote.scenarios.length > 0;
        if (hasData) {
          if (remote.inputs) setRaw(remote.inputs);
          if (remote.target) setTarget(remote.target);
          setScenarios(remote.scenarios);
          nextId.current = remote.scenarios.reduce((max, s) => Math.max(max, s.id), 0) + 1;
          setActiveId(remote.scenarios.length > 0 ? remote.scenarios[0].id : null);
          setHistories(remote.histories);
          setSupplierNames(remote.supplierNames);
          setSupplierEmails(remote.supplierEmails);
          setHistoryEpoch((prev) => prev + 1);
          setPrefill(null);
          if (pending) {
            setRaw(pending.values);
            if (pending.id != null && remote.scenarios.some((s) => s.id === pending.id)) {
              setActiveId(pending.id);
            }
          }
        } else {
          const snapshot = latest.current;
          await saveWorkspace(
            account.id,
            snapshot.raw,
            snapshot.target,
            snapshot.scenarios,
            snapshot.histories,
            snapshot.supplierNames,
            snapshot.supplierEmails,
          );
        }
        if (cancelled) return;
        hydrated.current = account.id;
        setCloud('synced');
      } catch {
        if (!cancelled) setCloud('error');
      }
    };

    void run(user);

    return () => {
      cancelled = true;
    };
  }, [user, pending]);

  /* Account sync: push changes back, debounced so typing does not spam the API. */
  useEffect(() => {
    if (!user || hydrated.current !== user.id) return undefined;
    setCloud((prev) => (prev === 'saving' ? prev : 'saving'));
    const timer = window.setTimeout(() => {
      saveWorkspace(
        user.id,
        raw,
        target,
        scenarios,
        histories,
        supplierNames,
        supplierEmails,
      )
        .then(() => setCloud('synced'))
        .catch(() => setCloud('error'));
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [user, raw, target, scenarios, histories, supplierNames, supplierEmails]);

  useEffect(() => () => {
    window.clearTimeout(timers.current.single);
    window.clearTimeout(timers.current.plans);
    window.clearTimeout(timers.current.csv);
    window.clearTimeout(timers.current.importCsv);
    window.clearTimeout(timers.current.example);
  }, []);

  useEffect(() => {
    if (shared.current.recap && shared.current.scenarios.length > 0) setPrintMode('full');
  }, []);

  /* A recap link carries its own margin floor: the reader sees the same verdict. */
  useEffect(() => {
    const sharedFloor = shared.current.floor;
    if (sharedFloor !== null) setGoodFloor(sharedFloor);
  }, [setGoodFloor]);

  /* Name of the scenario the dashboard handed over — same labelling it uses. */
  const dashboardName = useMemo(() => {
    if (!pending) return '';
    if (pending.id == null) return pending.name;
    const index = scenarios.findIndex((s) => s.id === pending.id);
    if (index < 0) return '';
    return scenarios[index].name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;
  }, [pending, scenarios, t]);

  /* Look-up table: each block names its own fields, in its own order. */
  const fieldsByKey = useMemo(() => {
    const map = {} as Record<FieldKey, FieldDef>;
    FIELDS.forEach((field) => {
      map[field.key] = field;
    });
    return map;
  }, []);

  const toggleGroup = (id: FieldGroupId) => {
    setGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* Oldest first, so the strip reads left to right like the typing did. */
  const memList = memKey ? (fieldMem[memKey] ?? []) : [];
  const memChronological = useMemo(() => [...memList].reverse(), [memList]);
  const memRoundTrip = isRoundTrip(memList);
  const pts = (value: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${t(
      'home.calcPage.ghostPoints',
    )}`;

  const metrics = compute(raw);
  const threshold = thresholdFor(raw, num(target));
  const verdict = verdictLevelOf(metrics.net, metrics.netMargin, goodFloor);

  /* Screen readers hear the moving results — debounced so typing stays quiet
     and announced only once per settled value. */
  const firstAnnounce = useRef(true);
  useEffect(() => {
    if (firstAnnounce.current) {
      firstAnnounce.current = false;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setLiveResults(
        `${t(VERDICT_KEYS[verdict].title)}. ${t('home.calc.netProfit')} ${eur(
          metrics.net,
        )} · ${t('home.calc.netMargin')} ${pct(metrics.netMargin)} · ${t(
          'home.calc.monthly',
        )} ${eur(metrics.monthly)}.`,
      );
    }, 650);
    return () => window.clearTimeout(timer);
  }, [verdict, metrics.net, metrics.netMargin, metrics.monthly, eur, pct, t]);
  /* The banner keeps naming the scenario handed over by the dashboard:
     typing only adjusts its numbers, it does not change their origin. */
  /* Every keystroke leaves a trace: the net before it stays on screen, so a
     change is read as a move and not as an absolute figure. */
  const update = (key: FieldKey, value: string) => {
    setPrefill(null);
    const beforeMetrics = compute(raw);
    const afterMetrics = compute({ ...raw, [key]: value });
    const netMoved = Math.abs(afterMetrics.net - beforeMetrics.net) >= 0.005;
    const marginMoved = Math.abs(afterMetrics.netMargin - beforeMetrics.netMargin) >= 0.005;
    setGhost(
      netMoved || marginMoved
        ? {
            key,
            before: beforeMetrics.net,
            beforeMargin: beforeMetrics.netMargin,
          }
        : null,
    );
    setRaw((prev) => ({ ...prev, [key]: value }));
  };

  /* Leaving a field is what makes its number real: only then is it kept in the
     field's five-value memory, never on every keystroke. */
  const commitField = (key: FieldKey, value: string) => {
    if (!memOn) return;
    setMemKey(key);
    setFieldMem((prev) => rememberValue(prev, key, value));
  };

  /* Wiping the whole field memory: the reader starts the next session on a
     clean slate instead of inheriting last week's hesitations. */
  const clearFieldMemory = () => {
    setFieldMem({});
    setMemKey(null);
    wipeFieldMemory();
  };

  /* The switch itself: turning it off erases what was already kept, so the
     session really leaves nothing behind. */
  const toggleFieldMemory = () => {
    const next = !memOn;
    setMemOn(next);
    if (!next) {
      setFieldMem({});
      setMemKey(null);
      wipeFieldMemory();
    }
  };

  /* Wiping only the field in hand: the other ten keep their five values, so a
     stray number on one field does not cost the whole session's history. */
  const clearActiveFieldMemory = () => {
    if (!memKey) return;
    setFieldMem((prev) => {
      const next = { ...prev };
      delete next[memKey];
      return next;
    });
  };

  /* Putting an old value back counts as a real choice: it lands in the memory
     as well, so 12 → 15 → 12 reads as the round trip it is. */
  const restoreMemory = (key: FieldKey, value: string) => {
    update(key, value);
    if (memOn) setFieldMem((prev) => rememberValue(prev, key, value));
  };

  const saveScenario = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const id = nextId.current;
    nextId.current += 1;
    setScenarios((prev) =>
      prev.length >= MAX_SCENARIOS ? prev : [...prev, { id, name: '', values: { ...raw } }],
    );
    setActiveId(id);
  };

  const resetCalculator = () => {
    setRaw(INITIAL);
    setPrefill(null);
    setFromDashboard(false);
    setActiveId(null);
    setGhost(null);
  };

  const renameScenario = (id: number, name: string) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  };

  const removeScenario = (id: number) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  };

  const loadScenario = (scenario: Scenario) => {
    setRaw({ ...scenario.values });
    setPrefill(null);
    setFromDashboard(false);
    setActiveId(scenario.id);
    setGhost(null);
  };

  /* One of the three ready-made products, straight into the inputs. */
  const loadExample = (values: Values, name: string) => {
    setRaw({ ...values });
    setPrefill(null);
    setFromDashboard(false);
    setActiveId(null);
    setGhost(null);
    setExampleNote(t('home.calc.exampleLoaded', { name }));
    window.clearTimeout(timers.current.example);
    timers.current.example = window.setTimeout(() => setExampleNote(''), 8000);
  };

  /* A price clicked on the sensitivity grid lands straight in the sale price field. */
  const pickPrice = (price: number) => {
    setPrefill(null);
    setFromDashboard(false);
    setRaw((prev) => ({ ...prev, price: String(price) }));
    setGhost(null);
  };

  const duplicateScenario = (source: Scenario) => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const id = nextId.current;
    nextId.current += 1;
    const base = source.name.trim() || t('home.calc.scenario');
    const suffix = ` · ${t('home.calc.copySuffix')}`;
    setScenarios((prev) =>
      prev.length >= MAX_SCENARIOS
        ? prev
        : [
            ...prev,
            {
              id,
              name: `${base.slice(0, Math.max(0, 28 - suffix.length))}${suffix}`,
              values: { ...source.values },
            },
          ],
    );
    setActiveId(id);
  };

  const runShare = async (kind: ShareKind, url: string) => {
    let status: ShareState['status'] = 'done';
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(url);
    } catch {
      status = 'fail';
    }
    setShare((prev) => ({ ...prev, [kind]: { status, url } }));
    window.clearTimeout(timers.current[kind]);
    timers.current[kind] = window.setTimeout(
      () => setShare((prev) => ({ ...prev, [kind]: IDLE })),
      6000,
    );
  };

  const shareNumbers = () => {
    void runShare('single', shareUrlOf(`calc=${encodeValues(raw)}`));
  };

  const shareComparison = () => {
    const encoded = encodePlans(scenarios);
    if (!encoded) return;
    void runShare('plans', shareUrlOf(`plans=${encodeURIComponent(encoded)}`));
  };

  /* The printable sheet never comes up empty: before the first scenario is
     saved, the current draft is printed as a single scenario. */
  const printScenarios = useMemo<Scenario[]>(
    () => (scenarios.length > 0 ? scenarios : [{ id: 0, name: '', values: raw }]),
    [scenarios, raw],
  );

  const recapUrl = useMemo(() => {
    const encoded = encodePlans(printScenarios);
    return encoded
      ? shareUrlOf(`plans=${encodeURIComponent(encoded)}&recap=1&floor=${goodFloor}`)
      : '';
  }, [printScenarios, goodFloor]);

  const exportScenarios = () => {
    if (scenarios.length === 0) return;
    const map: Record<string, number[]> = {};
    scenarios.forEach((scenario) => {
      const key = `s${scenario.id}`;
      map[key] = histories[key] ?? buildDefaultHistory(key, num(scenario.values.supplier));
    });
    /* Les destinataires entrent dans le nom du fichier : dans un dossier de
       téléchargements plein de CSV, on reconnaît le bon document du premier coup. */
    const recipients = scenarios
      .map((scenario, index) => ({
        name:
          scenario.name.trim() ||
          `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`,
        email: (supplierEmails[`s${scenario.id}`] ?? '').trim(),
      }))
      .filter((item) => item.email !== '');
    const filename = csvFilename(new Date(), recipients);
    const ok = downloadCsv(
      filename,
      buildScenariosCsv(
        scenarios,
        locale,
        (key) => t(key),
        map,
        supplierNames,
        supplierEmails,
        fieldMem,
        goodFloor,
      ),
    );
    if (ok) recordExport(filename);
    setExportState(ok ? 'done' : 'fail');
    window.clearTimeout(timers.current.csv);
    timers.current.csv = window.setTimeout(() => setExportState('idle'), 6000);
  };

  const clearImportLater = () => {
    window.clearTimeout(timers.current.importCsv);
    timers.current.importCsv = window.setTimeout(() => setImportResult(null), 9000);
  };

  const importScenarios = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseScenariosCsv(text);
      if (!parsed || parsed.scenarios.length === 0) {
        setImportResult({ status: 'fail', count: 0, truncated: false });
        clearImportLater();
        return;
      }
      setScenarios(parsed.scenarios);
      nextId.current = parsed.scenarios.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      setRaw({ ...parsed.scenarios[0].values });
      setPrefill(null);
      setActiveId(parsed.scenarios[0].id);
      setImportResult({
        status: 'done',
        count: parsed.scenarios.length,
        truncated: parsed.truncated,
      });
      clearImportLater();
    } catch {
      setImportResult({ status: 'fail', count: 0, truncated: false });
      clearImportLater();
    }
  };

  const feedback = (kind: ShareKind) => {
    const state = share[kind];
    if (state.status === 'done') {
      return (
        <span className="calc-status is-ok">
          <i className="ri-checkbox-circle-line" aria-hidden="true" />
          {t('home.calc.copied')}
        </span>
      );
    }
    if (state.status === 'fail') {
      return (
        <div className="calc-share-fallback">
          <span>{t('home.calc.copyManual')}</span>
          <input
            type="text"
            readOnly
            value={state.url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <section className={bare ? 'panel calc-panel is-page' : 'panel'} data-side="right" id="calculator">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Dark studio desk with a calculator readout printed on glass, FBA profit calculator by MarketHunter AI"
        src="https://readdy.ai/api/search-image?query=Cinematic%20dark%20charcoal%20studio%20with%20a%20thin%20glass%20sheet%20standing%20upright%20on%20a%20black%20surface%20catching%20a%20warm%20amber%20rim%20light%2C%20blurred%20numeric%20readout%20etched%20on%20the%20glass%2C%20main%20subject%20in%20the%20left%20third%20of%20the%20frame%2C%20the%20right%20half%20calm%20empty%20darkness%2C%20soft%20haze%2C%20wide%20shot&width=2400&height=1350&seq=mh-panel-calculator&orientation=landscape"
      />
      <div className="panel-veil" />
      <div className="panel-copy panel-copy--calc" data-parallax="-0.08">
        {!bare && (
          <>
            <p className="stamp" data-reveal>{t('home.calc.stamp')}</p>
            <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.calc.title') }} />
            <p className="sub" data-reveal>{t('home.calc.intro')}</p>
          </>
        )}

        {prefill === 'calc' && (
          <p className="calc-flag" data-reveal>
            <i className="ri-links-line" aria-hidden="true" />
            {t('home.calc.sharedLoaded')}
          </p>
        )}
        {prefill === 'plans' && (
          <p className="calc-flag" data-reveal>
            <i className="ri-links-line" aria-hidden="true" />
            {t('home.calc.sharedPlansLoaded')}
          </p>
        )}
        {fromDashboard && (
          <FromDashboardBanner
            name={dashboardName}
            values={raw}
            target={target}
            onDismiss={() => setFromDashboard(false)}
          />
        )}

        {user && (
          <p className={`calc-flag calc-flag--cloud${cloud === 'error' ? ' is-error' : ''}`} data-reveal>
            <i
              className={
                cloud === 'error'
                  ? 'ri-error-warning-line'
                  : cloud === 'synced'
                    ? 'ri-cloud-line'
                    : 'ri-loader-4-line'
              }
              aria-hidden="true"
            />
            {cloud === 'loading'
              ? t('home.account.syncLoading')
              : cloud === 'saving'
                ? t('home.account.syncSaving')
                : cloud === 'error'
                  ? t('home.account.syncError')
                  : t('home.account.synced', { email: user.email ?? '' })}
          </p>
        )}

        {bare && (
          <div className="calc-examples-wrap" data-reveal>
            <ExamplePicker locale={locale} onLoad={loadExample} />
          </div>
        )}
        {exampleNote && (
          <p className="calc-flag calc-flag--example" data-reveal>
            <i className="ri-checkbox-circle-line" aria-hidden="true" />
            {exampleNote}
          </p>
        )}

        <div className="calc" data-reveal>
          <div className="calc-inputs">
            {bare && (
              <div className="calc-inputs-head">
                <span className="calc-inputs-title">
                  <i className="ri-equalizer-line" aria-hidden="true" />
                  {t('home.calcPage.inputsTitle')}
                </span>
                <span className="calc-inputs-hint">{t('home.calcPage.inputsHint')}</span>
              </div>
            )}
            {FIELD_GROUPS.map((group) => {
              const open = groups[group.id];
              const isBuy = group.id === 'buy';
              /* Folded, the block still tells you what it is worth. */
              const meta = isBuy
                ? t('home.calcPage.groupBuyMeta', {
                    value: eur(metrics.landed + num(raw.fba) + num(raw.ppc)),
                  })
                : t('home.calcPage.groupSellMeta', {
                    price: eur(num(raw.price)),
                    margin: pct(metrics.netMargin),
                  });
              return (
                <div className={`calc-group${open ? ' is-open' : ''}`} key={group.id}>
                  <button
                    type="button"
                    className="calc-group-head"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={open}
                    aria-controls={`calc-group-${group.id}`}
                  >
                    <span className="calc-group-ico">
                      <i
                        className={isBuy ? 'ri-truck-line' : 'ri-store-3-line'}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="calc-group-title">
                      {t(isBuy ? 'home.calcPage.groupBuy' : 'home.calcPage.groupSell')}
                    </span>
                    <span className="calc-group-meta">{meta}</span>
                    <span className="calc-group-count">
                      {t('home.calcPage.groupCount', { n: group.keys.length })}
                    </span>
                    <i className="ri-arrow-down-s-line calc-group-caret" aria-hidden="true" />
                  </button>
                  {open && (
                    <div className="calc-group-fields" id={`calc-group-${group.id}`}>
                      {group.keys.map((key) => {
                        const field = fieldsByKey[key];
                        return (
                          <label key={key} className="calc-field">
                            <span className="calc-lab">
                              {t(`home.calc.${key}`)}
                              <b>{field.unit}</b>
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={field.max}
                              step={field.step}
                              value={raw[key]}
                              onChange={(e) => update(key, e.target.value)}
                              onFocus={() => setMemKey(key)}
                              onBlur={(e) => commitField(key, e.currentTarget.value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Kept or not, on purpose: a session with no trace starts here. */}
            <div
              id="calc-mem-switch"
              className={`calc-mem-switch${memOn ? ' is-on' : ''}`}
            >
              <span className="calc-mem-switch-ico" aria-hidden="true">
                <i className={memOn ? 'ri-history-line' : 'ri-eye-off-line'} />
              </span>
              <span className="calc-mem-switch-copy">
                <b>{t('home.calcPage.memKeep')}</b>
                <em>{t(memOn ? 'home.calcPage.memKeepOn' : 'home.calcPage.memKeepOff')}</em>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={memOn}
                aria-label={t('home.calcPage.memKeep')}
                className={`calc-switch${memOn ? ' is-on' : ''}`}
                onClick={toggleFieldMemory}
              >
                <span className="calc-switch-knob" aria-hidden="true" />
                <span className="calc-switch-lab">
                  {t(memOn ? 'home.calcPage.memKeepYes' : 'home.calcPage.memKeepNo')}
                </span>
              </button>
            </div>
            {memOn && memKey && memChronological.length > 0 && (
              <div className="calc-mem" aria-live="polite">
                <span className="calc-mem-lab">
                  <i className="ri-time-line" aria-hidden="true" />
                  {t('home.calcPage.memLabel')}
                  <span className="calc-mem-sep" aria-hidden="true">·</span>
                  <b>{t(`home.calc.${memKey}`)}</b>
                  <button
                    type="button"
                    className="calc-mem-clear"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearFieldMemory}
                    title={t('home.calcPage.memClearHint')}
                  >
                    <i className="ri-delete-bin-6-line" aria-hidden="true" />
                    {t('home.calcPage.memClear')}
                  </button>
                  <button
                    type="button"
                    className="calc-mem-clear calc-mem-clear--one"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearActiveFieldMemory}
                    title={t('home.calcPage.memClearOneHint')}
                  >
                    <i className="ri-eraser-line" aria-hidden="true" />
                    {t('home.calcPage.memClearOne')}
                  </button>
                </span>
                <div className="calc-mem-chips">
                  {memChronological.map((value, index) => {
                    const isCurrent = value === raw[memKey];
                    return (
                      <span className="calc-mem-item" key={`${value}-${index}`}>
                        {index > 0 && (
                          <i className="ri-arrow-right-s-line calc-mem-arrow" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className={`calc-mem-chip${isCurrent ? ' is-current' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => restoreMemory(memKey, value)}
                          title={t('home.calcPage.memReuse', {
                            value: `${value} ${fieldsByKey[memKey].unit}`,
                          })}
                        >
                          {value}
                          <em>{fieldsByKey[memKey].unit}</em>
                        </button>
                      </span>
                    );
                  })}
                </div>
                {memRoundTrip && (
                  <span className="calc-mem-flag">
                    <i className="ri-arrow-left-right-line" aria-hidden="true" />
                    {t('home.calcPage.memBack')}
                  </span>
                )}
                <button
                  type="button"
                  className="calc-mem-x"
                  onClick={() => setMemKey(null)}
                  aria-label={t('home.calcPage.memClose')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="calc-out">
            <Verdict
              net={metrics.net}
              netMargin={metrics.netMargin}
              marginLabel={pct(metrics.netMargin)}
              goodFloor={goodFloor}
              onGoodFloorChange={setGoodFloor}
            />
            {ghost && (
              <div className="calc-ghost">
                <div className="calc-ghost-lines">
                  <p className="calc-ghost-line">
                    <i className="ri-money-euro-circle-line" aria-hidden="true" />
                    <span>{t('home.calcPage.ghostBefore')}</span>
                    <b>{eur(ghost.before)}</b>
                    <i className="ri-arrow-right-line calc-ghost-arrow" aria-hidden="true" />
                    <span>{t('home.calcPage.ghostNow')}</span>
                    <b className={metrics.net >= ghost.before ? 'is-pos' : 'is-neg'}>
                      {eur(metrics.net)}
                    </b>
                    <em className={metrics.net >= ghost.before ? 'is-pos' : 'is-neg'}>
                      {`${metrics.net - ghost.before >= 0 ? '+' : ''}${eur(
                        metrics.net - ghost.before,
                      )}`}
                    </em>
                  </p>
                  <p className="calc-ghost-line">
                    <i className="ri-percent-line" aria-hidden="true" />
                    <span>{t('home.calcPage.ghostMargin')}</span>
                    <b>{pct(ghost.beforeMargin)}</b>
                    <i className="ri-arrow-right-line calc-ghost-arrow" aria-hidden="true" />
                    <b
                      className={
                        metrics.netMargin >= ghost.beforeMargin ? 'is-pos' : 'is-neg'
                      }
                    >
                      {pct(metrics.netMargin)}
                    </b>
                    <em
                      className={
                        metrics.netMargin >= ghost.beforeMargin ? 'is-pos' : 'is-neg'
                      }
                    >
                      {`${metrics.netMargin - ghost.beforeMargin >= 0 ? '+' : ''}${pts(
                        metrics.netMargin - ghost.beforeMargin,
                      )}`}
                    </em>
                  </p>
                </div>
                <button
                  type="button"
                  className="calc-ghost-x"
                  onClick={() => setGhost(null)}
                  aria-label={t('home.calcPage.ghostClose')}
                >
                  <i className="ri-close-line" aria-hidden="true" />
                </button>
              </div>
            )}
            <p className="calc-live" aria-live="polite" aria-atomic="true">
              {liveResults}
            </p>
            <CalcResults metrics={metrics} locale={locale} />

            <div className="calc-threshold">
              <label className="calc-target">
                <span className="calc-lab">
                  {t('home.calc.targetNet')}
                  <b>€</b>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>

              <div className="calc-threshold-out">
                <div className="calc-threshold-main">
                  <span>{t('home.calc.minPrice')}</span>
                  <b
                    className={
                      threshold.feasible && threshold.headroom >= 0 ? 'is-pos' : 'is-neg'
                    }
                  >
                    {threshold.feasible ? eur(threshold.minPrice) : '—'}
                  </b>
                </div>
                <p
                  className={`calc-threshold-msg${
                    threshold.feasible && threshold.headroom >= 0 ? ' is-pos' : ' is-neg'
                  }`}
                >
                  {!threshold.feasible
                    ? t('home.calc.thresholdUnreachable')
                    : threshold.headroom >= 0
                      ? t('home.calc.thresholdAbove', { value: eur(threshold.headroom) })
                      : t('home.calc.thresholdBelow', {
                          value: eur(Math.abs(threshold.headroom)),
                        })}
                </p>
                <span className="calc-threshold-alt">
                  {t('home.calc.breakEvenPrice')} ·{' '}
                  {threshold.feasible ? eur(threshold.breakEvenPrice) : '—'}
                  {threshold.feasible && (
                    <> · {t('home.calc.minPriceHT', { value: eur(threshold.minPriceHT) })}</>
                  )}
                </span>
              </div>
            </div>

            <div className="calc-bar" aria-hidden="true">
              <span className="calc-bar-cost" style={{ width: `${metrics.costPct}%` }} />
              <span className="calc-bar-profit" style={{ width: `${metrics.profitPct}%` }} />
            </div>
            <div className="calc-bar-legend">
              <span>{t('home.calc.totalCost')} {eur(metrics.totalCost)}</span>
              <span>{t('home.calc.netProfit')} {eur(metrics.net)}</span>
            </div>
            <p className="calc-note">{t('home.calc.note')}</p>
            <p className="calc-note calc-note--soft">
              <i className="ri-save-line" aria-hidden="true" /> {t('home.calc.remembered')}
            </p>
          </div>
        </div>

        <ScenarioStrip
          scenarios={scenarios}
          locale={locale}
          max={MAX_SCENARIOS}
          target={num(target)}
          goodFloor={goodFloor}
          activeId={activeId}
          draftValues={raw}
          onSave={saveScenario}
          onReset={resetCalculator}
          onRename={renameScenario}
          onRemove={removeScenario}
          onLoad={loadScenario}
          onDuplicate={duplicateScenario}
          onPrint={() => setPrintMode('full')}
          onPrintSupplier={() => setPrintMode('supplier')}
          onExport={exportScenarios}
          onImport={(file) => {
            void importScenarios(file);
          }}
          exportState={exportState}
          importResult={importResult}
          histories={histories}
          historyEpoch={historyEpoch}
          supplierNames={supplierNames}
          supplierEmails={supplierEmails}
          onSupplierName={handleSupplierName}
          onSupplierEmail={handleSupplierEmail}
          onHistoryChange={handleHistoryChange}
          onPickPrice={pickPrice}
        />

        <div className="calc-share" data-reveal>
          <div className="calc-share-item">
            <div className="calc-share-main">
              <button type="button" className="calc-btn" onClick={shareNumbers}>
                <i className="ri-link" aria-hidden="true" />
                {t('home.calc.share')}
              </button>
              <span className="calc-share-hint">{t('home.calc.shareHint')}</span>
            </div>
            {feedback('single')}
          </div>

          <div className="calc-share-item">
            <div className="calc-share-main">
              <button
                type="button"
                className="calc-btn"
                onClick={shareComparison}
                disabled={scenarios.length < 2}
              >
                <i className="ri-file-list-3-line" aria-hidden="true" />
                {t('home.calc.sharePlans')}
              </button>
              <span className="calc-share-hint">
                {scenarios.length < 2
                  ? t('home.calc.sharePlansNeed')
                  : t('home.calc.sharePlansHint')}
              </span>
            </div>
            {feedback('plans')}
          </div>
        </div>
      </div>
      {printMode && (
        <PrintSummary
          scenarios={printScenarios}
          locale={locale}
          recapUrl={recapUrl}
          target={num(target)}
          goodFloor={goodFloor}
          histories={histories}
          supplierNames={supplierNames}
          supplierEmails={supplierEmails}
          memory={fieldMem}
          mode={printMode}
          onClose={() => setPrintMode(null)}
        />
      )}
    </section>
  );
}