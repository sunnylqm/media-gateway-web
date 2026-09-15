import { ArrowRight, ArrowUpRight, Image, Pause, Play } from 'lucide-react';
import { Link } from 'react-router';
import { Brand } from '../components/Brand';
import { AmbientBackground } from '../components/home/AmbientBackground';
import { LanguageToggle } from '../components/LanguageSwitch';
import { useI18n } from '../i18n';
import { mediaURL } from '../lib/ambient';
import { creationPath } from '../lib/brand';
import { studioEnabled } from '../lib/studio/config';
import { useAmbientMotion } from '../lib/useAmbientMotion';
import '../styles/immersive-home.css';

const videoSrc = mediaURL(import.meta.env.VITE_HOME_VIDEO_URL);
const posterSrc = mediaURL(import.meta.env.VITE_HOME_POSTER_URL);

// This public doorway owns no session, billing, or generation requests.
// Only its decorative background is viewport-sized; content can reflow at zoom.
export function Home() {
  const { t } = useI18n();
  const { paused, reducedMotion, moving, toggle } = useAmbientMotion();
  const motionLabel = reducedMotion
    ? t('home.staticMotion')
    : paused
      ? t('home.resumeMotion')
      : t('home.pauseMotion');

  return (
    <div className="home-stage">
      <AmbientBackground
        key={`${videoSrc ?? 'stars'}-${reducedMotion}`}
        moving={moving}
        reducedMotion={reducedMotion}
        videoSrc={videoSrc}
        posterSrc={posterSrc}
      />
      <a className="home-skip" href="#home-content">
        {t('home.skip')}
      </a>
      <header className="home-header">
        <Link to="/" className="brand-home" aria-label={t('brand.home')}>
          <Brand />
        </Link>
        <nav className="home-header-actions" aria-label={t('home.navigation')}>
          <LanguageToggle />
          <Link to="/app" className="home-workspace">
            {t('home.workspace')}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="home-content" className="home-main" tabIndex={-1}>
        <div className="home-copy">
          <span className="home-kicker">{t('home.eyebrow')}</span>
          <h1>
            <span>{t('home.titleLead')}</span> <span>{t('home.titleEnd')}</span>
          </h1>
          <p className="home-intro">{t('home.description')}</p>
          <div className="home-actions">
            <Link className="home-create" to={creationPath(studioEnabled)}>
              {t('home.create')}
              <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
            <Link className="home-explore" to="/app/plaza">
              {t('home.explore')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="home-footer">
        <div className="home-footer-copy">
          <p>{t('home.note')}</p>
          <small>&copy; {new Date().getFullYear()} CHARMLOT PTE. LTD.</small>
        </div>
        <div className="home-utilities">
          <Link className="home-image-link" to="/app/image">
            <Image size={16} aria-hidden="true" />
            {t('home.imageAction')}
          </Link>
          <button
            type="button"
            className="home-motion"
            onClick={toggle}
            disabled={reducedMotion}
            aria-label={motionLabel}
          >
            {paused && !reducedMotion ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
            <span>{motionLabel}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
