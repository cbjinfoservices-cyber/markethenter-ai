import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import {
  FIELDS,
  compute,
  makeFormatters,
  maxSupplierFor,
  num,
  priceForMargin,
  psychoFloorPrice,
  thresholdFor,
} from '@/pages/home/calcModel';
import type { Scenario } from '@/pages/home/calcModel';
import { HISTORY_MONTHS, monthLabels } from '@/pages/home/priceHistory';
import { buildPrintCurves } from '@/pages/home/printCurves';
import {
  buildSensitivityPoints,
  buildSensitivityText,
  sensitivityMarkers,
} from '@/pages/home/sensitivityModel';
import { VERDICT_ICONS, VERDICT_KEYS, verdictLevelOf } from '@/pages/home/calcVerdict';
import PrintCurve from './PrintCurve';
import { FIELD_MEMORY_MAX } from '@/pages/home/fieldMemory';
import type { FieldMemory } from '@/pages/home/fieldMemory';
import { PSYCHO_RULES, usePsychoRule } from '@/pages/home/usePsychoRule';
import { buildSupplierMail } from '@/pages/home/supplierMail';
import type { SupplierMailLang } from '@/pages/home/supplierMail';
import { printDocumentTitle } from '@/pages/home/printTitle';

export type PrintMode = 'full' | 'supplier';

/* Le libellé de chaque langue du modèle d'e-mail, y compris la version bilingue. */
const MAIL_LANG_LABELS: Record<SupplierMailLang, string> = {
  fr: 'home.calc.printSupplierMailLangFr',
  en: 'home.calc.printSupplierMailLangEn',
  bi: 'home.calc.printSupplierMailLangBi',
};

type Props = {
  scenarios: Scenario[];
  locale: string;
  recapUrl: string;
  target: number;
  goodFloor: number;
  histories: Record<string, number[]>;
  supplierNames?: Record<string, string>;
  /** The address that fills the recipient of the supplier e-mail. */
  supplierEmails?: Record<string, string>;
  /** The last five values committed on each field, printed as an annex. */
  memory?: FieldMemory;
  mode?: PrintMode;
  onClose: () => void;
};

