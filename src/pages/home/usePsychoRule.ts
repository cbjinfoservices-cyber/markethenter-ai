import { useCallback, useEffect, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import {
  DEFAULT_PSYCHO_RULE,
  PSYCHO_RULE_VALUES,
  isPsychoRule,
} from '@/pages/home/calcModel';
import type { PsychoRule } from '@/pages/home/calcModel';
import { fetchPsychoRule, savePsychoRule } from '@/pages/home/psychoRuleCloud';

/** Browser memory key — the rule is also kept in the account, cloud wins. */
export const PSYCHO_RULE_KEY = 'mh:calc:psychoRule';
const PSYCHO_RULE_EVENT = 'mh:psycho-rule';

export const PSYCHO_RULES: PsychoRule[] = PSYCHO_RULE_VALUES;
export { DEFAULT_PSYCHO_RULE };

/** One account pull per session, shared by every block reading the rule. */
let pulledFor: string | null = null;

export function readPsychoRule(): PsychoRule {
  try {
    const stored = window.localStorage.getItem(PSYCHO_RULE_KEY);
    return isPsychoRule(stored) ? stored : DEFAULT_PSYCHO_RULE;
  } catch {
    return DEFAULT_PSYCHO_RULE;
  }
}

export function persistPsychoRule(value: PsychoRule): void {
  const rule = isPsychoRule(value) ? value : DEFAULT_PSYCHO_RULE;
  try {
    window.localStorage.setItem(PSYCHO_RULE_KEY, rule);
  } catch {
    /* storage blocked — the rule stays for this session only */
  }
  try {
    window.dispatchEvent(new CustomEvent(PSYCHO_RULE_EVENT, { detail: rule }));
  } catch {
    /* no window events available */
  }
}

/**
 * The ending the supplier floor is rounded to. Remembered in this browser and,
 * once signed in, in the account — like the margin floor, so the rule chosen
 * on one device is the rule read on the next one.
 */
export function usePsychoRule(): [PsychoRule, (value: PsychoRule) => void] {
  const [rule, setRule] = useState<PsychoRule>(() => readPsychoRule());
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    const sync = () => setRule(readPsychoRule());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<PsychoRule>).detail;
      setRule(isPsychoRule(detail) ? detail : readPsychoRule());
    };
    window.addEventListener(PSYCHO_RULE_EVENT, onCustom);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PSYCHO_RULE_EVENT, onCustom);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /* The rule set on another device lands here once, right after sign-in. */
  useEffect(() => {
    if (!userId) {
      pulledFor = null;
      return undefined;
    }
    if (pulledFor === userId) return undefined;
    pulledFor = userId;
    let cancelled = false;
    fetchPsychoRule(userId)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud === null) {
          /* Nothing in the account yet: this device's rule becomes the one. */
          void savePsychoRule(userId, readPsychoRule()).catch(() => undefined);
          return;
        }
        persistPsychoRule(cloud);
        setRule(cloud);
      })
      .catch(() => {
        if (!cancelled) pulledFor = null;
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const choose = useCallback(
    (value: PsychoRule) => {
      const next = isPsychoRule(value) ? value : DEFAULT_PSYCHO_RULE;
      persistPsychoRule(next);
      setRule(next);
      if (!userId) return;
      void savePsychoRule(userId, next).catch(() => undefined);
    },
    [userId],
  );

  return [rule, choose];
}