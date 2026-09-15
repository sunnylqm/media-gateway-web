import type { ReactNode } from 'react';
import { Link } from 'react-router';
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
        <Link to="/" className="brand-home" aria-label={t('brand.home')}>
          <Brand />
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">{t('auth.storyEyebrow')}</span>
          <h1>{t('auth.storyTitle')}</h1>
          <p>{t('auth.storyBody')}</p>
        </div>
        <div className="auth-tasting-note">
          <span className="brew-note">{t('auth.brewNote')}</span>
          <ol className="brew-steps" aria-label={t('home.stepsAria')}>
            <li>{t('home.stepIdea')}</li>
            <li>{t('home.stepFrame')}</li>
            <li>{t('home.stepStory')}</li>
          </ol>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-language">
          <LanguageToggle />
        </div>
        <div className="auth-card">
          <Link
            to="/"
            className="brand-home auth-mobile-brand"
            aria-label={t('brand.home')}
          >
            <Brand />
          </Link>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
