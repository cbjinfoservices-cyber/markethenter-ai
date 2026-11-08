import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  makeFormatters,
  maxSupplierFor,
  priceForMargin,
  psychoFloorPrice,
  queueCalculation,
} from '@/pages/home/calcModel';
import {
  VERDICT_ICONS,
  VERDICT_KEYS,
  VERDICT_LEGEND_KEYS,
  verdictLevelOf,
} from '@/pages/home/calcVerdict';
import { useGoodFloor } from '@/pages/home/useGoodMargin';
import { usePsychoRule } from '@/pages/home/usePsychoRule';
import { buildSupplierMail } from '@/pages/home/supplierMail';
import { clearFixing, markFixing } from '@/pages/home/scenarioFix';
import { SECOND_SUFFIX, SUPPLIER_EMAILS_EVENT, loadSupplierEmails } from '@/pages/home/priceHistory';
import { supplierNameOf } from '@/pages/home/supplierCompare';
import { greenPriceFor } from '@/pages/dashboard/riskyGain';
import {
  MAIL_LOG_EVENT,
  loadMailLog,
  mailKey,
  recordMailCopy,
} from '@/pages/dashboard/mailLog';
import type { MailLog, MailSide } from '@/pages/dashboard/mailLog';
import { buildRelanceList, relanceContactOf } from '@/pages/dashboard/relanceList';
import type { DashboardRow } from '@/pages/dashboard/useDashboard';
import type { ImportedLogEntry } from '@/pages/sourcing/importedContacts';
import FixedShare from './FixedShare';

type Props = {
  row: DashboardRow;
  index: number;
  locale: string;
  supplierNames: Record<string, string>;
  isBest?: boolean;
  highlight?: boolean;
  /** Came back green from the calculator: the card says so, once. */
  fixed?: boolean;
  /** Horodatage du fichier qui a apporté l'adresse de ce scénario. */
  importedAt?: number | null;
  /** Les derniers réimports de cette fiche, le plus récent d'abord. */
  importHistory?: ImportedLogEntry[];
  /** Retire le badge d'import de cette seule fiche, sans toucher aux autres. */
  onForgetImported?: () => void;
  /** Jours écoulés depuis le dernier réimport, pour une fiche encore anonyme. */
  anonymousDays?: number | null;
  /** Liste « à baptiser » : l'adresse du fournisseur se copie depuis la carte. */
  canCopyEmail?: boolean;
  /** Liste « à baptiser » : la fiche s'ouvre d'ici, champ du nom prêt. */
  canBaptise?: boolean;
};

