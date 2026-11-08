export type PlanId = 'starter' | 'pro' | 'agency' | 'ent';

export type PlanInfo = {
  id: PlanId;
  featured: boolean;
  /** Index des modules inclus, tels que définis dans `MODULES`. */
  modules: string[];
  /** Modules inclus mais restreints dans cette formule. */
  limited?: string[];
};

const ALL_MODULES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];

export const PLANS: PlanInfo[] = [
  { id: 'starter', featured: false, modules: ['01', '02', '10'], limited: ['01'] },
  { id: 'pro', featured: true, modules: ['01', '02', '03', '04', '05', '06', '09', '10'] },
  { id: 'agency', featured: false, modules: ALL_MODULES },
  { id: 'ent', featured: false, modules: ALL_MODULES },
];
