import { useI18n } from '@/i18n';

export function Brand({
  compact = false,
  tagline = true,
}: {
  compact?: boolean;
  tagline?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span className="brand">
      <img
        className="brand-mark"
        src="/brand/mypub-mark.svg"
        alt=""
        width={52}
        height={52}
        aria-hidden="true"
      />
      {compact ? (
        <span className="sr-only">{t('brand.name')}</span>
      ) : (
        <span className="brand-copy">
          <span className="brand-name">
            mypub<span className="brand-domain">.ai</span>
          </span>
          {tagline && (
            <span className="brand-tagline">{t('brand.tagline')}</span>
          )}
        </span>
      )}
    </span>
  );
}
