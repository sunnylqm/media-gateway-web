import { Aperture } from 'lucide-react';
import { useI18n } from '@/i18n';

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="brand" aria-label={t('brand.name')}>
      <span className="brand-mark"><Aperture size={19} strokeWidth={2.2} /></span>
      {!compact && <span className="brand-name">{t('brand.name')}</span>}
    </div>
  );
}
