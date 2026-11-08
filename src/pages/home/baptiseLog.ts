/** Combien de fiches ont reçu un nom de fournisseur aujourd'hui.
 *
 * Le compteur ne garde que la journée en cours : la date est écrite à côté des
 * numéros de fiche, donc au premier regard du matin la veille n'existe plus.
 * Une même fiche nommée deux fois dans la journée ne compte qu'une fois.
 */

import { useEffect, useState } from 'react';
import {
  SECOND_SUFFIX,
  SUPPLIER_NAMES_EVENT,
  loadSupplierNames,
  persistSupplierNames,
} from '@/pages/home/priceHistory';

const BAPTISE_KEY = 'mh:calc:baptised-today';

/** Une fiche vient d'être baptisée : la bannière se met à jour sans recharger. */
export const BAPTISE_EVENT = 'mh:calc:baptised';

type BaptiseDay = { date: string; ids: number[] };

/** Une fiche nommée aujourd'hui, prête à être listée dans la bannière. */
export type BaptisedSheet = {
  /** Le numéro de scénario, pour retrouver la fiche du calculateur. */
  id: number;
  /** Le nom saisi, ou une chaîne vide si la mémoire n'en garde plus. */
  name: string;
};

function todayKey(now = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function readDay(): BaptiseDay {
  const today = todayKey();
  try {
    const stored = window.localStorage.getItem(BAPTISE_KEY);
    if (!stored) return { date: today, ids: [] };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { date: today, ids: [] };
    }
    const record = parsed as { date?: unknown; ids?: unknown };
    const date = typeof record.date === 'string' ? record.date : '';
    /* Nouveau jour : le compteur repart de zéro, la veille est oubliée. */
    if (date !== today) return { date: today, ids: [] };
    const ids = Array.isArray(record.ids)
      ? record.ids
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];
    return { date, ids: Array.from(new Set(ids)) };
  } catch {
    return { date: today, ids: [] };
  }
}

function writeDay(ids: number[]): void {
  try {
    window.localStorage.setItem(
      BAPTISE_KEY,
      JSON.stringify({ date: todayKey(), ids: Array.from(new Set(ids)) }),
    );
    window.dispatchEvent(new Event(BAPTISE_EVENT));
  } catch {
    /* storage blocked — the counter simply stays quiet */
  }
}

/** Une fiche reçoit son nom : on la note pour la journée en cours. */
export function noteBaptisedSheet(id: number): void {
  if (!Number.isFinite(id) || id <= 0) return;
  const day = readDay();
  if (day.ids.includes(id)) return;
  writeDay([...day.ids, id]);
}

/** Le jour en cours, la plus récemment nommée d'abord. */
function readDayLatestFirst(): number[] {
  return [...readDay().ids].reverse();
}

/** Le nombre de fiches baptisées depuis ce matin. */
export function loadBaptisedToday(): number {
  return readDay().ids.length;
}

/** Les clés de mémoire où le nom d'une fiche peut être écrit. */
function nameKeysOf(id: number): string[] {
  return [`s${id}`, `s${id}${SECOND_SUFFIX}`, `scenario-${id}`];
}

/** Les fiches nommées aujourd'hui, avec leur nom, la plus récente d'abord. */
export function loadBaptisedSheets(): BaptisedSheet[] {
  const names = loadSupplierNames();
  return readDayLatestFirst().map((id) => {
    const key = nameKeysOf(id).find((item) => (names[item] ?? '').trim() !== '');
    return { id, name: key ? names[key].trim() : '' };
  });
}

/**
 * Un nom saisi par erreur : on l'efface de la fiche et du compteur du jour.
 * La fiche revient aussitôt dans la liste « à baptiser », puisque c'est le nom
 * enregistré qui la sort de cette liste. L'adresse, elle, reste en place.
 */
export function forgetBaptisedSheet(id: number): void {
  if (!Number.isFinite(id) || id <= 0) return;
  const names = { ...loadSupplierNames() };
  let changed = false;
  nameKeysOf(id).forEach((key) => {
    if (names[key] !== undefined) {
      delete names[key];
      changed = true;
    }
  });
  if (changed) persistSupplierNames(names);
  const day = readDay();
  if (day.ids.includes(id)) {
    writeDay(day.ids.filter((item) => item !== id));
  }
}

/** Délai jusqu'au prochain minuit local, pour remettre le compteur à zéro. */
function msToMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Compteur vivant : il suit la saisie et retombe à zéro au petit matin. */
export function useBaptisedTodaySheets(): BaptisedSheet[] {
  const [sheets, setSheets] = useState<BaptisedSheet[]>(() => loadBaptisedSheets());

  useEffect(() => {
    let timer = 0;
    const sync = () => setSheets(loadBaptisedSheets());
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        arm();
      }, msToMidnight());
    };
    window.addEventListener(BAPTISE_EVENT, sync);
    window.addEventListener(SUPPLIER_NAMES_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    arm();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(BAPTISE_EVENT, sync);
      window.removeEventListener(SUPPLIER_NAMES_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return sheets;
}

/** Le nombre de fiches baptisées depuis ce matin. */
export function useBaptisedToday(): number {
  return useBaptisedTodaySheets().length;
}