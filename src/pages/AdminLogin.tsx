import { useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { AuthShell } from '../components/AuthShell';
import { Field, FormError } from '../components/Form';

export function AdminLogin() {
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
      await api('/v1/admin/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }, true);
      navigate('/admin', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Restricted system" title="Administrator access" description="This surface controls every tenant. Activity is recorded in the system audit trail.">
      <div className="security-note"><ShieldCheck size={17} /><span>Single administrator mode</span></div>
      <form className="auth-form" onSubmit={submit}>
        <Field label="Administrator email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <FormError>{error}</FormError>
        <button className="button primary wide" disabled={busy}>{busy ? 'Verifying…' : <>Continue securely <ArrowRight size={17} /></>}</button>
      </form>
      <Link className="admin-entry" to="/app/login">Return to workspace sign in</Link>
    </AuthShell>
  );
}