export default function ScenarioCard({
  row,
  index,
  locale,
  supplierNames,
  isBest = false,
  highlight = false,
  fixed = false,
  importedAt = null,
  importHistory,
  onForgetImported,
  anonymousDays = null,
  canCopyEmail = false,
  canBaptise = false,
}: Props) {
  const { t } = useTranslation();
  const { eur, pct } = useMemo(() => makeFormatters(locale), [locale]);
  /* Same green floor as the calculator — remembered in this browser. */
  const [goodFloor] = useGoodFloor();
  /* Le plancher s'arrête sur la même terminaison que sur la feuille fournisseur. */
  const [psychoRule] = usePsychoRule();
  /* Retour du bouton « Copier l'e-mail bilingue », remis à zéro après un instant. */
  const [mailState, setMailState] = useState<'idle' | 'done' | 'fail'>('idle');
  /* Deux devis = deux destinataires : la carte dit à qui part le message. */
  const [mailSide, setMailSide] = useState<MailSide>('a');
  /* La date du dernier e-mail copié, par scénario et par devis : on voit d'un
     coup d'œil quels fournisseurs ont déjà reçu leur message. */
  const [mailLog, setMailLog] = useState<MailLog>(() => loadMailLog());

  /* Le bouton « Effacer les dates d'envoi » de la liste remet les cartes à zéro
     sans recharger la page. */
  useEffect(() => {
    const sync = () => setMailLog(loadMailLog());
    window.addEventListener(MAIL_LOG_EVENT, sync);
    return () => window.removeEventListener(MAIL_LOG_EVENT, sync);
  }, []);

  const { scenario, metrics, threshold, comparison } = row;
  const level = verdictLevelOf(metrics.net, metrics.netMargin, goodFloor);
  const verdictText = t(VERDICT_LEGEND_KEYS[level].title);
  const name =
    scenario.name.trim() || `${t('home.calc.scenario')} ${String.fromCharCode(65 + index)}`;

  const nameA = supplierNameOf(supplierNames, `s${scenario.id}`, t('home.calc.historySupplierA'));
  const nameB = supplierNameOf(
    supplierNames,
    `s${scenario.id}${SECOND_SUFFIX}`,
    t('home.calc.historySupplierB'),
  );
  const winner = comparison?.winner === 'b' ? nameB : nameA;

  /* L'adresse de ce fournisseur, relue à chaque saisie : la copier ne fait pas
     quitter la liste des fiches à baptiser. */
  const [emails, setEmails] = useState<Record<string, string>>(() => loadSupplierEmails());
  useEffect(() => {
    const sync = () => setEmails(loadSupplierEmails());
    window.addEventListener(SUPPLIER_EMAILS_EVENT, sync);
    return () => window.removeEventListener(SUPPLIER_EMAILS_EVENT, sync);
  }, []);
  const supplierEmail = (
    emails[`s${scenario.id}`] ??
    emails[`s${scenario.id}${SECOND_SUFFIX}`] ??
    ''
  ).trim();
  const [emailState, setEmailState] = useState<'idle' | 'done' | 'fail'>('idle');
  const copySupplierEmail = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (supplierEmail === '') return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(supplierEmail);
      setEmailState('done');
    } catch {
      setEmailState('fail');
    }
    window.setTimeout(() => setEmailState('idle'), 2200);
  };
  /* L'âge de la fiche anonyme : le nom attend depuis le dernier réimport. */
  const anonAgeText = useMemo(() => {
    if (anonymousDays === null || !Number.isFinite(anonymousDays)) return '';
    if (anonymousDays <= 0) return t('home.dash.unnamedAgeToday');
    if (anonymousDays === 1) return t('home.dash.unnamedAgeOne');
    return t('home.dash.unnamedAgeMany', { count: anonymousDays });
  }, [anonymousDays, t]);

  const risky = level === 'bad';
  /* Only trustworthy while the scenario is still green: a badge is never
     shown on a card that turned red again. */
  const showFixed = fixed && level === 'good';
  /* The advised price that would put this scenario back on the green floor —
     computed from the same costs as the traffic light. */
  const greenPrice = useMemo(() => greenPriceFor(row, goodFloor), [row, goodFloor]);
  /* The exact threshold printed on the calculator card and the paper legend:
     same number on both screens, to the cent. */
  const greenThreshold = useMemo(
    () => priceForMargin(row.scenario.values, goodFloor),
    [row, goodFloor],
  );
  /* The negotiation line, next to that price: the purchase price that still
     holds it. Same maths as the supplier sheet, so both say the same thing. */
  const buyCap = useMemo(
    () =>
      greenThreshold === null
        ? null
        : maxSupplierFor(row.scenario.values, greenThreshold, goodFloor),
    [row, greenThreshold, goodFloor],
  );
  /* Le devis choisi porte ses propres chiffres : le second fournisseur n'a
     qu'un prix d'achat à lui, le dernier mois de sa courbe. */
  const hasSecondQuote = Boolean(comparison) && Boolean(row.seriesB?.length);
  const mailValues = useMemo(() => {
    if (mailSide === 'b' && row.seriesB && row.seriesB.length > 0) {
      return {
        ...row.scenario.values,
        supplier: String(row.seriesB[row.seriesB.length - 1]),
      };
    }
    return row.scenario.values;
  }, [mailSide, row.seriesB, row.scenario.values]);

  /* L'e-mail bilingue, prêt à copier depuis la carte : mêmes chiffres que la
     feuille fournisseur (plancher arrondi, puis prix d'achat qui le tient). */
  const bilingual = useMemo(() => {
    const floor = priceForMargin(mailValues, goodFloor);
    if (floor === null) return null;
    const sale = psychoFloorPrice(floor, psychoRule);
    const buy = maxSupplierFor(mailValues, sale, goodFloor);
    if (buy === null) return null;
    return buildSupplierMail('bi', { name, sale: eur(sale), buy: eur(buy) });
  }, [mailValues, psychoRule, goodFloor, name, eur]);

  /* La date enregistrée pour le destinataire affiché, puis en clair. */
  const lastCopied = mailLog[mailKey(scenario.id, mailSide)] ?? null;
  const lastCopiedText = useMemo(() => {
    if (lastCopied === null) return '';
    const when = new Date(lastCopied);
    if (Number.isNaN(when.getTime())) return '';
    const day = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
    }).format(when);
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(when);
    return t('home.dash.mailCopiedOn', { date: day, time });
  }, [lastCopied, locale, t]);

  const copyBilingual = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    /* La carte entière est un lien : ce clic reste sur place. */
    event.preventDefault();
    event.stopPropagation();
    if (!bilingual) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(`${bilingual.subject}\n\n${bilingual.body}`);
      /* La carte garde la trace : ce contact a reçu son message. */
      setMailLog(recordMailCopy(scenario.id, mailSide));
      setMailState('done');
    } catch {
      setMailState('fail');
    }
    window.setTimeout(() => setMailState('idle'), 2200);
  };

  /* La relance du seul fournisseur affiché : son nom, son adresse et ses
     chiffres, sans la liste complète du tableau de bord. */
  const [relanceState, setRelanceState] = useState<'idle' | 'done' | 'fail'>('idle');
  const copySingleRelance = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (!navigator.clipboard) throw new Error('clipboard-unavailable');
      const contact = relanceContactOf(row, mailSide, name, t, goodFloor, psychoRule);
      await navigator.clipboard.writeText(buildRelanceList([contact], locale, t));
      setRelanceState('done');
    } catch {
      setRelanceState('fail');
    }
    window.setTimeout(() => setRelanceState('idle'), 2200);
  };

  /* Une adresse ramenée par le fichier de travail porte sa date, comme sur
     les colonnes du comparatif : saisie au clavier et réimport ne se
     confondent pas. */
  const importedText = useMemo(() => {
    if (importedAt === null || !Number.isFinite(importedAt)) return '';
    const when = new Date(importedAt);
    if (Number.isNaN(when.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(when);
  }, [importedAt, locale]);

  /* Les trois derniers réimports de cette fiche, en petit sous le badge : on
     voit d'un coup d'œil si l'adresse a été reprise plusieurs fois. */
  const importHistoryText = useMemo(() => {
    if (!importHistory || importHistory.length === 0) return [];
    return importHistory
      .slice(0, 3)
      .map((entry) => {
        const when = new Date(entry.at);
        if (Number.isNaN(when.getTime())) return '';
        return new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(when);
      })
      .filter((text) => text !== '');
  }, [importHistory, locale]);

  const showShare = showFixed && greenPrice !== null;
  const cardId = `dash-card-${scenario.id}`;
  const cardClass = `dash-card${isBest ? ' is-best' : ''}${highlight ? ' is-highlight' : ''}`;
  /* Remember what leaves for the calculator, so the way back can tell whether
     it was actually corrected. */
  const loadScenario = () => {
    if (risky) markFixing(scenario.id, true);
    else clearFixing();
    queueCalculation(scenario.values, scenario.id);
  };

  const body = (
    <>
      <div className="dash-card-top">
        <h3>{name}</h3>
        <span className="dash-card-tags">
          <span
            className={`dash-verdict is-${level}`}
            title={t(VERDICT_KEYS[level].advice, { value: goodFloor })}
          >
            <i className={VERDICT_ICONS[level]} aria-hidden="true" />
            {verdictText}
          </span>
          {bilingual && lastCopied === null && (
            <span className="dash-relance-tag" title={t('home.dash.mailPendingHint')}>
              <i className="ri-mail-send-line" aria-hidden="true" />
              {t('home.dash.mailPending')}
            </span>
          )}
          {isBest && <span className="dash-best-tag">{t('home.calc.best')}</span>}
          {showFixed && (
            <span className="dash-fixed-tag" title={t('home.dash.fixedHint')}>
              <i className="ri-checkbox-circle-fill" aria-hidden="true" />
              {t('home.dash.fixedTag')}
            </span>
          )}
        </span>
      </div>

      <b className={`dash-card-net${metrics.net < 0 ? ' is-neg' : ' is-pos'}`}>
        {eur(metrics.net)}
      </b>
      <span className="dash-card-cap">
        {t('home.calc.netProfit')} · {pct(metrics.netMargin)}
      </span>

      {/* L'adresse de ce scénario vient du fichier rempli dans Excel. La
         pastille porte sa propre croix : la trace part fiche par fiche. */}
      {importedText !== '' && (
        <span className="dash-card-imported" title={t('home.dash.importedHint')}>
          <i className="ri-upload-2-line" aria-hidden="true" />
          {t('home.dash.importedTag', { date: importedText })}
          {onForgetImported && (
            <button
              type="button"
              className="dash-card-imported-x"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onForgetImported();
              }}
              aria-label={t('home.dash.importedDropAria')}
              title={t('home.dash.importedDropHint')}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          )}
        </span>
      )}

      {/* Les trois derniers passages du fichier sur cette fiche, sous le badge. */}
      {importHistoryText.length > 1 && (
        <ul className="dash-card-imports" aria-label={t('home.dash.importHistoryAria')}>
          <li className="dash-card-imports-lab">
            <i className="ri-history-line" aria-hidden="true" />
            {t('home.dash.importHistoryLab')}
          </li>
          {importHistoryText.map((text, i) => (
            <li key={`${text}-${i}`}>{text}</li>
          ))}
        </ul>
      )}

      {/* Liste « à baptiser » : l'âge de la fiche et l'adresse du fournisseur,
         à portée de clic — nommer ne demande pas de quitter la liste. */}
      {(anonAgeText !== '' || (canCopyEmail && supplierEmail !== '')) && (
        <div className="dash-card-anon">
          {anonAgeText !== '' && (
            <span
              className={`dash-card-anon-age${
                (anonymousDays ?? 0) >= 10
                  ? ' is-cold'
                  : (anonymousDays ?? 0) >= 3
                    ? ' is-aging'
                    : ''
              }`}
              title={t('home.dash.unnamedAgeHint', { count: anonymousDays ?? 0 })}
            >
              <i className="ri-time-line" aria-hidden="true" />
              {anonAgeText}
            </span>
          )}
          {canCopyEmail && supplierEmail !== '' && (
            <button
              type="button"
              className={`dash-card-anon-mail${emailState === 'done' ? ' is-done' : ''}${
                emailState === 'fail' ? ' is-fail' : ''
              }`}
              onClick={copySupplierEmail}
              title={
                emailState === 'done'
                  ? t('home.dash.unnamedCopyEmailDone', { email: supplierEmail })
                  : emailState === 'fail'
                    ? t('home.dash.unnamedCopyEmailFail')
                    : t('home.dash.unnamedCopyEmailHint', { email: supplierEmail })
              }
              aria-label={t('home.dash.unnamedCopyEmailAria', { email: supplierEmail })}
            >
              <i
                className={
                  emailState === 'done'
                    ? 'ri-check-line'
                    : emailState === 'fail'
                      ? 'ri-error-warning-line'
                      : 'ri-mail-line'
                }
                aria-hidden="true"
              />
              {emailState === 'done'
                ? t('home.dash.unnamedCopyEmailDone', { email: supplierEmail })
                : t('home.dash.unnamedCopyEmail')}
            </button>
          )}
        </div>
      )}

      {/* La fiche s'ouvre depuis la carte : le nom se saisit sans repasser par
         la bannière de la liste filtrée. */}
      {canBaptise && (
        <Link
          className="dash-card-baptise"
          to={`/calculateur?history=s${scenario.id}&baptise=1#calculator`}
          onClick={loadScenario}
          title={t('home.dash.unnamedBaptiseCardHint')}
          aria-label={t('home.dash.unnamedBaptiseCardAria', { name })}
        >
          <i className="ri-edit-line" aria-hidden="true" />
          {t('home.dash.unnamedBaptiseCard')}
        </Link>
      )}

      {/* Same green price as the calculator card, so both screens agree: what
         this scenario earns today, and the price from which it turns green. */}
      <span
        className={`dash-card-green${greenThreshold === null ? ' is-none' : ''}`}
        title={t('home.calc.cardGreenHint', { value: goodFloor })}
      >
        <i className="ri-checkbox-blank-circle-fill" aria-hidden="true" />
        <em>{t('home.calc.cardGreenFrom')}</em>
        <b>{greenThreshold === null ? '—' : eur(greenThreshold)}</b>
      </span>

      {/* La phrase de négociation, à côté du prix conseillé : le prix de vente
         à tenir, et le prix d'achat qui le tient encore. */}
      {greenThreshold !== null && buyCap !== null && (
        <span className="dash-card-pitch" title={t('home.dash.pitchHint')}>
          <i className="ri-chat-quote-line" aria-hidden="true" />
          {t('home.dash.pitch', { sale: eur(greenThreshold), buy: eur(buyCap) })}
        </span>
      )}

      {/* Deux devis : le message part au fournisseur choisi, avec ses chiffres. */}
      {bilingual && hasSecondQuote && (
        <div className="dash-card-pick" role="group" aria-label={t('home.dash.mailPickLab')}>
          <span className="dash-card-pick-lab">
            <i className="ri-user-received-line" aria-hidden="true" />
            {t('home.dash.mailPickLab')}
          </span>
          {(['a', 'b'] as MailSide[]).map((side) => {
            const sentAt = mailLog[mailKey(scenario.id, side)];
            const label = side === 'a' ? nameA : nameB;
            return (
              <button
                key={side}
                type="button"
                className={`dash-card-pick-btn${mailSide === side ? ' is-on' : ''}${
                  sentAt ? ' is-sent' : ''
                }`}
                aria-pressed={mailSide === side}
                onClick={() => {
                  setMailSide(side);
                  setMailState('idle');
                }}
                title={
                  sentAt
                    ? t('home.dash.mailPickSentHint', { name: label })
                    : t('home.dash.mailPickHint', { name: label })
                }
              >
                {label}
                {sentAt !== undefined && <i className="ri-check-line" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}

      {/* L'e-mail bilingue, copiable sans passer par le récapitulatif. */}
      {bilingual && (
        <button
          type="button"
          className={`dash-card-mail${mailState === 'done' ? ' is-done' : ''}${
            mailState === 'fail' ? ' is-fail' : ''
          }`}
          onClick={copyBilingual}
          title={
            mailState === 'fail'
              ? t('home.dash.mailBiFail')
              : t('home.dash.mailBiHint')
          }
        >
          <i
            className={
              mailState === 'done'
                ? 'ri-check-line'
                : mailState === 'fail'
                  ? 'ri-error-warning-line'
                  : 'ri-translate-2'
            }
            aria-hidden="true"
          />
          {t(
            mailState === 'done'
              ? 'home.dash.mailBiDone'
              : mailState === 'fail'
                ? 'home.dash.mailBiFail'
                : 'home.dash.mailBi',
          )}
        </button>
      )}

      {/* Ce fournisseur attend encore son message : sa relance se copie seule,
         sans emporter le reste de la liste. */}
      {bilingual && lastCopied === null && (
        <button
          type="button"
          className={`dash-card-mail dash-card-relance${
            relanceState === 'done' ? ' is-done' : ''
          }${relanceState === 'fail' ? ' is-fail' : ''}`}
          onClick={copySingleRelance}
          title={
            relanceState === 'fail'
              ? t('home.dash.cardRelanceFail')
              : t('home.dash.cardRelanceHint')
          }
        >
          <i
            className={
              relanceState === 'done'
                ? 'ri-check-line'
                : relanceState === 'fail'
                  ? 'ri-error-warning-line'
                  : 'ri-mail-send-line'
            }
            aria-hidden="true"
          />
          {t(
            relanceState === 'done'
              ? 'home.dash.cardRelanceDone'
              : relanceState === 'fail'
                ? 'home.dash.cardRelanceFail'
                : 'home.dash.cardRelance',
          )}
        </button>
      )}

      {/* Ce contact a déjà reçu son message : la date reste sur la carte. */}
      {bilingual && lastCopiedText !== '' && (
        <span className="dash-card-mail-when">
          <i className="ri-time-line" aria-hidden="true" />
          {lastCopiedText}
        </span>
      )}

      <div className="dash-bar" aria-hidden="true">
        <span className="dash-bar-cost" style={{ width: `${metrics.costPct}%` }} />
        <span className="dash-bar-profit" style={{ width: `${metrics.profitPct}%` }} />
      </div>

      <dl className="dash-card-rows">
        <div>
          <dt>{t('home.dash.margin')}</dt>
          <dd>{pct(metrics.netMargin)}</dd>
        </div>
        <div>
          <dt>{t('home.dash.roi')}</dt>
          <dd>{pct(metrics.roi)}</dd>
        </div>
        <div>
          <dt>{t('home.dash.minPrice')}</dt>
          <dd>{threshold.feasible ? eur(threshold.minPrice) : '—'}</dd>
        </div>
        <div>
          <dt>{t('home.dash.breakEven')}</dt>
          <dd>{threshold.feasible ? eur(threshold.breakEvenPrice) : '—'}</dd>
        </div>
        <div>
          <dt>{t('home.dash.monthly')}</dt>
          <dd>{eur(metrics.monthly)}</dd>
        </div>
        <div>
          <dt>{t('home.dash.price')}</dt>
          <dd>{eur(metrics.price)}</dd>
        </div>
      </dl>

      {comparison ? (
        <div className={`dash-supplier${comparison.winner === 'tie' ? ' is-tie' : ''}`}>
          <i
            className={comparison.winner === 'tie' ? 'ri-scales-3-line' : 'ri-trophy-line'}
            aria-hidden="true"
          />
          <div>
            <span>{t('home.calc.supplierBestBadge')}</span>
            <b>
              {comparison.winner === 'tie'
                ? t('home.calc.supplierBestTieShort')
                : `${winner} · ${t('home.calc.supplierBestSave', {
                    value: eur(comparison.savedPerUnit),
                  })}`}
            </b>
          </div>
        </div>
      ) : (
        <p className="dash-card-none">
          <i className="ri-store-2-line" aria-hidden="true" />
          {t('home.dash.supplierNone')}
        </p>
      )}
    </>
  );

  /* A scenario on red keeps all its lines and gets one explicit action: the
     reader knows the click opens the calculator with these numbers. */
  if (risky) {
    return (
      <div className={`${cardClass} is-fix`} id={cardId}>
        {body}
        <Link
          className="dash-card-fix"
          to="/calculateur#calculator"
          onClick={loadScenario}
          aria-label={t('home.dash.fixLabel', { name })}
        >
          <i className="ri-tools-line" aria-hidden="true" />
          {t('home.dash.fixCta')}
        </Link>
      </div>
    );
  }

  /* Back on green: the card offers to share the price that got it there.
     Not one big link any more — the share button needs its own click. */
  if (showShare) {
    return (
      <div className={cardClass} id={cardId}>
        {body}
        <FixedShare
          name={name}
          values={{ ...scenario.values, price: String(greenPrice) }}
          greenPrice={greenPrice}
          currentPrice={metrics.price}
          floor={goodFloor}
          locale={locale}
        />
        <Link
          className="dash-card-link"
          to="/calculateur#calculator"
          onClick={loadScenario}
          aria-label={t('home.dash.loadIntoLabel', { name })}
        >
          {t('home.dash.loadInto')}
          <i className="ri-arrow-right-up-line" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  /* La carte n'est plus un lien englobant : le bouton e-mail a son propre
     clic, et le lien de chargement garde le sien. */
  return (
    <div className={cardClass} id={cardId}>
      {body}
      <Link
        className="dash-card-link"
        to="/calculateur#calculator"
        onClick={loadScenario}
        aria-label={t('home.dash.loadIntoLabel', { name })}
      >
        {t('home.dash.loadInto')}
        <i className="ri-arrow-right-up-line" aria-hidden="true" />
      </Link>
    </div>
  );
}