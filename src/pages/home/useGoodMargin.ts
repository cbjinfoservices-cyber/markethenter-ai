import { useCallback, useEffect, useRef, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { DEFAULT_GOOD_FLOOR, clampGoodFloor } from '@/pages/home/calcVerdict';
import { fetchGoodFloor, saveGoodFloor } from '@/pages/home/goodFloorCloud';

/** Browser memory key — the floor is also kept in the account, cloud wins. */
export const GOOD_FLOOR_KEY = 'mh:calc:goodFloor';
const GOOD_FLOOR_EVENT = 'mh:good-floor';
/** Tells every block which side the floor in use comes from. */
const GOOD_FLOOR_ORIGIN_EVENT = 'mh:good-floor-origin';

/** Where the floor currently on screen comes from: the account, or this device. */
export type GoodFloorOrigin = 'account' | 'device';

/** One account pull per session, shared by every block reading the floor. */
let pulledFor: string | null = null;

/** Module-level, so every block reads the same answer without another request. */
let floorOrigin: GoodFloorOrigin = 'device';

export function readGoodFloorOrigin(): GoodFloorOrigin {
  return floorOrigin;
}

/** Records the provenance and wakes up every block showing it. */
function markGoodFloorOrigin(next: GoodFloorOrigin): void {
  if (floorOrigin === next) return;
  floorOrigin = next;
  try {
    window.dispatchEvent(new CustomEvent(GOOD_FLOOR_ORIGIN_EVENT, { detail: next }));
  } catch {
    /* no window events available */
  }
}

export function readGoodFloor(): number {
  try {
    const stored = window.localStorage.getItem(GOOD_FLOOR_KEY);
    if (!stored) return DEFAULT_GOOD_FLOOR;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampGoodFloor(parsed) : DEFAULT_GOOD_FLOOR;
  } catch {
    return DEFAULT_GOOD_FLOOR;
  }
}

export function persistGoodFloor(value: number): void {
  const floor = clampGoodFloor(value);
  try {
    window.localStorage.setItem(GOOD_FLOOR_KEY, String(floor));
  } catch {
    /* storage blocked — the floor stays for this session only */
  }
  try {
    window.dispatchEvent(new CustomEvent(GOOD_FLOOR_EVENT, { detail: floor }));
  } catch {
    /* no window events available */
  }
}

/**
 * Whether the green floor on screen was read from the account or only kept in
 * this browser — the same signal the rounding rule gives in the supplier sheet.
 */
export function useGoodFloorOrigin(): GoodFloorOrigin {
  const [origin, setOrigin] = useState<GoodFloorOrigin>(() => readGoodFloorOrigin());

  useEffect(() => {
    const onOrigin = (event: Event) => {
      const detail = (event as CustomEvent<GoodFloorOrigin>).detail;
      setOrigin(detail === 'account' ? 'account' : 'device');
    };
    window.addEventListener(GOOD_FLOOR_ORIGIN_EVENT, onOrigin);
    return () => window.removeEventListener(GOOD_FLOOR_ORIGIN_EVENT, onOrigin);
  }, []);

  return origin;
}

/**
 * The margin from which the verdict turns green, shared by every block that
 * shows a traffic light. It is remembered in this browser and, once signed in,
 * in the account — a threshold set on the laptop is there on the phone.
 */
export function useGoodFloor(): [number, (value: number) => void] {
  const [floor, setFloor] = useState<number>(() => readGoodFloor());
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const writeTimer = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setFloor(readGoodFloor());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      setFloor(Number.isFinite(detail) ? clampGoodFloor(detail) : readGoodFloor());
    };
    window.addEventListener(GOOD_FLOOR_EVENT, onCustom);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GOOD_FLOOR_EVENT, onCustom);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /* The floor set on another device lands here once, right after sign-in. */
  useEffect(() => {
    if (!userId) {
      pulledFor = null;
      markGoodFloorOrigin('device');
      return undefined;
    }
    if (pulledFor === userId) return undefined;
    pulledFor = userId;
    let cancelled = false;
    fetchGoodFloor(userId)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud === null) {
          /* Nothing in the account yet: this device's floor becomes the one. */
          void saveGoodFloor(userId, readGoodFloor()).catch(() => undefined);
        } else {
          persistGoodFloor(cloud);
          setFloor(cloud);
        }
        /* The floor now lives in the account, whichever side wrote it. */
        markGoodFloorOrigin('account');
      })
      .catch(() => {
        if (!cancelled) {
          pulledFor = null;
          markGoodFloorOrigin('device');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(
    () => () => {
      if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    },
    [],
  );

  const choose = useCallback(
    (value: number) => {
      const next = clampGoodFloor(value);
      persistGoodFloor(next);
      setFloor(next);
      if (!userId) {
        markGoodFloorOrigin('device');
        return;
      }
      /* The slider moves fast: one write once the finger settles. */
      if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
      writeTimer.current = window.setTimeout(() => {
        void saveGoodFloor(userId, next)
          .then(() => markGoodFloorOrigin('account'))
          .catch(() => markGoodFloorOrigin('device'));
      }, 650);
    },
    [userId],
  );

  return [floor, choose];
}