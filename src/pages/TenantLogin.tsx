import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MailCheck, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError } from '../components/Form';
import { useI18n } from '../i18n';
import type { IdentityProfile } from '../types';

type LoginResponse = {
  profile: IdentityProfile;
  expires_at: string;
};

type EmailVerificationRequired = {
  object: 'email_verification_required';
  email: string;
  expires_at: string;
  resend_after: string;
};

export function TenantLogin() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verification, setVerification] = useState<EmailVerificationRequired | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!verification) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verification]);

  const resendIn = verification
    ? Math.max(0, Math.ceil((Date.parse(verification.resend_after) - clock) / 1000))
    : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (verification) {
        await api<LoginResponse>('/v1/auth/verify-email', {
          method: 'POST', body: JSON.stringify({ email: verification.email, password, code }),
        });
      } else {
        const response = await api<LoginResponse | EmailVerificationRequired>('/v1/auth/login', {
          method: 'POST', body: JSON.stringify({ email, password }),
        });
        if ('object' in response && response.object === 'email_verification_required') {
          setVerification(response);
          return;
        }
      }
      navigate('/app', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('login.errorContinue'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!verification || resendIn > 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await api<LoginResponse | EmailVerificationRequired>('/v1/auth/login', {
        method: 'POST', body: JSON.stringify({ email: verification.email, password }),
      });
      if ('object' in response && response.object === 'email_verification_required') {
        setVerification(response);
        setCode('');
        return;
      }
      navigate('/app', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('login.errorResend'));
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    setVerification(null);
    setCode('');
    setPassword('');
    setError('');
  }

  return (
    <AuthShell
      eyebrow={t('login.eyebrow')}
      title={t(verification ? 'login.verifyTitle' : 'login.title')}
      description={verification
        ? t('login.verifyDescription', { email: verification.email })
        : t('login.description')}
    >
      <form className="auth-form" onSubmit={submit}>
        {verification ? <>
          <div className="verification-target"><MailCheck size={18} /><span>{verification.email}</span></div>
          <Field label={t('login.code')} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} autoFocus required />
        </> : <>
          <Field label={t('login.email')} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Field label={t('login.password')} type="password" autoComplete="current-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} hint={t('login.passwordHint')} required />
        </>}
        <FormError>{error}</FormError>
        <button className="button primary wide" disabled={busy || (Boolean(verification) && code.length !== 8)}>{busy ? t('login.continuing') : <>{t(verification ? 'login.verify' : 'login.continue')} <ArrowRight size={17} /></>}</button>
        {verification && <div className="verification-actions">
          <button type="button" className="button secondary" onClick={() => void resend()} disabled={busy || resendIn > 0}><RotateCw size={15} />{resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resend')}</button>
          <button type="button" className="auth-link-button" onClick={changeEmail} disabled={busy}><ArrowLeft size={14} />{t('login.changeEmail')}</button>
        </div>}
      </form>
    </AuthShell>
  );
}
