import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import { authErrorKey } from '@/lib/authError';

type Props = {
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
};

type Status = 'idle' | 'loading' | 'error' | 'sent';

export default function AuthDialog({ initialMode = 'signin', onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn, signUp, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const explain = (raw: string) => {
    const key = authErrorKey(raw);
    return key ? t(key) : raw;
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setStatus('idle');
    setMessage('');
    setUnconfirmed(false);
  };

  const resend = async () => {
    setStatus('loading');
    const error = await resendConfirmation(email.trim());
    setUnconfirmed(false);
    if (error) {
      setStatus('error');
      setMessage(explain(error));
      return;
    }
    setStatus('sent');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setStatus('error');
      setMessage(t('home.account.errEmail'));
      return;
    }
    if (password.length < 6) {
      setStatus('error');
      setMessage(t('home.account.errPassword'));
      return;
    }

    setStatus('loading');
    setMessage('');
    setUnconfirmed(false);

    if (mode === 'signin') {
      const error = await signIn(cleanEmail, password);
      if (error) {
        setStatus('error');
        setMessage(explain(error));
        setUnconfirmed(error.toLowerCase().includes('not confirmed'));
        return;
      }
      setStatus('idle');
      onClose();
      navigate('/dashboard', { replace: true });
      return;
    }

    const outcome = await signUp(cleanEmail, password);
    if (outcome.error) {
      setStatus('error');
      setMessage(explain(outcome.error));
      return;
    }
    if (outcome.needsConfirmation) {
      setStatus('sent');
      setPassword('');
      return;
    }
    setStatus('idle');
    onClose();
    navigate('/dashboard', { replace: true });
  };

  return createPortal(
    <div
      className="auth-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'signin' ? t('home.account.titleIn') : t('home.account.titleUp')}
    >
      <button type="button" className="auth-backdrop" aria-label={t('home.account.close')} onClick={onClose} />
      <div className="auth-card">
        <button type="button" className="auth-x" onClick={onClose} aria-label={t('home.account.close')}>
          <i className="ri-close-line" aria-hidden="true" />
        </button>

        <span className="auth-brand">MarketHunter AI</span>
        <h2>{mode === 'signin' ? t('home.account.titleIn') : t('home.account.titleUp')}</h2>
        <p className="auth-intro">{t('home.account.intro')}</p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab${mode === 'signin' ? ' is-on' : ''}`}
            onClick={() => switchMode('signin')}
          >
            {t('home.account.signIn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab${mode === 'signup' ? ' is-on' : ''}`}
            onClick={() => switchMode('signup')}
          >
            {t('home.account.signUp')}
          </button>
        </div>

        {status === 'sent' ? (
          <div className="auth-sent">
            <i className="ri-mail-check-line" aria-hidden="true" />
            <p>{t('home.account.confirmSent', { email: email.trim() })}</p>
            <button type="button" className="auth-submit" onClick={() => switchMode('signin')}>
              {t('home.account.goSignIn')}
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field">
              <span>{t('home.account.email')}</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('home.account.emailPh')}
                required
              />
            </label>
            <label className="auth-field">
              <span>{t('home.account.password')}</span>
              <input
                type="password"
                name="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
              <em>{t('home.account.passwordHint')}</em>
            </label>

            {status === 'error' && (
              <p className="auth-msg is-error" role="alert">
                <i className="ri-error-warning-line" aria-hidden="true" />
                {message}
              </p>
            )}
            {status === 'error' && unconfirmed && (
              <button type="button" className="auth-submit" onClick={resend}>
                <i className="ri-mail-send-line" aria-hidden="true" />
                {t('home.account.resend')}
              </button>
            )}

            <button type="submit" className="auth-submit" disabled={status === 'loading'}>
              {status === 'loading' ? (
                <>
                  <i className="ri-loader-4-line auth-spin" aria-hidden="true" />
                  {t('home.account.submitting')}
                </>
              ) : (
                <>
                  <i className={mode === 'signin' ? 'ri-login-box-line' : 'ri-user-add-line'} aria-hidden="true" />
                  {mode === 'signin' ? t('home.account.submitIn') : t('home.account.submitUp')}
                </>
              )}
            </button>

            <p className="auth-note">
              <i className="ri-shield-check-line" aria-hidden="true" />
              {t('home.account.note')}
            </p>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}