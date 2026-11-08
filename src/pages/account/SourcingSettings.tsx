import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { accountErrorKey } from '@/lib/accountAccess';
import { supabase } from '@/lib/supabase';

type Status = { configured: boolean; scheduled: boolean };
function parseStatus(value: unknown): Status {
  if (!value || typeof value !== 'object' || !('configured' in value) || !('scheduled' in value) ||
    typeof value.configured !== 'boolean' || typeof value.scheduled !== 'boolean') {
    throw new Error('invalid-account-response');
  }
  return { configured: value.configured, scheduled: value.scheduled };
}

export default function SourcingSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const saving = useRef(false);

  useEffect(() => {
    active.current = true;
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('admin_sourcing_status');
        if (rpcError) throw rpcError;
        const next = parseStatus(data);
        if (active.current) setStatus(next);
      } catch (failure) {
        if (active.current) setError(accountErrorKey(failure));
      }
    })();
    return () => { active.current = false; };
  }, []);

  const save = async () => {
    if (saving.current) return;
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(key.trim())) {
      setError('account.sourcing.invalidKey');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    const submitted = key.trim();
    setKey('');
    try {
      const { error: saveError } = await supabase.rpc('admin_save_rainforest_key', { p_key: submitted });
      if (saveError) throw saveError;
      if (!active.current) return;
      setSaved(true);
      const { data, error: statusError } = await supabase.rpc('admin_sourcing_status');
      if (statusError) throw statusError;
      if (active.current) setStatus(parseStatus(data));
    } catch (failure) {
      if (active.current) setError(accountErrorKey(failure));
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  };

  return (
    <section className="account-panel">
      <h2>{t('account.sourcing.title')}</h2>
      <p>{t('account.sourcing.info')}</p>
      {status && <p role="status">
        {t(status.configured ? 'account.sourcing.configured' : 'account.sourcing.missing')}
        {' '}{t(status.scheduled ? 'account.sourcing.active' : 'account.sourcing.paused')}
      </p>}
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="rainforest-key">{t('account.sourcing.key')}</label>
        <input id="rainforest-key" type="password" value={key} autoComplete="new-password"
          spellCheck={false} disabled={busy} maxLength={256} required
          onChange={(event) => { setKey(event.target.value); setSaved(false); }} />
        <button type="submit" disabled={busy || !key.trim()}>{t('account.save')}</button>
      </form>
      {saved && <p role="status">{t('account.sourcing.saved')}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