export default function PrintSummary({
  scenarios,
  locale,
  recapUrl,
  target,
  goodFloor,
  histories,
  supplierNames = {},
  supplierEmails = {},
  memory = {},
  mode = 'full',
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  const [linkState, setLinkState] = useState<'idle' | 'done' | 'fail'>('idle');
  /* One copy line per scenario: which one was copied, and whether it worked. */
  const [pitchState, setPitchState] = useState<{ id: number; ok: boolean } | null>(null);
  /* Same feedback for the ready-to-send supplier e-mail. */
  const [mailState, setMailState] = useState<{ id: number; ok: boolean } | null>(null);
  /* Le bouton « Copier l'adresse », juste à côté du destinataire. */
  const [addrState, setAddrState] = useState<{ id: number; ok: boolean } | null>(null);
  /* L'objet seul, pour ne coller qu'une partie du modèle dans un fil existant. */
  const [subjectState, setSubjectState] = useState<{ id: number; ok: boolean } | null>(null);
  /* La grille de sensibilité copiée en texte, pour WhatsApp. */
  const [gridState, setGridState] = useState<{ id: number; ok: boolean } | null>(null);
  /* How the supplier floor is rounded: ,90 by default, or ,99 / ,00. */
  const [psychoRule, setPsychoRule] = usePsychoRule();
  /* La langue du modèle d'e-mail : le contact peut ne pas lire le français. */
  const [mailLang, setMailLang] = useState<SupplierMailLang>(
    locale.toLowerCase().startsWith('fr') ? 'fr' : 'en',
  );
  /* D'où vient la règle : du compte, ou seulement de cet appareil ? */
  const { user } = useAuth();
  const supplierOnly = mode === 'supplier';

  const rows = useMemo(
    () => scenarios.map((s) => ({ scenario: s, metrics: compute(s.values) })),
    [scenarios],
  );

  const bestNet = rows.length > 1 ? Math.max(...rows.map((r) => r.metrics.net)) : null;

  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date()),
    [locale],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const nameOf = (scenario: Scenario, index: number) =>
    scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;

  const months = useMemo(() => monthLabels(locale, HISTORY_MONTHS), [locale]);

  /* The 12-month supplier curve printed per scenario, so the supplier sees the trend.
     A second quote is drawn alongside when one was recorded, and the scenario's
     break-even price is traced across the chart as an alert line. */
  const curves = useMemo(
    () => buildPrintCurves(scenarios, histories, supplierNames, (key) => t(key)),
    [scenarios, histories, supplierNames, t],
  );

  /* Sale price ladder printed under the supplier curve, scenario by scenario. */
  const sensitivity = useMemo(
    () =>
      scenarios.map((scenario) => {
        const points = buildSensitivityPoints(scenario.values);
        return {
          points,
          ...sensitivityMarkers(points, scenario.values),
          floorIndex: points.findIndex(
            (point) => verdictLevelOf(point.net, point.margin, goodFloor) === 'good',
          ),
        };
      }),
    [scenarios, goodFloor],
  );

  const cell = (value: string, unit: string) => {
    if (unit === '€') return eur(num(value));
    if (unit === '%') return `${num(value)} %`;
    return new Intl.NumberFormat(locale).format(num(value));
  };

  const results: { label: string; render: (index: number) => string; strong?: boolean }[] = [
    { label: t('home.calc.netProfit'), render: (i) => eur(rows[i].metrics.net), strong: true },
    { label: t('home.calc.netMargin'), render: (i) => pct(rows[i].metrics.netMargin) },
    { label: t('home.calc.roi'), render: (i) => pct(rows[i].metrics.roi) },
    { label: t('home.calc.totalCost'), render: (i) => eur(rows[i].metrics.totalCost) },
    {
      label: t('home.calc.minPrice'),
      render: (i) => {
        const threshold = thresholdFor(rows[i].scenario.values, target);
        return threshold.feasible ? eur(threshold.minPrice) : '—';
      },
    },
    { label: t('home.calc.monthly'), render: (i) => eur(rows[i].metrics.monthly) },
    { label: t('home.calc.grossMargin'), render: (i) => pct(rows[i].metrics.grossMargin) },
    { label: t('home.calc.priceHT'), render: (i) => eur(rows[i].metrics.priceHT) },
    { label: t('home.calc.vatAmount'), render: (i) => eur(rows[i].metrics.vatAmount) },
    { label: t('home.calc.netHT'), render: (i) => eur(rows[i].metrics.netHT) },
    { label: t('home.calc.netMarginHT'), render: (i) => pct(rows[i].metrics.netMarginHT) },
  ];

  /* Le seuil vert, traduit en euros : le prix de vente à partir duquel chaque
     scénario atteint la marge visée. La légende ne dit donc plus seulement
     « 20 % », elle dit « à partir de 17,50 € ». */
  const greenPrices = useMemo(
    () =>
      rows.map(({ scenario }, index) => {
        const exact = priceForMargin(scenario.values, goodFloor);
        return {
          id: scenario.id,
          name:
            scenario.name.trim() ||
            `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`,
          price: exact,
          /* Le plancher arrondi est le seul chiffre imprimé : les deux
             feuilles annoncent donc exactement le même prix de vente. */
          rounded: exact === null ? null : psychoFloorPrice(exact, psychoRule),
        };
      }),
    [rows, goodFloor, psychoRule, t],
  );

  /* Le fournisseur ne lit pas nos pourcentages : sur sa feuille, le plancher
     est arrondi au prix psychologique juste au-dessus (17,42 € → 17,90 €),
     donc jamais en dessous du calcul. On en déduit le prix d'achat maximum
     qui tient encore ce prix de vente. */
  const supplierFloors = useMemo(
    () =>
      greenPrices.map((item, index) => {
        const price = item.rounded;
        return {
          id: item.id,
          name: item.name,
          price,
          /* L'adresse du fournisseur, imprimée sous son nom : le document
             se suffit à lui-même, plus besoin de rouvrir le calculateur. */
          email: (supplierEmails[`s${item.id}`] ?? '').trim(),
          buy:
            price === null
              ? null
              : maxSupplierFor(rows[index].scenario.values, price, goodFloor),
        };
      }),
    [greenPrices, rows, goodFloor, supplierEmails],
  );

  /* À qui le document est destiné : le nom et l'adresse de chaque fournisseur
     déjà saisi dans le calculateur, pour identifier le papier d'un coup d'œil. */
  const recipients = useMemo(() => {
    const seen = new Set<string>();
    return supplierFloors.flatMap((item) => {
      if (item.email === '') return [];
      const key = `${item.name}|${item.email}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id: item.id, name: item.name, email: item.email }];
    });
  }, [supplierFloors]);

  /* One ready-to-copy negotiation line per scenario, purchase price included. */
  const supplierPitches = useMemo(
    () =>
      supplierFloors.flatMap((item) => {
        if (item.price === null || item.buy === null) return [];
        /* Le destinataire vient de la fiche fournisseur du calculateur. */
        const email = (supplierEmails[`s${item.id}`] ?? '').trim();
        return [{ id: item.id, name: item.name, price: item.price, buy: item.buy, email }];
      }),
    [supplierFloors, supplierEmails],
  );

  const copyPitch = async (id: number, text: string) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      setPitchState({ id, ok: true });
    } catch {
      setPitchState({ id, ok: false });
    }
  };

  /* Le modèle d'e-mail reprend les deux mêmes chiffres que la phrase de
     négociation : le prix de vente à tenir et le prix d'achat visé. */
  const mailOf = (item: { name: string; price: number; buy: number }) =>
    buildSupplierMail(mailLang, {
      name: item.name,
      sale: eur(item.price),
      buy: eur(item.buy),
    });

  const copyMail = async (id: number, subject: string, body: string) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setMailState({ id, ok: true });
    } catch {
      setMailState({ id, ok: false });
    }
  };

  /* L'adresse seule, pour la coller dans Alibaba ou WhatsApp sans la retaper. */
  const copyAddress = async (id: number, email: string) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(email);
      setAddrState({ id, ok: true });
    } catch {
      setAddrState({ id, ok: false });
    }
  };

  /* L'objet seul : on garde le message à part, on ne colle que la ligne d'objet. */
  const copySubject = async (id: number, subject: string) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(subject);
      setSubjectState({ id, ok: true });
    } catch {
      setSubjectState({ id, ok: false });
    }
  };

  /* La grille de sensibilité en texte brut : les mêmes lignes que la feuille,
     prêtes à coller dans WhatsApp ou dans un message au fournisseur. */
  const copyGrid = async (id: number, index: number) => {
    const grid = sensitivity[index];
    const tags = grid.points.map((point, i) => {
      if (i !== grid.nowIndex) return '';
      return supplierOnly
        ? t('home.calc.printSensitivityNow')
        : t('home.calc.sensitivityNow');
    });
    const text = buildSensitivityText(
      `${t('home.calc.sensitivityTitle')} — ${greenPrices[index]?.name ?? ''}`,
      grid.points,
      tags,
      { eur, pct },
      t('home.calc.sensitivityNote', {
        price: eur(num(scenarios[index].values.price)),
        breakEven: grid.hasBreakEven ? eur(grid.breakEven) : '—',
      }),
    );
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      setGridState({ id, ok: true });
    } catch {
      setGridState({ id, ok: false });
    }
  };

  /* Ce qui a été tapé avant de fixer un chiffre : une annexe papier, champ par
     champ, la plus récente en haut. Un aller-retour se lit donc tout seul. */
  const memoryRows = useMemo(() => {
    const fields = FIELDS.filter((f) => (memory[f.key] ?? []).length > 0);
    const count = fields.reduce(
      (max, f) => Math.max(max, Math.min(FIELD_MEMORY_MAX, (memory[f.key] ?? []).length)),
      0,
    );
    return { fields, count, ranks: Array.from({ length: count }, (_, i) => i) };
  }, [memory]);

  const copyRecapLink = async () => {
    if (!recapUrl) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(recapUrl);
      setLinkState('done');
    } catch {
      setLinkState('fail');
    }
  };

  const title = supplierOnly ? t('home.calc.printSupplierTitle') : t('home.calc.printTitle');

  /* Le nom du PDF enregistré reprend le titre de la feuille puis le nom et
     l'adresse du destinataire : le destinataire retrouve son document dans ses
     téléchargements sans l'ouvrir. Valable pour les deux feuilles — le récap
     classique comme la feuille fournisseur. */
  const pdfName = useMemo(
    () => printDocumentTitle(title, recipients),
    [title, recipients],
  );

  useEffect(() => {
    if (recipients.length === 0) return undefined;
    const previous = document.title;
    document.title = pdfName;
    return () => {
      document.title = previous;
    };
  }, [recipients.length, pdfName]);

  return createPortal(
    <div className="calc-print-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-tools">
        <button type="button" className="sheet-btn sheet-btn--solid" onClick={() => window.print()}>
          <i className="ri-printer-line" aria-hidden="true" />
          {t('home.calc.printNow')}
        </button>
        {!supplierOnly && (
          <button type="button" className="sheet-btn" onClick={copyRecapLink}>
            <i className="ri-link" aria-hidden="true" />
            {t('home.calc.recapShare')}
          </button>
        )}
        <button type="button" className="sheet-btn" onClick={onClose}>
          <i className="ri-close-line" aria-hidden="true" />
          {t('home.calc.printClose')}
        </button>
      </div>

      {!supplierOnly && linkState !== 'idle' && (
        <div className="sheet-link">
          {linkState === 'done' ? (
            <span className="sheet-link-ok">
              <i className="ri-checkbox-circle-line" aria-hidden="true" />
              {t('home.calc.recapCopied')}
            </span>
          ) : (
            <>
              <span>{t('home.calc.copyManual')}</span>
              <input
                type="text"
                readOnly
                value={recapUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
            </>
          )}
        </div>
      )}

      <div className={`calc-sheet${supplierOnly ? ' calc-sheet--supplier' : ''}`}>
        <header className="sheet-head">
          <div>
            <span className="sheet-brand">MarketHunter AI</span>
            <h2>{title}</h2>
            {/* Le destinataire en clair, dès le haut de la feuille — sur le
                récap classique comme sur la feuille fournisseur. */}
            {recipients.length > 0 && (
              <div className="sheet-supplier-for">
                {recipients.map((item) => (
                  <span className="sheet-supplier-for-line" key={`for-${item.id}`}>
                    <i className="ri-user-received-line" aria-hidden="true" />
                    {t(
                      supplierOnly
                        ? 'home.calc.printSupplierPreparedFor'
                        : 'home.calc.printRecapPreparedFor',
                      {
                        name: item.name,
                        email: item.email,
                      },
                    )}
                  </span>
                ))}
                {/* Le fichier enregistré portera ce nom : on l'annonce avant
                    l'impression, pour que le PDF ne parte pas sous un nom anonyme. */}
                <span className="sheet-supplier-file">
                  <i className="ri-file-pdf-2-line" aria-hidden="true" />
                  {t(
                    supplierOnly
                      ? 'home.calc.printSupplierFileHint'
                      : 'home.calc.printRecapFileHint',
                    { name: `${pdfName}.pdf` },
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="sheet-meta">
            <span>{date}</span>
            <span>
              {supplierOnly ? t('home.calc.printSupplierUnit') : t('home.calc.printUnit')}
            </span>
          </div>
        </header>

        {!supplierOnly && (
          <section className="sheet-verdict" aria-label={t('home.calc.printVerdictCap')}>
            <div className="sheet-verdict-cap">
              <span>{t('home.calc.printVerdictCap')}</span>
              <span>{t('home.calc.printVerdictFloor', { value: goodFloor })}</span>
            </div>
            <div className="sheet-verdict-row">
              {rows.map(({ scenario, metrics }, index) => {
                const level = verdictLevelOf(metrics.net, metrics.netMargin, goodFloor);
                return (
                  <div
                    className={`sheet-verdict-cell is-${level}`}
                    key={`verdict-${scenario.id}`}
                  >
                    <i className={VERDICT_ICONS[level]} aria-hidden="true" />
                    <span className="sheet-verdict-name">{nameOf(scenario, index)}</span>
                    <b className="sheet-verdict-title">{t(VERDICT_KEYS[level].title)}</b>
                    <span className="sheet-verdict-margin">{pct(metrics.netMargin)}</span>
                    <span className="sheet-verdict-green">
                      <em>{t('home.calc.printVerdictGreenFrom')}</em>
                      <b>
                        {greenPrices[index]?.rounded == null
                          ? '—'
                          : eur(greenPrices[index].rounded as number)}
                      </b>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {supplierOnly ? (
          <section className="sheet-supplier">
            {/* Le fournisseur voit le prix plancher, sans aucun pourcentage de
                marge : de quoi négocier sans lire nos comptes internes. */}
            <div className="sheet-supplier-floor">
              <span className="sheet-supplier-floor-cap">
                <i className="ri-price-tag-3-line" aria-hidden="true" />
                {t('home.calc.printSupplierFloorTitle')}
              </span>
              <p className="sheet-supplier-floor-note">
                {t('home.calc.printSupplierFloorCap')}
              </p>
              <div className="sheet-supplier-floor-row">
                {supplierFloors.map((item) => (
                  <span
                    className={`sheet-supplier-floor-pill${
                      item.price === null ? ' is-none' : ''
                    }`}
                    key={`floor-${item.id}`}
                  >
                    <span className="sheet-supplier-floor-id">
                      <em>{item.name}</em>
                      {item.email !== '' && (
                        <span className="sheet-supplier-floor-mail">
                          <i className="ri-at-line" aria-hidden="true" />
                          {item.email}
                        </span>
                      )}
                    </span>
                    <b>{item.price === null ? '—' : eur(item.price)}</b>
                  </span>
                ))}
              </div>
              {/* Le réglage d'arrondi, posé juste sous les pastilles : la règle
                  choisie se lit dans la note, et ne part pas sur le papier. */}
              <div className="sheet-supplier-rule">
                <span className="sheet-supplier-rule-lab">
                  <i className="ri-equalizer-line" aria-hidden="true" />
                  {t('home.calc.printSupplierRuleLab')}
                </span>
                <div className="sheet-supplier-rule-picks" role="group" aria-label={t('home.calc.printSupplierRuleLab')}>
                  {PSYCHO_RULES.map((rule) => (
                    <button
                      key={rule}
                      type="button"
                      className={`sheet-supplier-rule-pick${psychoRule === rule ? ' is-on' : ''}`}
                      aria-pressed={psychoRule === rule}
                      onClick={() => setPsychoRule(rule)}
                    >
                      ,{rule}
                    </button>
                  ))}
                </div>
                <span className="sheet-supplier-rule-hint">
                  {t('home.calc.printSupplierRuleHint')}
                </span>
                {/* La provenance de la règle, comme pour le seuil de marge. */}
                <span className={`sheet-supplier-rule-sync${user ? ' is-on' : ''}`}>
                  <i
                    className={user ? 'ri-cloud-line' : 'ri-cloud-off-line'}
                    aria-hidden="true"
                  />
                  {t(
                    user
                      ? 'home.calc.printSupplierRuleSyncOn'
                      : 'home.calc.printSupplierRuleSyncOff',
                  )}
                </span>
              </div>
              <p className="sheet-supplier-floor-round">
                <i className="ri-arrow-up-double-line" aria-hidden="true" />
                {t('home.calc.printSupplierFloorRound', { rule: `,${psychoRule}` })}
              </p>
              {supplierPitches.length > 0 && (
                <div className="sheet-supplier-pitch">
                  <span className="sheet-supplier-pitch-cap">
                    <i className="ri-chat-quote-line" aria-hidden="true" />
                    {t('home.calc.printSupplierPitchTitle')}
                  </span>
                  <ul className="sheet-supplier-pitch-list">
                    {supplierPitches.map((item) => {
                      const text = `${item.name} — ${t('home.calc.printSupplierPitch', {
                        sale: eur(item.price),
                        buy: eur(item.buy),
                      })}`;
                      const copied = pitchState?.id === item.id && pitchState.ok;
                      return (
                        <li key={`pitch-${item.id}`}>
                          <p>{text}</p>
                          <button
                            type="button"
                            className="sheet-supplier-pitch-copy"
                            onClick={() => copyPitch(item.id, text)}
                          >
                            <i
                              className={copied ? 'ri-check-line' : 'ri-file-copy-line'}
                              aria-hidden="true"
                            />
                            {copied
                              ? t('home.calc.printSupplierPitchDone')
                              : t('home.calc.printSupplierPitchCopy')}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {pitchState && !pitchState.ok && (
                    <p className="sheet-supplier-pitch-fail">
                      {t('home.calc.printSupplierPitchFail')}
                    </p>
                  )}
                </div>
              )}

              {/* L'e-mail fournisseur, prérempli avec les deux mêmes chiffres. */}
              {supplierPitches.length > 0 && (
                <div className="sheet-supplier-mail">
                  <span className="sheet-supplier-mail-cap">
                    <i className="ri-mail-send-line" aria-hidden="true" />
                    {t('home.calc.printSupplierMailTitle')}
                  </span>
                  <p className="sheet-supplier-mail-note">
                    {t('home.calc.printSupplierMailCap')}
                  </p>
                  {/* La langue du modèle : le contact peut ne lire que l'anglais. */}
                  <div className="sheet-supplier-mail-lang">
                    <span className="sheet-supplier-mail-lang-lab">
                      <i className="ri-translate-2" aria-hidden="true" />
                      {t('home.calc.printSupplierMailLangLab')}
                    </span>
                    {(['fr', 'en', 'bi'] as SupplierMailLang[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={`sheet-supplier-mail-lang-pick${
                          mailLang === lang ? ' is-on' : ''
                        }`}
                        aria-pressed={mailLang === lang}
                        onClick={() => setMailLang(lang)}
                      >
                        {t(MAIL_LANG_LABELS[lang])}
                      </button>
                    ))}
                    <span className="sheet-supplier-mail-lang-hint">
                      {t('home.calc.printSupplierMailLangHint')}
                    </span>
                  </div>
                  <ul className="sheet-supplier-mail-list">
                    {supplierPitches.map((item) => {
                      const { subject, body } = mailOf(item);
                      const copied = mailState?.id === item.id && mailState.ok;
                      const addrCopied = addrState?.id === item.id && addrState.ok;
                      const addrFailed = addrState?.id === item.id && !addrState.ok;
                      const subjCopied = subjectState?.id === item.id && subjectState.ok;
                      const subjFailed = subjectState?.id === item.id && !subjectState.ok;
                      /* L'objet se copie seul : à côté du destinataire quand il y
                         en a un, sinon avec les autres actions du modèle. */
                      const subjectBtn = (
                        <button
                          type="button"
                          className={`sheet-supplier-mail-copysubject${
                            subjCopied ? ' is-done' : ''
                          }${subjFailed ? ' is-fail' : ''}`}
                          onClick={() => copySubject(item.id, subject)}
                        >
                          <i
                            className={
                              subjCopied
                                ? 'ri-check-line'
                                : subjFailed
                                  ? 'ri-error-warning-line'
                                  : 'ri-file-copy-line'
                            }
                            aria-hidden="true"
                          />
                          {t(
                            subjCopied
                              ? 'home.calc.printSupplierMailCopySubjectDone'
                              : subjFailed
                                ? 'home.calc.printSupplierMailCopySubjectFail'
                                : 'home.calc.printSupplierMailCopySubject',
                          )}
                        </button>
                      );
                      return (
                        <li key={`mail-${item.id}`}>
                          <span className="sheet-supplier-mail-subject">
                            <em>{t('home.calc.printSupplierMailSubjectLab')}</em>
                            {subject}
                          </span>
                          <p className="sheet-supplier-mail-body">{body}</p>
                          {item.email !== '' && (
                            <p className="sheet-supplier-mail-to">
                              <i className="ri-at-line" aria-hidden="true" />
                              {t('home.calc.printSupplierMailTo', { email: item.email })}
                              <button
                                type="button"
                                className={`sheet-supplier-mail-copyaddr${
                                  addrCopied ? ' is-done' : ''
                                }${addrFailed ? ' is-fail' : ''}`}
                                onClick={() => copyAddress(item.id, item.email)}
                              >
                                <i
                                  className={
                                    addrCopied
                                      ? 'ri-check-line'
                                      : addrFailed
                                        ? 'ri-error-warning-line'
                                        : 'ri-file-copy-line'
                                  }
                                  aria-hidden="true"
                                />
                                {t(
                                  addrCopied
                                    ? 'home.calc.printSupplierMailCopyAddrDone'
                                    : addrFailed
                                      ? 'home.calc.printSupplierMailCopyAddrFail'
                                      : 'home.calc.printSupplierMailCopyAddr',
                                )}
                              </button>
                              {subjectBtn}
                            </p>
                          )}
                          <span className="sheet-supplier-mail-actions">
                            {item.email === '' && subjectBtn}
                            <a
                              className="sheet-supplier-mail-open"
                              href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                            >
                              <i className="ri-send-plane-line" aria-hidden="true" />
                              {t('home.calc.printSupplierMailOpen')}
                            </a>
                            <button
                              type="button"
                              className="sheet-supplier-mail-copy"
                              onClick={() => copyMail(item.id, subject, body)}
                            >
                              <i
                                className={copied ? 'ri-check-line' : 'ri-file-copy-line'}
                                aria-hidden="true"
                              />
                              {copied
                                ? t('home.calc.printSupplierMailDone')
                                : t('home.calc.printSupplierMailCopy')}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {mailState && !mailState.ok && (
                    <p className="sheet-supplier-pitch-fail">
                      {t('home.calc.printSupplierMailFail')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <h3 className="sheet-sens-title">{t('home.calc.printSupplierCurves')}</h3>
            <p className="sheet-sens-cap">{t('home.calc.printSupplierCap')}</p>
            <div className="sheet-supplier-grid">
              {rows.map(({ scenario }, index) => (
                <article className="sheet-supplier-cell" key={`supplier-${scenario.id}`}>
                  <div className="sheet-supplier-head">
                    <span className="sheet-sens-name">{nameOf(scenario, index)}</span>
                    <span className="sheet-sens-meta">
                      {t('home.calc.printSupplierSale', { price: eur(num(scenario.values.price)) })}
                    </span>
                  </div>
                  <PrintCurve
                    curve={curves[index]}
                    scenarioId={scenario.id}
                    name={nameOf(scenario, index)}
                    months={months}
                    eur={eur}
                    large
                  />
                </article>
              ))}
            </div>
          </section>
        ) : (
          <>
            {/* The colour code printed above the figures: green starts at the chosen floor. */}
            <div className="sheet-legend">
              <span className="sheet-legend-lab">
                <i className="ri-palette-line" aria-hidden="true" />
                {t('home.calc.printLegendTitle', { value: goodFloor })}
              </span>
              <ul className="sheet-legend-list">
                <li className="is-good">
                  <span className="sheet-legend-swatch" aria-hidden="true" />
                  {t('home.calc.printLegendGood', { value: goodFloor })}
                </li>
                <li className="is-warn">
                  <span className="sheet-legend-swatch" aria-hidden="true" />
                  {t('home.calc.printLegendWarn', { value: goodFloor })}
                </li>
                <li className="is-bad">
                  <span className="sheet-legend-swatch" aria-hidden="true" />
                  {t('home.calc.printLegendBad')}
                </li>
              </ul>
              <div className="sheet-legend-prices">
                <span className="sheet-legend-prices-lab">
                  <i className="ri-price-tag-3-line" aria-hidden="true" />
                  {t('home.calc.printLegendGreenFrom')}
                </span>
                {greenPrices.map((item) => (
                  <span
                    className={`sheet-legend-price${item.rounded === null ? ' is-none' : ''}`}
                    key={`green-price-${item.id}`}
                  >
                    <em>{item.name}</em>
                    <b>{item.rounded === null ? '—' : eur(item.rounded)}</b>
                  </span>
                ))}
                <span className="sheet-legend-round">
                  <i className="ri-arrow-up-double-line" aria-hidden="true" />
                  {t('home.calc.printLegendGreenRound', { rule: `,${psychoRule}` })}
                </span>
              </div>
            </div>
          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col" className="sheet-rowlab" />
                {rows.map(({ scenario, metrics }, index) => (
                  <th scope="col" key={scenario.id}>
                    <span className="sheet-colname">{nameOf(scenario, index)}</span>
                    {bestNet !== null && metrics.net === bestNet && (
                      <span className="sheet-best">{t('home.calc.best')}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="sheet-group">
                <th colSpan={rows.length + 1} scope="colgroup">{t('home.calc.printAssumptions')}</th>
              </tr>
              {FIELDS.map((f) => (
                <tr key={f.key}>
                  <th scope="row" className="sheet-rowlab">
                    {t(`home.calc.${f.key}`)} <span className="sheet-unit">{f.unit}</span>
                  </th>
                  {rows.map(({ scenario }) => (
                    <td key={scenario.id}>{cell(scenario.values[f.key], f.unit)}</td>
                  ))}
                </tr>
              ))}

              <tr className="sheet-group">
                <th colSpan={rows.length + 1} scope="colgroup">{t('home.calc.printResults')}</th>
              </tr>
              {results.map((row) => (
                <tr key={row.label} className={row.strong ? 'is-strong' : undefined}>
                  <th scope="row" className="sheet-rowlab">{row.label}</th>
                  {rows.map((_, index) => (
                    <td key={rows[index].scenario.id}>{row.render(index)}</td>
                  ))}
                </tr>
              ))}

              <tr>
                <th scope="row" className="sheet-rowlab">{t('home.calc.breakdown')}</th>
                {rows.map(({ scenario, metrics }) => (
                  <td key={scenario.id}>
                    <div className="sheet-split">
                      <span className="sheet-split-cost" style={{ width: `${metrics.costPct}%` }} />
                      <span className="sheet-split-profit" style={{ width: `${metrics.profitPct}%` }} />
                    </div>
                    <span className="sheet-split-cap">
                      {t('home.calc.costPart')} {pct(metrics.costPct)} · {t('home.calc.profitPart')} {pct(metrics.profitPct)}
                    </span>
                  </td>
                ))}
              </tr>

              <tr className="sheet-group">
                <th colSpan={rows.length + 1} scope="colgroup">
                  {t('home.calc.printHistory')}
                </th>
              </tr>
              <tr>
                <th scope="row" className="sheet-rowlab">
                  {t('home.calc.supplier')} <span className="sheet-unit">EUR</span>
                </th>
                {rows.map(({ scenario }, index) => (
                  <td key={scenario.id}>
                    <PrintCurve
                      curve={curves[index]}
                      scenarioId={scenario.id}
                      name={nameOf(scenario, index)}
                      months={months}
                      eur={eur}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          </>
        )}

        <section className="sheet-sens">
          <h3 className="sheet-sens-title">{t('home.calc.printSensitivity')}</h3>
          <p className="sheet-sens-cap">{t('home.calc.printSensitivityCap')}</p>
          {!supplierOnly && (
            <p className="sheet-sens-cap sheet-sens-floor">
              <i className="ri-lightbulb-line" aria-hidden="true" />
              {t('home.calc.printSensitivityFloor', { value: goodFloor })}
            </p>
          )}
          {rows.map(({ scenario }, index) => {
            const grid = sensitivity[index];
            return (
              <div className="sheet-sens-block" key={`sens-${scenario.id}`}>
                <div className="sheet-sens-head">
                  <span className="sheet-sens-name">{nameOf(scenario, index)}</span>
                  <span className="sheet-sens-meta">
                    {t('home.calc.printSensitivityNow')} · {eur(num(scenario.values.price))}
                  </span>
                </div>
                <div className="sheet-sens-grid">
                  {grid.points.map((point, i) => {
                    /* Same green floor as the screen: the paper says where green starts. */
                    const level = verdictLevelOf(point.net, point.margin, goodFloor);
                    const isFloor = !supplierOnly && i === grid.floorIndex;
                    return (
                      <div
                        key={`${scenario.id}-sp-${i}`}
                        className={`sheet-sens-cell${supplierOnly ? '' : ` is-${level}`}${
                          isFloor ? ' is-floor' : ''
                        }${i === grid.nowIndex ? ' is-now' : ''}${
                          point.net < 0 ? ' is-neg' : ''
                        }`}
                      >
                        <span className="sheet-sens-price">{eur(point.price)}</span>
                        <span className="sheet-sens-net">{eur(point.net)}</span>
                        <span className="sheet-sens-margin">{pct(point.margin)}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Le tableau part aussi en texte, sous la grille imprimée. */}
                {supplierOnly && (
                  <div className="sheet-sens-copy-row">
                    <button
                      type="button"
                      className={`sheet-sens-copy${
                        gridState?.id === scenario.id && gridState.ok ? ' is-done' : ''
                      }${
                        gridState?.id === scenario.id && !gridState.ok ? ' is-fail' : ''
                      }`}
                      onClick={() => copyGrid(scenario.id, index)}
                      title={t('home.calc.printSensitivityCopyHint')}
                    >
                      <i
                        className={
                          gridState?.id === scenario.id && gridState.ok
                            ? 'ri-check-line'
                            : gridState?.id === scenario.id
                              ? 'ri-error-warning-line'
                              : 'ri-whatsapp-line'
                        }
                        aria-hidden="true"
                      />
                      {t(
                        gridState?.id === scenario.id && gridState.ok
                          ? 'home.calc.printSensitivityCopyDone'
                          : gridState?.id === scenario.id
                            ? 'home.calc.printSensitivityCopyFail'
                            : 'home.calc.printSensitivityCopy',
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {!supplierOnly && memoryRows.count > 0 && (
          <section className="sheet-mem">
            <h3 className="sheet-sens-title">{t('home.calc.printMemory')}</h3>
            <p className="sheet-sens-cap">{t('home.calc.printMemoryCap')}</p>
            <table className="sheet-mem-table">
              <thead>
                <tr>
                  <th scope="col" className="sheet-rowlab">
                    {t('home.calc.csvMemRank')}
                  </th>
                  {memoryRows.fields.map((field) => (
                    <th scope="col" key={field.key}>
                      {t(`home.calc.${field.key}`)}
                      <span className="sheet-unit">{field.unit}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memoryRows.ranks.map((rank) => (
                  <tr key={`mem-${rank}`}>
                    <th scope="row" className="sheet-rowlab">{rank + 1}</th>
                    {memoryRows.fields.map((field) => (
                      <td key={`${field.key}-${rank}`}>
                        {memory[field.key]?.[rank] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="sheet-foot">
          <span>
            {supplierOnly ? t('home.calc.printSupplierFooter') : t('home.calc.printFooter')}
          </span>
          <span>{supplierOnly ? t('home.calc.printSupplierNote') : t('home.calc.note')}</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}