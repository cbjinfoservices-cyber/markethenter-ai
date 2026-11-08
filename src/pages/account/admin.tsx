import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import useAccountAccess from '@/hooks/useAccountAccess';
import {
  ACCOUNT_PLANS, ACCOUNT_ROLES, accountErrorKey, fetchAdminAccounts,
  isAccountPlan, isAccountRole, updateAccount,
} from '@/lib/accountAccess';
import type { AccountPlan, AccountRole, AdminAccount, AdminSnapshot } from '@/lib/accountAccess';
import { isSupabaseReady } from '@/lib/supabase';
import AccountLayout from './AccountLayout';
import SourcingSettings from './SourcingSettings';

function AccountRow({ account, busy, onSave }: {
  account: AdminAccount;
  busy: boolean;
  onSave: (account: AdminAccount, role: AccountRole, plan: AccountPlan) => void;
}) {
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState(account.role);
  const [plan, setPlan] = useState(account.plan);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short' }).format(new Date(value)) : '—';
  return (
    <tr>
      <td>{account.email ?? account.id}<small>{account.id}</small></td>
      <td>{t(account.confirmed ? 'account.confirmed' : 'account.unconfirmed')}</td>
      <td>{formatDate(account.created_at)}</td>
      <td>{formatDate(account.last_sign_in_at)}</td>
      <td>
        <select value={role} disabled={busy} aria-label={t('account.roleFor', { email: account.email ?? account.id })}
          onChange={(event) => { if (isAccountRole(event.target.value)) setRole(event.target.value); }}>
          {ACCOUNT_ROLES.map((value) => <option key={value} value={value}>{t(`account.roles.${value}`)}</option>)}
        </select>
      </td>
      <td>
        <select value={plan} disabled={busy} aria-label={t('account.planFor', { email: account.email ?? account.id })}
          onChange={(event) => { if (isAccountPlan(event.target.value)) setPlan(event.target.value); }}>
          {ACCOUNT_PLANS.map((value) => <option key={value} value={value}>{t(`account.plans.${value}`)}</option>)}
        </select>
      </td>
      <td>
        <button type="button" disabled={busy || (role === account.role && plan === account.plan)}
          onClick={() => {
            if (window.confirm(t('account.confirmChange', {
              email: account.email ?? account.id, role: t(`account.roles.${role}`), plan: t(`account.plans.${plan}`),
            }))) onSave(account, role, plan);
          }}>{t('account.save')}</button>
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading, authError } = useAuth();
  const userId = user?.id;
  const { access, error: accessError, loading: accessLoading, refresh: refreshAccess } = useAccountAccess(user?.id);
  const [page, setPage] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<{
    owner: string; snapshot: AdminSnapshot | null; loading: boolean; error: string | null;
  }>({ owner: '', snapshot: null, loading: false, error: null });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ owner: string; key: string; error: boolean } | null>(null);
  const savingRef = useRef(false);
  const ownerRef = useRef(user?.id);
  ownerRef.current = user?.id;

  useEffect(() => {
    let active = true;
    if (!userId || access?.role !== 'admin') {
      setState({ owner: '', snapshot: null, loading: false, error: null });
      return;
    }
    const owner = userId;
    setState({ owner, snapshot: null, loading: true, error: null });
    fetchAdminAccounts(page).then((snapshot) => {
      if (active) {
        if (page > 0 && snapshot.accounts.length === 0) setPage(Math.max(0, Math.ceil(snapshot.total / 25) - 1));
        else setState({ owner, snapshot, loading: false, error: null });
      }
    }).catch((error: unknown) => {
      if (active) setState({ owner, snapshot: null, loading: false, error: accountErrorKey(error) });
    });
    return () => { active = false; };
  }, [userId, access?.role, page, epoch]);

  const save = async (account: AdminAccount, role: AccountRole, plan: AccountPlan) => {
    if (!user || savingRef.current) return;
    const owner = user.id;
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      await updateAccount(account, role, plan);
      if (ownerRef.current === owner) {
        setNotice({ owner, key: 'account.saved', error: false });
        setEpoch((value) => value + 1);
        refreshAccess();
      }
    } catch (error) {
      if (ownerRef.current === owner) setNotice({ owner, key: accountErrorKey(error), error: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const snapshot = state.owner === user?.id ? state.snapshot : null;
  const permitted = isSupabaseReady && access?.role === 'admin';
  return (
    <AccountLayout>
      <h1>{t('account.adminTitle')}</h1>
      {isSupabaseReady && authError && <p role="alert">{t('account.authFailure')}</p>}
      {!isSupabaseReady ? <p role="alert">{t('account.noBackend')}</p> : authLoading || accessLoading ? (
        <p role="status">{t('account.loading')}</p>
      ) : !user ? (
        <p>{t('account.signInRequired')} <Link to="/compte">{t('home.account.signIn')}</Link></p>
      ) : accessError ? (
        <p role="alert">{t(accessError)} <button type="button" onClick={refreshAccess}>{t('account.refresh')}</button></p>
      ) : !permitted ? <p role="alert">{t('account.errors.admin-required')}</p> : (
        <>
          <p>{t('account.adminIntro')}</p>
          <SourcingSettings key={user.id} />
          <p>{t('account.planDisclaimer')}</p>
          <button type="button" disabled={saving || state.loading} onClick={() => {
            setNotice(null);
            setEpoch((value) => value + 1);
            refreshAccess();
          }}>{t('account.refresh')}</button>
          {state.loading && <p role="status">{t('account.loading')}</p>}
          {state.error && <p role="alert">{t(state.error)}</p>}
          {notice?.owner === user.id && <p role={notice.error ? 'alert' : 'status'}>{t(notice.key)}</p>}
          {snapshot && (
            <>
              <dl className="account-stats">
                {(['total', 'admins', 'confirmed', 'recent'] as const).map((key) => (
                  <div key={key}><dt>{t(`account.stats.${key}`)}</dt><dd>{snapshot[key]}</dd></div>
                ))}
                {ACCOUNT_PLANS.map((plan) => (
                  <div key={plan}><dt>{t(`account.plans.${plan}`)}</dt><dd>{snapshot.plans[plan] ?? 0}</dd></div>
                ))}
              </dl>
              <p>{t('account.statsDisclaimer')}</p>
              <div className="account-table-wrap">
                <table className="account-table">
                  <caption>{t('account.users')}</caption>
                  <thead><tr>
                    {['email', 'status', 'created', 'lastSignIn', 'role', 'plan', 'action'].map((key) =>
                      <th scope="col" key={key}>{t(`account.${key}`)}</th>)}
                  </tr></thead>
                  <tbody>
                    {snapshot.accounts.map((account) => (
                      <AccountRow key={`${account.id}:${account.updated_at}`} account={account} busy={saving}
                        onSave={(target, role, plan) => { void save(target, role, plan); }} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="account-actions">
                <button type="button" disabled={page === 0 || saving} onClick={() => setPage((value) => value - 1)}>{t('account.previous')}</button>
                <span>{t('account.page', { page: page + 1, total: Math.max(1, Math.ceil(snapshot.total / 25)) })}</span>
                <button type="button" disabled={(page + 1) * 25 >= snapshot.total || saving}
                  onClick={() => setPage((value) => value + 1)}>{t('account.next')}</button>
              </div>
            </>
          )}
        </>
      )}
    </AccountLayout>
  );
}
