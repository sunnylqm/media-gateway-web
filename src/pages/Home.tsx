import { ArrowRight, ArrowUpRight, Film, Image, Lightbulb } from 'lucide-react';
import { Link } from 'react-router';
import { Brand } from '../components/Brand';
import { LanguageToggle } from '../components/LanguageSwitch';
import { useI18n } from '../i18n';
import { creationPath } from '../lib/brand';
import { studioEnabled } from '../lib/studio/config';

// Public introduction only. Existing authenticated routes own creation,
// generation, billing, and session handling; this page makes no API calls.
export function Home() {
  const { t } = useI18n();
  const createTo = creationPath(studioEnabled);
  const tools = [
    {
      key: 'video',
      icon: Film,
      title: t('home.videoTitle'),
      body: t('home.videoBody'),
      action: t('home.videoAction'),
      to: createTo,
    },
    {
      key: 'image',
      icon: Image,
      title: t('home.imageTitle'),
      body: t('home.imageBody'),
      action: t('home.imageAction'),
      to: '/app/image',
    },
    {
      key: 'gallery',
      icon: Lightbulb,
      title: t('home.galleryTitle'),
      body: t('home.galleryBody'),
      action: t('home.galleryAction'),
      to: '/app/plaza',
    },
  ];

  return (
    <div className="pub-home">
      <a className="pub-skip" href="#home-content">
        {t('home.skip')}
      </a>
      <header className="pub-header">
        <Link to="/" className="brand-home" aria-label={t('brand.home')}>
          <Brand />
        </Link>
        <nav className="pub-header-actions" aria-label={t('home.navigation')}>
          <LanguageToggle />
          <Link to="/app" className="button secondary">
            {t('home.workspace')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="home-content" tabIndex={-1}>
        <section className="pub-hero" aria-labelledby="home-title">
          <div className="pub-hero-copy">
            <span className="pub-eyebrow">
              <span className="pub-dot" aria-hidden="true" />
              {t('home.eyebrow')}
            </span>
            <h1 id="home-title">{t('home.title')}</h1>
            <p className="pub-intro">{t('home.description')}</p>
            <div className="pub-hero-actions">
              <Link to={createTo} className="button primary">
                {t('home.create')}
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/app/plaza" className="pub-text-link">
                {t('home.explore')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="pub-small-note">{t('home.note')}</p>
          </div>

          <div className="pub-art" aria-hidden="true">
            <span className="pub-bubble pub-bubble-one" />
            <span className="pub-bubble pub-bubble-two" />
            <span className="pub-bubble pub-bubble-three" />
            <div className="pub-coaster">
              <span className="pub-coaster-label">{t('home.coaster')}</span>
              <img
                src="/brand/mypub-mark.svg"
                alt=""
                width={220}
                height={220}
              />
              <strong>{t('home.illustration')}</strong>
              <span className="pub-coaster-rule" />
              <span className="pub-coaster-signature">mypub.ai</span>
            </div>
            <div className="pub-story-ticket">
              <Film size={20} />
              <span>{t('home.story')}</span>
            </div>
          </div>
        </section>

        <ol className="pub-process" aria-label={t('home.stepsAria')}>
          <li>
            <span>01</span>
            {t('home.stepIdea')}
          </li>
          <li>
            <span>02</span>
            {t('home.stepFrame')}
          </li>
          <li>
            <span>03</span>
            {t('home.stepStory')}
          </li>
        </ol>

        <section className="pub-tools" aria-labelledby="home-tools-title">
          <div className="pub-section-heading">
            <span className="eyebrow">{t('home.toolsEyebrow')}</span>
            <h2 id="home-tools-title">{t('home.toolsTitle')}</h2>
          </div>
          <div className="pub-tool-grid">
            {tools.map(({ key, icon: Icon, title, body, action, to }) => (
              <Link to={to} className="pub-tool" key={key}>
                <span className="pub-tool-icon">
                  <Icon size={23} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
                <span className="pub-tool-action">
                  {action}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="pub-closing" aria-labelledby="home-closing-title">
          <h2 id="home-closing-title">{t('home.closing')}</h2>
          <p>{t('home.closingBody')}</p>
          <Link to={createTo} className="button primary">
            {t('home.create')}
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="pub-footer">
        <Brand />
        <span>&copy; {new Date().getFullYear()} CHARMLOT PTE. LTD.</span>
      </footer>
    </div>
  );
}
