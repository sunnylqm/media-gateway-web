import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Brand } from './Brand';
import { LanguageToggle } from './LanguageSwitch';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label={t('auth.storyAria')}>
        <Brand />
        <div className="auth-story-copy">
          <span className="eyebrow">{t('auth.storyEyebrow')}</span>
          <h1>{t('auth.storyTitle')}</h1>
          <p>{t('auth.storyBody')}</p>
        </div>
        <div className="signal-card" aria-hidden="true">
          <div className="signal-row"><span>{t('auth.signalGateway')}</span><b>{t('auth.signalOperational')}</b></div>
          <div className="signal-track"><i /></div>
          <div className="signal-meta"><span>{t('auth.signalImage')}</span><span>{t('auth.signalVideo')}</span><span>{t('auth.signalAudit')}</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-language"><LanguageToggle /></div>
        <div className="auth-card">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
