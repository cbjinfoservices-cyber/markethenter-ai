/**
 * A tiny figure strip shown on each module card: what the module actually
 * returns, in numbers. Sample values, same costs as the calculator.
 */
export type ModulePreview = {
  /** Caption above the headline figure. */
  lab: string;
  /** Headline figure. */
  big: string;
  l1: string;
  v1: string;
  l2: string;
  v2: string;
  /** Optional micro bar, in percent — a margin, a share of green scenarios. */
  bar?: number;
};

const pv = (index: string, bar?: number): ModulePreview => ({
  lab: `home.modulesPage.pv${index}lab`,
  big: `home.modulesPage.pv${index}big`,
  l1: `home.modulesPage.pv${index}l1`,
  v1: `home.modulesPage.pv${index}v1`,
  l2: `home.modulesPage.pv${index}l2`,
  v2: `home.modulesPage.pv${index}v2`,
  bar,
});

export const MODULE_PREVIEWS: Record<string, ModulePreview> = {
  '01': pv('01'),
  '02': pv('02', 39),
  '03': pv('03', 67),
  '04': pv('04', 31),
  '05': pv('05'),
  '06': pv('06'),
  '07': pv('07'),
  '08': pv('08'),
  '09': pv('09'),
  '10': pv('10', 39),
};