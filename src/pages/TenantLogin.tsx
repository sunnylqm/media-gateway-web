import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MailCheck, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError } from '../components/Form';
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
      setError(reason instanceof Error ? reason.message : 'Unable to continue');
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
      setError(reason instanceof Error ? reason.message : 'Unable to resend the code');
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
      eyebrow="Media workspace"
      title={verification ? 'Verify your email' : 'Sign in or create an account'}
      description={verification
        ? `Enter the eight-digit code sent to ${verification.email}.`
        : 'Enter your email and password. If the email is new, your account will be created automatically.'}
    >
      <form className="auth-form" onSubmit={submit}>
        {verification ? <>
          <div className="verification-target"><MailCheck size={18} /><span>{verification.email}</span></div>
          <Field label="Verification code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} autoFocus required />
        </> : <>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Field label="Password" type="password" autoComplete="current-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} hint="Use at least 12 characters." required />
        </>}
        <FormError>{error}</FormError>
        <button className="button primary wide" disabled={busy || (Boolean(verification) && code.length !== 8)}>{busy ? 'Continuing…' : <>{verification ? 'Verify email' : 'Continue'} <ArrowRight size={17} /></>}</button>
        {verification && <div className="verification-actions">
          <button type="button" className="button secondary" onClick={() => void resend()} disabled={busy || resendIn > 0}><RotateCw size={15} />{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button>
          <button type="button" className="auth-link-button" onClick={changeEmail} disabled={busy}><ArrowLeft size={14} />Use another email</button>
        </div>}
      </form>
    </AuthShell>
  );
}
