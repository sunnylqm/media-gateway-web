import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n } from '@/i18n';
import { creationPath } from '../lib/brand';
import { studioEnabled } from '../lib/studio/config';

export function CreationEntry() {
  const { t } = useI18n();
  return (
    <section className="creation-entry" aria-labelledby="creation-entry-title">
      <div>
        <span className="eyebrow">{t('entry.eyebrow')}</span>
        <h2 id="creation-entry-title">{t('entry.title')}</h2>
        <p>{t('entry.description')}</p>
      </div>
      <Link className="button primary" to={creationPath(studioEnabled)}>
        {t('home.create')}
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
