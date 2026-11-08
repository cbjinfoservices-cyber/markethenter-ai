import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import AuthDialog from './AuthDialog';
import LangSwitch from './LangSwitch';

export default function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [dialog, setDialog] = useState<'signin' | 'signup' | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const label = user?.email ?? '';
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const flash = () => {
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  /* Copy the full address to the clipboard, with a fallback for browsers that
     refuse the async clipboard API. */
  const copyMail = async () => {
    if (!label) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(label);
      } else {
        const area = document.createElement('textarea');
        area.value = label;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      flash();
    } catch {
      /* clipboard blocked — the address stays visible and selectable */
    }
  };

  const closePanel = () => {
    setOpen(false);
    setCopied(false);
  };

  const openSignIn = () => {
    closePanel();
    setDialog('signin');
  };

  const leaveAccount = async () => {
    setSignOutFailed(false);
    const error = await signOut();
    if (error) {
      setSignOutFailed(true);
      return;
    }
    closePanel();
    navigate('/', { replace: true });
  };

  return (
    <div className="account" ref={box}>
      <button
        type="button"
        className={['account-btn', user ? 'is-in' : ''].filter(Boolean).join(' ')}
        onClick={() => user ? (open ? closePanel() : setOpen(true)) : openSignIn()}
        aria-expanded={open}
        aria-haspopup={user ? 'true' : 'dialog'}
        title={user ? `${label} — ${t('home.account.menuLabel')}` : t('home.account.signIn')}
        aria-label={user ? t('home.account.menuLabel') : t('home.account.signIn')}
        disabled={!user && loading}
      >
        {user ? <span className="account-avatar">{initial}</span> : <i className="ri-user-line" aria-hidden="true" />}
        <span className="account-mail">{user ? t('home.account.menuLabel') : t('home.account.signIn')}</span>
        <i className={open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} aria-hidden="true" />
      </button>

      {open && (
        <div className="account-menu">
          {user ? (
            <>
              <div className="account-menu-head">
                <p className="account-menu-mail" title={label}>{label}</p>
                <button
                  type="button"
                  className={['account-copy', copied ? 'is-done' : ''].filter(Boolean).join(' ')}
                  onClick={() => void copyMail()}
                  aria-label={copied ? t('home.account.copied') : t('home.account.copyMail')}
                  title={copied ? t('home.account.copied') : t('home.account.copyMail')}
                >
                  <i className={copied ? 'ri-check-line' : 'ri-file-copy-line'} aria-hidden="true" />
                  <span>{copied ? t('home.account.copied') : t('home.account.copy')}</span>
                </button>
              </div>
              <p className="account-menu-note">
                <i className="ri-cloud-line" aria-hidden="true" />
                {t('home.account.syncOn')}
              </p>
              <Link className="account-menu-item" to="/dashboard" onClick={closePanel}>
                <i className="ri-dashboard-3-line" aria-hidden="true" />
                {t('home.dash.nav')}
              </Link>
              <Link className="account-menu-item" to="/compte" onClick={closePanel}>
                <i className="ri-user-settings-line" aria-hidden="true" />
                {t('account.title')}
              </Link>
              <button
                type="button"
                className="account-menu-item"
                onClick={() => void leaveAccount()}
              >
                <i className="ri-logout-box-r-line" aria-hidden="true" />
                {t('home.account.signOut')}
              </button>
              {signOutFailed && <p role="alert">{t('account.signOutFailure')}</p>}
            </>
          ) : (
            <button type="button" className="account-menu-item account-menu-cta" onClick={openSignIn}>
              <i className="ri-login-box-line" aria-hidden="true" />
              {t('home.account.signIn')}
            </button>
          )}

          <div className="account-menu-lang">
            <p className="account-menu-lab">{t('home.account.lang')}</p>
            <LangSwitch />
          </div>
        </div>
      )}

      {dialog && <AuthDialog initialMode={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}