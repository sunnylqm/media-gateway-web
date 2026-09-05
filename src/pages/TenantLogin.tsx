import { ArrowLeft, ArrowRight, MailCheck, RotateCw } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError } from '../components/Form';
import { useI18n } from '../i18n';
import {
  browserLocales,
  currencySymbol,
  defaultBillingCurrency,
  fallbackBillingCurrencies,
  normalizePresentation,
} from '../lib/currency';
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
  const [verification, setVerification] =
    useState<EmailVerificationRequired | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A workspace is billed in one currency for its whole life, so the choice is
  // made here, at the only moment it can be made. An existing account ignores
  // the field, which is why it is always sent.
  const [currency, setCurrency] = useState(() =>
    defaultBillingCurrency(browserLocales()),
  );
  const [currencies, setCurrencies] = useState<string[]>(
    fallbackBillingCurrencies,
  );

  // The endpoint needs a session, so a signed-out visitor keeps the built-in
  // list. It is asked anyway because a gateway that offers more currencies than
  // the two built in should still be able to say so.
  useEffect(() => {
    let active = true;
    api<unknown>('/v1/billing/currency').then(
      (value) => {
        if (!active) return;
        const offered = normalizePresentation(value).currencies;
        if (offered?.length) setCurrencies(offered);
      },
      () => {
        // No session, no list: the built-in choices stand.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (currencies.length && !currencies.includes(currency))
      setCurrency(currencies[0]);
  }, [currencies, currency]);

  useEffect(() => {
    if (!verification) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verification]);

  const resendIn = verification
    ? Math.max(
        0,
        Math.ceil((Date.parse(verification.resend_after) - clock) / 1000),
      )
    : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (verification) {
        await api<LoginResponse>('/v1/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email: verification.email, password, code }),
        });
      } else {
        const response = await api<LoginResponse | EmailVerificationRequired>(
          '/v1/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ email, password, currency }),
          },
        );
        if (
          'object' in response &&
          response.object === 'email_verification_required'
        ) {
          setVerification(response);
          return;
        }
      }
      navigate('/app', { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('login.errorContinue'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!verification || resendIn > 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await api<LoginResponse | EmailVerificationRequired>(
        '/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: verification.email,
            password,
            currency,
          }),
        },
      );
      if (
        'object' in response &&
        response.object === 'email_verification_required'
      ) {
        setVerification(response);
        setCode('');
        return;
      }
      navigate('/app', { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('login.errorResend'),
      );
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
      description={
        verification
          ? t('login.verifyDescription', { email: verification.email })
          : t('login.description')
      }
    >
      <form className="auth-form" onSubmit={submit}>
        {verification ? (
          <>
            <div className="verification-target">
              <MailCheck size={18} />
              <span>{verification.email}</span>
            </div>
            <Field
              label={t('login.code')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, '').slice(0, 8))
              }
              autoFocus
              required
            />
          </>
        ) : (
          <>
            <Field
              label={t('login.email')}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Field
              label={t('login.password')}
              type="password"
              autoComplete="current-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={t('login.passwordHint')}
              required
            />
            <label className="field">
              <span className="field-label">{t('login.currency')}</span>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {currencySymbol(code) === code
                      ? code
                      : `${code} (${currencySymbol(code)})`}
                  </option>
                ))}
              </select>
              <span className="field-hint">{t('login.currencyHint')}</span>
            </label>
          </>
        )}
        <FormError>{error}</FormError>
        <button
          className="button primary wide"
          disabled={busy || (Boolean(verification) && code.length !== 8)}
        >
          {busy ? (
            t('login.continuing')
          ) : (
            <>
              {t(verification ? 'login.verify' : 'login.continue')}{' '}
              <ArrowRight size={17} />
            </>
          )}
        </button>
        {verification && (
          <div className="verification-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => void resend()}
              disabled={busy || resendIn > 0}
            >
              <RotateCw size={15} />
              {resendIn > 0
                ? t('login.resendIn', { seconds: resendIn })
                : t('login.resend')}
            </button>
            <button
              type="button"
              className="auth-link-button"
              onClick={changeEmail}
              disabled={busy}
            >
              <ArrowLeft size={14} />
              {t('login.changeEmail')}
            </button>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
