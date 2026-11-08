const FILTER_KEY = 'mh.dash.risky';

/**
 * The risky filter lives in the URL (?filter=risky) so it can be opened from
 * the burger. This tiny memory keeps it alive while the reader goes to the
 * calculator and comes back to the dashboard.
 */
export function rememberRiskyFilter(active: boolean): void {
  try {
    if (active) window.sessionStorage.setItem(FILTER_KEY, '1');
    else window.sessionStorage.removeItem(FILTER_KEY);
  } catch {
    /* storage blocked — the filter simply is not remembered */
  }
}

export function readRiskyFilter(): boolean {
  try {
    return window.sessionStorage.getItem(FILTER_KEY) === '1';
  } catch {
    return false;
  }
}