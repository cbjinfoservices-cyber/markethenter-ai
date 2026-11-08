import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import useAccountAccess from '@/hooks/useAccountAccess';
import { isSupabaseReady } from '@/lib/supabase';
import AuthDialog from '@/pages/home/components/AuthDialog';
import AccountLayout from './AccountLayout';

export default function AccountPage() {
  const { t } = useTranslation();
  const { user, loading, authError } = useAuth();
  const { access, error, loading: accessLoading, refresh } = useAccountAccess(user?.id);
  const [dialog, setDialog] = useState<'signin' | 'signup' | null>(null);

  return (
    <AccountLayout>
      <h1>{t('account.title')}</h1>
      {isSupabaseReady && authError && <p role="alert">{t('account.authFailure')}</p>}
      {!isSupabaseReady ? <p role="alert">{t('account.noBackend')}</p> : loading ? (
        <p role="status">{t('account.loading')}</p>
      ) : !user ? (
        <section className="account-panel">
          <h2>{t('account.welcome')}</h2>
          <p>{t('account.signupInfo')}</p>
          <div className="account-actions">
            <button type="button" onClick={() => setDialog('signup')}>{t('home.account.signUp')}</button>
            <button type="button" onClick={() => setDialog('signin')}>{t('home.account.signIn')}</button>
          </div>
        </section>
      ) : (
        <section className="account-panel">
          <h2>{user.email}</h2>
          <p>{t(user.email_confirmed_at ? 'account.confirmed' : 'account.unconfirmed')}</p>
          {accessLoading && <p role="status">{t('account.loading')}</p>}
          {error && <p role="alert">{t(error)}</p>}
          {access && (
            <dl className="account-details">
              <div><dt>{t('account.role')}</dt><dd>{t(`account.roles.${access.role}`)}</dd></div>
              <div><dt>{t('account.plan')}</dt><dd>{t(`account.plans.${access.plan}`)}</dd></div>
            </dl>
          )}
          <p>{t('account.planDisclaimer')}</p>
          <div className="account-actions">
            <button type="button" onClick={refresh} disabled={accessLoading}>{t('account.refresh')}</button>
            {access?.role === 'admin' && <Link to="/administration">{t('account.adminTitle')}</Link>}
          </div>
        </section>
      )}
      <p>{t('account.separateAccounts')}</p>
      {dialog && <AuthDialog initialMode={dialog} onClose={() => setDialog(null)} />}
    </AccountLayout>
  );
}
