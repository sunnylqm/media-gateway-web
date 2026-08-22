import { ArrowRight, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError } from '../components/Form';
import { useI18n } from '../i18n';

export function AdminLogin() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        '/v1/admin/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
        true,
      );
      navigate('/admin', { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('adminLogin.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t('adminLogin.eyebrow')}
      title={t('adminLogin.title')}
      description={t('adminLogin.description')}
    >
      <div className="security-note">
        <ShieldCheck size={17} />
        <span>{t('adminLogin.singleMode')}</span>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <Field
          label={t('adminLogin.email')}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Field
          label={t('adminLogin.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <FormError>{error}</FormError>
        <button className="button primary wide" disabled={busy}>
          {busy ? (
            t('adminLogin.verifying')
          ) : (
            <>
              {t('adminLogin.continue')} <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      <Link className="admin-entry" to="/app/login">
        {t('adminLogin.back')}
      </Link>
    </AuthShell>
  );
}
