import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

const FORM_URL = 'https://readdy.ai/api/form/dbjnp719sb2grpr1c14g';
const PLAN_IDS = ['starter', 'pro', 'agency', 'ent'] as const;

export default function Contact() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [formError, setFormError] = useState('');
  const [count, setCount] = useState(0);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const trap = String(fd.get('website_alt') || '').trim();
    if (trap) { setStatus('ok'); return; }
    fd.delete('website_alt');
    const msg = String(fd.get('message') || '');
    if (msg.length > 500) { setFormError(t('home.contact.tooLong')); setStatus('err'); return; }
    const params = new URLSearchParams();
    fd.forEach((val, key) => params.append(key, String(val)));
    setStatus('sending'); setFormError('');
    try {
      const response = await fetch(FORM_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      const responseText = await response.text();
      let parsed: { code?: string; message?: string; meta?: { message?: string; detail?: string } } | null = null;
      try { parsed = JSON.parse(responseText); } catch { parsed = null; }
      const serverMsg = parsed?.meta?.message || parsed?.message || parsed?.meta?.detail || responseText;
      if (response.ok && parsed?.code === 'OK' && !/spam/i.test(serverMsg || '')) {
        setStatus('ok'); form.reset(); setCount(0);
      } else {
        setFormError(serverMsg || t('home.contact.generic')); setStatus('err');
      }
    } catch {
      setFormError(t('home.contact.network')); setStatus('err');
    }
  };

  return (
    <section className="panel" data-side="left" id="contact">
      <img
        className="panel-bg"
        data-parallax="0.32"
        alt="Glass panel glowing amber in a dark studio, contact MarketHunter AI"
        src="https://readdy.ai/api/search-image?query=Dark%20smoky%20studio%20with%20a%20thin%20upright%20glass%20pane%20lit%20by%20a%20magenta%20rim%20light%20and%20soft%20amber%20glow%2C%20main%20subject%20in%20the%20right%20third%20of%20the%20frame%2C%20the%20left%20half%20calm%20empty%20dark%20haze%2C%20cinematic%20cool%20slate%20grade%2C%20wide%20shot&width=2400&height=1350&seq=mh-panel-contact&orientation=landscape"
      />
      <div className="panel-veil" />
      <div className="panel-copy" data-parallax="-0.08" style={{ maxWidth: 'min(620px, 100%)', width: '100%' }}>
        <p className="stamp" data-reveal>{t('home.contact.stamp')}</p>
        <h2 data-reveal dangerouslySetInnerHTML={{ __html: t('home.contact.title') }} />
        <a className="mail-link" href="mailto:hello@markethunter.ai" data-reveal>hello@markethunter.ai <i className="ri-arrow-right-up-line" /></a>
        <form id="markethunter-contact" className="form-card" data-readdy-form onSubmit={onSubmit} data-reveal>
          <div className="form-row">
            <label className="field">{t('home.contact.name')}<input name="name" required placeholder={t('home.contact.phName')} /></label>
            <label className="field">{t('home.contact.email')}<input type="email" name="email" required placeholder={t('home.contact.phEmail')} /></label>
          </div>
          <div className="form-row">
            <label className="field">{t('home.contact.company')}<input name="company" placeholder={t('home.contact.phCompany')} /></label>
            <label className="field">{t('home.contact.plan')}
              <select name="plan" defaultValue="Pro">
                {PLAN_IDS.map((id) => <option key={id} value={t(`home.plan.${id}.name`)}>{t(`home.plan.${id}.name`)}</option>)}
              </select>
            </label>
          </div>
          <label className="field">{t('home.contact.message')}
            <textarea name="message" maxLength={500} placeholder={t('home.contact.phMessage')} onChange={(e) => setCount(e.target.value.length)} />
          </label>
          <input type="text" name="website_alt" className="aux-field" tabIndex={-1} autoComplete="off" aria-hidden="true" readOnly onFocus={(e) => { e.currentTarget.readOnly = false; }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="stamp" style={{ color: 'var(--muted)' }}>{count}/500</span>
            <button type="submit" className="btn" disabled={status === 'sending'}>
              {status === 'sending' ? t('home.contact.sending') : t('home.contact.submit')} <i className="ri-arrow-right-line" />
            </button>
          </div>
          {status === 'ok' && <p className="form-msg ok">{t('home.contact.ok')}</p>}
          {status === 'err' && <p className="form-msg err">{formError}</p>}
        </form>
      </div>
    </section>
  );
}